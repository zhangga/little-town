package services

import (
	"errors"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/zhangga/little-town/backend/internal/models"
)

func TestSubwayResultBounds(t *testing.T) {
	good := SubwayResult{Coins: 50, Stars: 2, Distance: 500, Elapsed: 30}
	if !validSubwayResult(good, 35*time.Second) {
		t.Fatal("valid result rejected")
	}
	for _, change := range []func(*SubwayResult){func(r *SubwayResult) { r.Coins = -1 }, func(r *SubwayResult) { r.Stars = 100 }, func(r *SubwayResult) { r.Distance = 9999 }, func(r *SubwayResult) { r.Elapsed = math.NaN() }, func(r *SubwayResult) { r.Elapsed = math.Inf(1) }, func(r *SubwayResult) { r.Elapsed = 1000 }, func(r *SubwayResult) { r.Distance = 0 }} {
		r := good
		change(&r)
		if validSubwayResult(r, 35*time.Second) {
			t.Fatalf("forged result accepted: %+v", r)
		}
	}
	if validSubwayResult(good, 91*time.Minute) {
		t.Fatal("expired run accepted")
	}
}
func TestSubwayMySQLWalletLifecycle(t *testing.T) {
	db, user := schoolDB(t)
	s := NewSubwayService(db)
	clock := DayStart(time.Now()).Add(12 * time.Hour)
	s.now = func() time.Time { return clock }
	if _, err := s.Get(user.ID); !errors.Is(err, ErrTownLocked) {
		t.Fatal("unbuilt station accepted", err)
	}
	building := models.Building{Name: "地铁站"}
	if err := db.Create(&building).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.UserBuilding{UserID: user.ID, BuildingID: building.ID, BuiltAt: clock}).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, m := range []interface{}{&models.SubwayWallet{}, &models.SubwayRun{}, &models.SubwayPurchase{}, &models.UserBuilding{}} {
			db.Where("user_id = ?", user.ID).Delete(m)
		}
		db.Unscoped().Delete(&building)
	})
	initial, err := s.Get(user.ID)
	if err != nil || initial.Tokens != 0 || initial.Equipped != "mint" {
		t.Fatal(initial, err)
	}
	start, err := s.Start(user.ID, "subway-start-request-0001")
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.Start(user.ID, "subway-start-request-0001")
	if err != nil || again.Run.ID != start.Run.ID {
		t.Fatal("start retry not idempotent", err)
	}
	clock = clock.Add(95 * time.Second)
	result := SubwayResult{RunID: start.Run.ID, Coins: 200, Stars: 5, Distance: 1500, Elapsed: 90}
	_, other := schoolDB(t)
	if err := db.Create(&models.UserBuilding{UserID: other.ID, BuildingID: building.ID, BuiltAt: clock}).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("user_id = ?", other.ID).Delete(&models.UserBuilding{})
		db.Where("user_id = ?", other.ID).Delete(&models.SubwayWallet{})
	})
	if _, err := s.Finish(other.ID, result); !errors.Is(err, ErrSubway) {
		t.Fatal("another account claimed a run", err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Finish(user.ID, result); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	state, _ := s.Get(user.ID)
	if state.Tokens != 225 || state.EarnedToday != 225 {
		t.Fatal("duplicate reward", state)
	}
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Purchase(user.ID, "coins", "subway-coins-request-0001"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	state, _ = s.Get(user.ID)
	if state.Tokens != 175 || state.Wallet.Coins != 110 {
		t.Fatal("duplicate spending", state)
	}
	if _, err := s.Purchase(user.ID, "bricks", "subway-coins-request-0001"); !errors.Is(err, ErrSubway) {
		t.Fatal("changed request accepted", err)
	}
	state, err = s.Purchase(user.ID, "bricks", "subway-brick-request-0001")
	if err != nil || state.Tokens != 75 || state.Wallet.Bricks != 101 {
		t.Fatal("atomic brick exchange failed", state, err)
	}
	if _, err := s.Purchase(user.ID, "sunset", "subway-sunset-request-001"); !errors.Is(err, ErrSubwayBalance) {
		t.Fatal("insufficient balance accepted", err)
	}
	if _, err := s.Equip(user.ID, "aurora"); !errors.Is(err, ErrSubway) {
		t.Fatal("unowned skin equipped")
	}
	earn := func(id string) *SubwayState {
		t.Helper()
		a, err := s.Start(user.ID, id)
		if err != nil {
			t.Fatal(err)
		}
		clock = clock.Add(80 * time.Second)
		b, err := s.Finish(user.ID, SubwayResult{RunID: a.Run.ID, Coins: 600, Distance: 2200, Elapsed: 75})
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	state = earn("subway-start-request-0002")
	if state.Run.Awarded != 500 || state.Tokens != 575 {
		t.Fatal("run cap", state)
	}
	state, err = s.Purchase(user.ID, "sunset", "subway-sunset-request-001")
	if err != nil || state.Equipped != "sunset" || state.Tokens != 455 {
		t.Fatal(state, err)
	}
	state, err = s.Purchase(user.ID, "sunset", "subway-sunset-request-002")
	if err != nil || state.Tokens != 455 {
		t.Fatal("owned skin charged twice")
	}
	state = earn("subway-start-request-0003")
	if state.Run.Awarded != 275 || state.EarnedToday != 1000 {
		t.Fatal("daily cap", state)
	}
	if state = earn("subway-start-request-0004"); state.Run.Awarded != 0 {
		t.Fatal("daily rewards overflow")
	}
	old, _ := s.Start(user.ID, "subway-start-request-0005")
	newer, _ := s.Start(user.ID, "subway-start-request-0006")
	if _, err := s.Finish(user.ID, SubwayResult{RunID: old.Run.ID}); !errors.Is(err, ErrSubwayResult) {
		t.Fatal("abandoned run paid")
	}
	clock = clock.Add(91 * time.Minute)
	if _, err := s.Finish(user.ID, SubwayResult{RunID: newer.Run.ID}); !errors.Is(err, ErrSubwayResult) {
		t.Fatal("expired run paid")
	}
	var count int64
	db.Model(&models.SubwayPurchase{}).Where("user_id = ?", user.ID).Count(&count)
	if count != 4 {
		t.Fatal("unexpected receipts", count)
	}
	clock = clock.AddDate(0, 0, 1)
	state, err = s.Get(user.ID)
	if err != nil || state.EarnedToday != 0 {
		t.Fatal("daily counter did not reset", state, err)
	}
	before := state.Tokens
	if _, err := s.Finish(user.ID, result); err != nil {
		t.Fatal("old receipt cannot be retried", err)
	}
	state, _ = s.Get(user.ID)
	if state.EarnedToday != 0 || state.Tokens != before {
		t.Fatal("old result earned again after midnight", state)
	}
	state = earn("subway-next-day-request-001")
	if state.Run.Awarded != 500 || state.EarnedToday != 500 {
		t.Fatal("new day reward rejected", state)
	}
}
