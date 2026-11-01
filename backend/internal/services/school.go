package services

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"github.com/zhangga/little-town/backend/internal/config"
	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrSchoolRound      = errors.New("这轮学习信息无效，请回教室重新开始")
	ErrSchoolExpired    = errors.New("这轮学习已跨天，已到账奖励保留，请开始今天的新一轮")
	ErrSchoolIncomplete = errors.New("请先完成这一轮的全部题目")
	schoolRoundID       = regexp.MustCompile(`^[a-f0-9]{32}$`)
)

type SchoolQuestion struct {
	Key         string `json:"key"`
	Kind        string `json:"kind"`
	Word        string `json:"word,omitempty"`
	Translation string `json:"translation,omitempty"`
	WordID      uint   `json:"word_id,omitempty"`
}
type SchoolStart struct {
	RoundID   string           `json:"round_id"`
	Subject   string           `json:"subject"`
	Kind      string           `json:"kind"`
	Questions []SchoolQuestion `json:"questions"`
}
type SchoolAnswer struct {
	Answered bool `json:"answered"`
	Correct  bool `json:"correct"`
}
type SchoolResult struct {
	RoundID     string         `json:"round_id"`
	RoundBricks int            `json:"round_bricks"`
	RoundCoins  int            `json:"round_coins"`
	TotalBricks int            `json:"total_bricks"`
	TotalCoins  int            `json:"total_coins"`
	Completed   bool           `json:"completed"`
	Rewards     *SchoolRewards `json:"rewards"`
}
type SchoolService struct {
	db   *gorm.DB
	goal int
}

func NewSchoolService(db *gorm.DB, goal int) *SchoolService {
	if goal < 1 {
		goal = config.DefaultDailyWordCount
	}
	return &SchoolService{db: db, goal: goal}
}
func validSchoolSubject(subject string) bool {
	return subject == "chinese" || subject == "math" || subject == "english"
}

func (s *SchoolService) prepare(req SchoolStart) (string, error) {
	if !schoolRoundID.MatchString(req.RoundID) || !validSchoolSubject(req.Subject) || (req.Kind != "learning" && req.Kind != "practice") || len(req.Questions) == 0 || len(req.Questions) > 40 {
		return "", ErrSchoolRound
	}
	if req.Kind == "practice" && len(req.Questions) != s.goal {
		return "", ErrSchoolRound
	}
	questions := make([]SchoolQuestion, len(req.Questions))
	for i, q := range req.Questions {
		if len(q.Key) == 0 || len(q.Key) > 2000 || len(q.Word) > 240 || len(q.Translation) > 600 {
			return "", ErrSchoolRound
		}
		if q.Kind != "writing" && q.Kind != "number" && q.Kind != "spell" && q.Kind != "choice" && q.Kind != "order" {
			return "", ErrSchoolRound
		}
		if q.Kind == "writing" && req.Subject != "chinese" {
			return "", ErrSchoolRound
		}
		q.WordID = 0 // Never trust a submitted catalog ID.
		if req.Subject == "english" && q.Word != "" {
			q.Word = strings.ToLower(strings.Join(strings.Fields(q.Word), " "))
			q.Translation = strings.TrimSpace(q.Translation)
			var word models.Word
			err := s.db.Where("LOWER(word) = ? AND translation = ? AND subject = ?", q.Word, q.Translation, "english").Order("id").First(&word).Error
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return "", err
			}
			q.WordID = word.ID
			q.Key = "vocabulary:" + q.Word + "|" + q.Translation
		}
		hash := sha256.Sum256([]byte(q.Key))
		q.Key = hex.EncodeToString(hash[:])
		questions[i] = q
	}
	encoded, err := json.Marshal(questions)
	return string(encoded), err
}

func (s *SchoolService) result(tx *gorm.DB, user *models.User, round *models.SchoolRound) (*SchoolResult, error) {
	status, err := s.status(tx, user, round.Subject)
	return &SchoolResult{RoundID: round.ID, RoundBricks: round.Bricks, RoundCoins: round.Coins,
		TotalBricks: user.Bricks, TotalCoins: user.Coins, Completed: round.Completed, Rewards: status}, err
}

func (s *SchoolService) Start(userID uint, req SchoolStart) (*SchoolResult, error) {
	questions, err := s.prepare(req)
	if err != nil {
		return nil, err
	}
	var result *SchoolResult
	err = s.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		var round models.SchoolRound
		err := tx.First(&round, "id = ?", req.RoundID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			answers, _ := json.Marshal(make([]SchoolAnswer, len(req.Questions)))
			round = models.SchoolRound{ID: req.RoundID, UserID: userID, Day: TodayString(), Subject: req.Subject, Kind: req.Kind, Questions: questions, Answers: string(answers)}
			if err := tx.Create(&round).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		if round.UserID != userID || round.Subject != req.Subject || round.Kind != req.Kind || round.Questions != questions {
			return ErrSchoolRound
		}
		if round.Day != TodayString() {
			return ErrSchoolExpired
		}
		result, err = s.result(tx, &user, &round)
		return err
	})
	return result, err
}

func (s *SchoolService) withRound(userID uint, id string, apply func(*gorm.DB, *models.User, *models.SchoolRound, []SchoolQuestion, []SchoolAnswer) error) (*SchoolResult, error) {
	if !schoolRoundID.MatchString(id) {
		return nil, ErrSchoolRound
	}
	var result *SchoolResult
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		var round models.SchoolRound
		if err := tx.Where("id = ? AND user_id = ?", id, userID).First(&round).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrSchoolRound
			}
			return err
		}
		if round.Day != TodayString() {
			return ErrSchoolExpired
		}
		var questions []SchoolQuestion
		var answers []SchoolAnswer
		if err := json.Unmarshal([]byte(round.Questions), &questions); err != nil {
			return err
		}
		if err := json.Unmarshal([]byte(round.Answers), &answers); err != nil {
			return err
		}
		if len(questions) == 0 || len(questions) != len(answers) {
			return ErrSchoolRound
		}
		if err := apply(tx, &user, &round, questions, answers); err != nil {
			return err
		}
		encoded, err := json.Marshal(answers)
		if err != nil {
			return err
		}
		round.Answers = string(encoded)
		if err := tx.Save(&round).Error; err != nil {
			return err
		}
		result, err = s.result(tx, &user, &round)
		return err
	})
	return result, err
}

func (s *SchoolService) Answer(userID uint, id string, index int, correct bool) (*SchoolResult, error) {
	return s.withRound(userID, id, func(tx *gorm.DB, user *models.User, round *models.SchoolRound, questions []SchoolQuestion, answers []SchoolAnswer) error {
		if index < 0 || index >= len(answers) {
			return ErrSchoolRound
		}
		if answers[index].Answered || round.Completed {
			return nil
		}
		answers[index] = SchoolAnswer{Answered: true, Correct: correct}
		if round.Kind == "learning" {
			return s.grantSchoolAnswer(tx, user, round, questions[index], correct)
		}
		return nil
	})
}

func (s *SchoolService) Complete(userID uint, id string) (*SchoolResult, error) {
	return s.withRound(userID, id, func(tx *gorm.DB, user *models.User, round *models.SchoolRound, _ []SchoolQuestion, answers []SchoolAnswer) error {
		if round.Completed {
			return nil
		}
		for _, answer := range answers {
			if !answer.Answered {
				return ErrSchoolIncomplete
			}
		}
		if round.Kind == "practice" {
			status, err := schoolPracticeStatus(tx, userID, round.Subject)
			if err != nil {
				return err
			}
			if status.RemainingRounds > 0 {
				round.Rewarded = true
				round.Bricks = PracticeBricksPerRound
				round.Coins = PracticeCoinsPerRound
				user.Bricks += round.Bricks
				user.Coins += round.Coins
				if err := tx.Model(user).Updates(map[string]interface{}{"bricks": user.Bricks, "coins": user.Coins}).Error; err != nil {
					return err
				}
			}
		}
		round.Completed = true
		return nil
	})
}
