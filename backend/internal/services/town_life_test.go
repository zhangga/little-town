package services

import (
	"github.com/zhangga/little-town/backend/internal/models"
	"testing"
	"time"
)

func TestTownLifeOwnershipGates(t *testing.T) {
	for _, c := range []struct {
		name      string
		buildings map[string]bool
		pet       bool
		want      map[string]bool
	}{
		{"empty", map[string]bool{}, false, map[string]bool{}},
		{"hospital", map[string]bool{"医院": true}, false, map[string]bool{"resident_sick": true}},
		{"fire station", map[string]bool{"消防站": true}, false, map[string]bool{"small_fire": true}},
		{"pet only", map[string]bool{}, true, map[string]bool{"pet_play": true}},
		{"pet hospital only", map[string]bool{"宠物医院": true}, false, map[string]bool{}},
		{"pet and human hospital", map[string]bool{"医院": true}, true, map[string]bool{"resident_sick": true, "pet_play": true}},
		{"pet and vet", map[string]bool{"宠物医院": true}, true, map[string]bool{"pet_sick": true, "pet_play": true}},
	} {
		t.Run(c.name, func(t *testing.T) {
			got := eligibleTownRules(c.buildings, c.pet)
			if len(got) != len(c.want) {
				t.Fatalf("got %+v, want %v", got, c.want)
			}
			for _, rule := range got {
				if !c.want[rule.Kind] {
					t.Fatalf("unexpected event %s", rule.Kind)
				}
			}
		})
	}
	seen := map[string]bool{}
	for _, rule := range townEventRules {
		if seen[rule.Kind] || rule.Cost < 0 || rule.Cost > 1 || rule.Outcome == "" {
			t.Fatalf("invalid rule %+v", rule)
		}
		seen[rule.Kind] = true
		if rule.Building != "" {
			for _, candidate := range eligibleTownRules(map[string]bool{}, true) {
				if candidate.Kind == rule.Kind {
					t.Fatalf("unbuilt building unlocked %s", rule.Kind)
				}
			}
		}
	}
}

func TestTownLifeCadence(t *testing.T) {
	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.Local)
	past := now.Add(-townEventInterval)
	for _, c := range []struct {
		name   string
		latest *models.TownEvent
		count  int64
		want   bool
	}{
		{"first visit", nil, 0, true},
		{"pending survives long absence", &models.TownEvent{CreatedAt: now.Add(-72 * time.Hour)}, 0, false},
		{"resolved just now", &models.TownEvent{ResolvedAt: &now}, 0, false},
		{"exact cooldown", &models.TownEvent{ResolvedAt: &past}, 1, true},
		{"daily maximum", &models.TownEvent{ResolvedAt: &past}, 3, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			if got := canCreateTownEvent(c.latest, c.count, now); got != c.want {
				t.Fatalf("got %t, want %t", got, c.want)
			}
		})
	}
}
