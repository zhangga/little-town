package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	PracticeBricksPerRound = 4
	PracticeCoinsPerRound  = 12
	PracticeDailyRounds    = 3
)

var (
	ErrPracticeTicket     = errors.New("本轮复习已失效，请重新开始一轮")
	ErrPracticeIncomplete = errors.New("请先完成本轮所有单词，再领取奖励")
)

type PracticeRewards struct {
	BricksPerRound  int `json:"bricks_per_round"`
	CoinsPerRound   int `json:"coins_per_round"`
	DailyRoundCap   int `json:"daily_round_cap"`
	RewardedRounds  int `json:"rewarded_rounds"`
	RemainingRounds int `json:"remaining_rounds"`
}

type PracticeResult struct {
	BricksEarned     int              `json:"bricks_earned"`
	CoinsEarned      int              `json:"coins_earned"`
	TotalBricks      int              `json:"total_bricks"`
	TotalCoins       int              `json:"total_coins"`
	RoundBricks      int              `json:"round_bricks"`
	RoundCoins       int              `json:"round_coins"`
	Capped           bool             `json:"capped"`
	AlreadyCompleted bool             `json:"already_completed"`
	PracticeRewards  *PracticeRewards `json:"practice_rewards"`
}

type practiceClaims struct {
	UserID  uint   `json:"user_id"`
	Day     string `json:"day"`
	WordIDs []uint `json:"word_ids"`
	jwt.RegisteredClaims
}

type PracticeService struct {
	db  *gorm.DB
	key []byte
}

func NewPracticeService(db *gorm.DB, secret string) *PracticeService {
	// 题组票据使用独立签名密钥，不能被当成普通登录凭证。
	key := sha256.Sum256([]byte("little-town/practice:" + secret))
	return &PracticeService{db: db, key: key[:]}
}

// NewTicket 在下发题组时签发，绑定用户、当天日期和有效单词；读取不写学习记录。
func (s *PracticeService) NewTicket(userID uint, wordIDs []uint) (string, error) {
	if userID == 0 || len(wordIDs) == 0 {
		return "", ErrPracticeTicket
	}
	seen := make(map[uint]bool, len(wordIDs))
	for _, id := range wordIDs {
		if id == 0 || seen[id] {
			return "", ErrPracticeTicket
		}
		seen[id] = true
	}
	var nonce [16]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return "", err
	}
	now := time.Now()
	claims := practiceClaims{UserID: userID, Day: now.Format("2006-01-02"), WordIDs: wordIDs,
		RegisteredClaims: jwt.RegisteredClaims{Issuer: "little-town/practice", ID: hex.EncodeToString(nonce[:]),
			IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(DayEnd(now))}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.key)
}

func (s *PracticeService) parseTicket(userID uint, token string) (*practiceClaims, error) {
	claims := &practiceClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (interface{}, error) { return s.key, nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer("little-town/practice"), jwt.WithExpirationRequired())
	if err != nil || !parsed.Valid || claims.UserID != userID || claims.Day != TodayString() || claims.ID == "" || len(claims.WordIDs) == 0 {
		return nil, ErrPracticeTicket
	}
	return claims, nil
}

func (s *PracticeService) Status(userID uint) (*PracticeRewards, error) {
	return practiceStatus(s.db, userID)
}

func practiceStatus(db *gorm.DB, userID uint) (*PracticeRewards, error) {
	var count int64
	if err := db.Model(&models.PracticeRound{}).Where("user_id = ? AND day = ? AND rewarded = ?", userID, TodayString(), true).Count(&count).Error; err != nil {
		return nil, err
	}
	return &PracticeRewards{BricksPerRound: PracticeBricksPerRound, CoinsPerRound: PracticeCoinsPerRound,
		DailyRoundCap: PracticeDailyRounds, RewardedRounds: int(count), RemainingRounds: max(0, PracticeDailyRounds-int(count))}, nil
}

// withRound 与学习、购买和建造共用用户行锁；所有副本共享进度和每日限额。
func (s *PracticeService) withRound(userID uint, token string, apply func(*gorm.DB, *models.User, *models.PracticeRound, *practiceClaims) error) error {
	claims, err := s.parseTicket(userID, token)
	if err != nil {
		return err
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		if claims.Day != TodayString() {
			return ErrPracticeTicket
		}
		var round models.PracticeRound
		err := tx.First(&round, "id = ?", claims.ID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			round = models.PracticeRound{ID: claims.ID, UserID: userID, Day: claims.Day, AnsweredWords: "[]"}
			if err := tx.Create(&round).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		if round.UserID != userID || round.Day != claims.Day {
			return ErrPracticeTicket
		}
		return apply(tx, &user, &round, claims)
	})
}

// Answer 仅记录本轮答过的单词；错词巩固不重复计数，也不在单题阶段发奖。
func (s *PracticeService) Answer(userID uint, token string, wordID uint) error {
	return s.withRound(userID, token, func(tx *gorm.DB, _ *models.User, round *models.PracticeRound, claims *practiceClaims) error {
		valid := false
		for _, id := range claims.WordIDs {
			if id == wordID {
				valid = true
				break
			}
		}
		if !valid {
			return ErrPracticeTicket
		}
		if round.Completed {
			return nil
		}
		var answered []uint
		if err := json.Unmarshal([]byte(round.AnsweredWords), &answered); err != nil {
			return err
		}
		for _, id := range answered {
			if id == wordID {
				return nil
			}
		}
		answered = append(answered, wordID)
		encoded, err := json.Marshal(answered)
		if err != nil {
			return err
		}
		return tx.Model(round).Update("answered_words", string(encoded)).Error
	})
}

func (s *PracticeService) Complete(userID uint, token string) (*PracticeResult, error) {
	result := &PracticeResult{}
	err := s.withRound(userID, token, func(tx *gorm.DB, user *models.User, round *models.PracticeRound, claims *practiceClaims) error {
		status, err := practiceStatus(tx, userID)
		if err != nil {
			return err
		}
		result.AlreadyCompleted = round.Completed
		if !round.Completed {
			var answered []uint
			if err := json.Unmarshal([]byte(round.AnsweredWords), &answered); err != nil {
				return err
			}
			if len(answered) != len(claims.WordIDs) {
				return ErrPracticeIncomplete
			}
			round.Completed = true
			if status.RemainingRounds > 0 {
				round.Rewarded = true
				result.BricksEarned, result.CoinsEarned = PracticeBricksPerRound, PracticeCoinsPerRound
				user.Bricks += result.BricksEarned
				user.Coins += result.CoinsEarned
				if err := tx.Model(user).Updates(map[string]interface{}{"bricks": user.Bricks, "coins": user.Coins}).Error; err != nil {
					return err
				}
				status.RewardedRounds++
				status.RemainingRounds--
			}
			if err := tx.Save(round).Error; err != nil {
				return err
			}
		}
		if round.Rewarded {
			result.RoundBricks, result.RoundCoins = PracticeBricksPerRound, PracticeCoinsPerRound
		}
		result.Capped = !round.Rewarded && status.RemainingRounds == 0
		result.TotalBricks, result.TotalCoins = user.Bricks, user.Coins
		result.PracticeRewards = status
		return nil
	})
	return result, err
}
