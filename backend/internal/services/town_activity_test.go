package services

import (
	"strings"
	"testing"
	"time"

	"github.com/zhangga/little-town/backend/internal/models"
)

func TestTownActivityCatalog(t *testing.T) {
	want := map[string]int{"电影院": 3, "学校": 1, "图书馆": 1, "商店": 1, "餐厅": 2, "公园": 1, "体育馆": 2, "医院": 1, "宠物医院": 1, "消防站": 1, "警察局": 1}
	counts, ids := map[string]int{}, map[string]bool{}
	for _, activity := range townActivities {
		if ids[activity.ID] || activity.ID == "" || activity.Name == "" || activity.Icon == "" || activity.Description == "" {
			t.Fatalf("incomplete or duplicate activity: %+v", activity)
		}
		ids[activity.ID] = true
		counts[activity.Building]++
		if activity.Price != want[activity.Building] {
			t.Fatalf("wrong price or unexpected building: %+v", activity)
		}
		if activity.NeedsPet != (activity.Building == "宠物医院") {
			t.Fatalf("unexpected pet requirement: %+v", activity)
		}
	}
	if len(counts) != len(want) {
		t.Fatalf("building coverage: %v", counts)
	}
	for building := range want {
		if counts[building] != 2 {
			t.Fatalf("%s has %d activities, want 2", building, counts[building])
		}
	}
}

func TestTownActivityOwnership(t *testing.T) {
	for _, tc := range []struct {
		name      string
		buildings map[string]bool
		pet       bool
		available map[string]bool
	}{
		{"empty", nil, false, nil},
		{"pet alone", nil, true, nil},
		{"cinema", map[string]bool{"电影院": true}, false, map[string]bool{"cinema_cloud": true, "cinema_space": true}},
		{"vet alone", map[string]bool{"宠物医院": true}, false, nil},
		{"pet with human hospital", map[string]bool{"医院": true}, true, map[string]bool{"hospital_checkup": true, "hospital_bandage": true}},
		{"pet with vet", map[string]bool{"宠物医院": true}, true, map[string]bool{"vet_checkup": true, "vet_groom": true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			views := townActivitiesView(&townOwnership{buildingMap: tc.buildings, hasPet: tc.pet})
			if len(views) != 22 {
				t.Fatalf("catalog length=%d", len(views))
			}
			for _, view := range views {
				if view.Available != tc.available[view.ID] || (view.LockedReason == "") != view.Available {
					t.Fatalf("unexpected availability: %+v", view)
				}
			}
		})
	}
}

func TestTownActivityRequestValidation(t *testing.T) {
	for _, value := range []string{"", "short", strings.Repeat("a", 15), strings.Repeat("a", 81), "activity-invalid_123", "activity-中文-12345", "activity-spaces 001"} {
		if validActivityRequestID(value) {
			t.Fatalf("accepted invalid request %q", value)
		}
		state, err := NewTownLifeService(nil).StartActivity(1, "cinema_cloud", value)
		if state != nil || err != ErrTownActivityRequest {
			t.Fatalf("invalid request reached database: %+v %v", state, err)
		}
	}
	for _, value := range []string{strings.Repeat("a", 16), strings.Repeat("a", 80), "activity-123456789-ABC"} {
		if !validActivityRequestID(value) {
			t.Fatalf("rejected valid request %q", value)
		}
	}
}

func TestTownActivityReceiptUsesPurchaseSnapshot(t *testing.T) {
	created := time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)
	visit := models.TownActivityVisit{ActivityID: "cinema_cloud", RequestID: "activity-snapshot-001", Name: "原来的电影名", Building: "电影院", Icon: "🎞️", Price: 2, CreatedAt: created}
	receipt := townActivityReceipt(visit)
	if receipt.Name != visit.Name || receipt.Price != 2 || receipt.Icon != visit.Icon || receipt.CreatedAt != created || receipt.RequestID != visit.RequestID {
		t.Fatalf("receipt rewrote purchase history: %+v", receipt)
	}
}
