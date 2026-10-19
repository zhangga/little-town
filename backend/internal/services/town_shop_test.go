package services

import (
	"github.com/zhangga/little-town/backend/internal/models"
	"testing"
	"time"
)

func TestTownNeedsDecay(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		elapsed     time.Duration
		food, water int
	}{{30 * time.Second, 70, 70}, {time.Minute, 69, 68}, {10*time.Minute + 30*time.Second, 60, 50}, {72 * time.Hour, 20, 20}, {-time.Hour, 70, 70}} {
		n := models.TownNeeds{Food: 70, Water: 70, CheckedAt: now}
		advanceTownNeeds(&n, now.Add(c.elapsed))
		if n.Food != c.food || n.Water != c.water {
			t.Fatalf("%s: %+v", c.elapsed, n)
		}
		if c.elapsed > 0 && c.elapsed < 72*time.Hour && now.Add(c.elapsed).Sub(n.CheckedAt) >= time.Minute {
			t.Fatal("whole-minute remainder was lost")
		}
	}
	n := models.TownNeeds{Food: 70, Water: 70, CheckedAt: now}
	advanceTownNeeds(&n, now.Add(90*time.Second))
	advanceTownNeeds(&n, now.Add(120*time.Second))
	if n.Food != 68 || n.Water != 66 {
		t.Fatal("repeated reads reset the decay clock")
	}
}
func TestTownSupplyCatalog(t *testing.T) {
	for _, item := range townSupplies {
		if item.Price <= 0 || item.Price > 3 || item.Building == "" || item.Food+item.Water <= 0 {
			t.Fatalf("bad item: %+v", item)
		}
	}
	if validSupplyRequestID("short") || validSupplyRequestID("../../invalid/request") || !validSupplyRequestID("shop-request-123456") {
		t.Fatal("request ID validation")
	}
}
