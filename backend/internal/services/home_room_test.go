package services

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"testing"

	"github.com/zhangga/little-town/backend/internal/models"
)

func TestHomeRoomValidation(t *testing.T) {
	owned := map[string]bool{"sofa": true, "bed": true, "plant": true}
	for _, c := range []struct {
		name   string
		layout []RoomPlacement
		want   error
	}{
		{"empty saved room", []RoomPlacement{}, nil},
		{"starter gift", []RoomPlacement{{ID: "chair", X: 1, Y: 3}}, nil},
		{"owned furniture", []RoomPlacement{{ID: "sofa", X: 0, Y: 0}, {ID: "bed", X: 4, Y: 2}}, nil},
		{"missing layout", nil, ErrRoomLayout},
		{"unknown item", []RoomPlacement{{ID: "fake"}}, ErrRoomLayout},
		{"outfit is not furniture", []RoomPlacement{{ID: "everyday"}}, ErrRoomLayout},
		{"unowned television", []RoomPlacement{{ID: "tv"}}, ErrResidentOwned},
		{"overlap", []RoomPlacement{{ID: "sofa"}, {ID: "plant", X: 1}}, ErrRoomLayout},
		{"duplicate", []RoomPlacement{{ID: "chair"}, {ID: "chair", X: 2}}, ErrRoomLayout},
		{"edge", []RoomPlacement{{ID: "bed", X: 6, Y: 6}}, ErrRoomLayout},
		{"rotated fit", []RoomPlacement{{ID: "bed", X: 5, Y: 6, Rotation: 1}}, nil},
		{"entry blocked", []RoomPlacement{{ID: "chair", X: 3, Y: 6}}, ErrRoomLayout},
		{"entry partly blocked", []RoomPlacement{{ID: "sofa", X: 2, Y: 6}}, ErrRoomLayout},
		{"invalid rotation", []RoomPlacement{{ID: "chair", Rotation: 2}}, ErrRoomLayout},
		{"negative position", []RoomPlacement{{ID: "chair", X: -1}}, ErrRoomLayout},
	} {
		t.Run(c.name, func(t *testing.T) {
			if err := ValidateRoomLayout(c.layout, owned); !errors.Is(err, c.want) {
				t.Fatalf("got %v want %v", err, c.want)
			}
		})
	}
}

func TestRoomDefaultsAndStoredEmptyLayout(t *testing.T) {
	room, err := readHomeRoom(&models.Resident{})
	if err != nil || len(room.Layout) != 1 || room.Layout[0].ID != "chair" {
		t.Fatalf("starter room: %+v %v", room, err)
	}
	room, err = readHomeRoom(&models.Resident{RoomLayout: "[]", RoomVersion: 2})
	if err != nil || len(room.Layout) != 0 || room.Version != 2 {
		t.Fatalf("stored empty room: %+v %v", room, err)
	}
	if _, err := readHomeRoom(&models.Resident{RoomLayout: "invalid"}); err == nil {
		t.Fatal("corrupt room silently reset")
	}
	seen := map[string]bool{}
	for _, item := range furnitureCatalog {
		if seen[item.ID] || item.Kind != "furniture" || item.Price < 0 || item.Width < 1 || item.Depth < 1 {
			t.Fatalf("invalid furniture: %+v", item)
		}
		seen[item.ID] = true
	}
}

func TestContinuousRoomLayouts(t *testing.T) {
	data, err := os.ReadFile("testdata/home-space.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name   string
		Valid  bool
		Layout []RoomPlacement
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	owned := map[string]bool{}
	for _, item := range furnitureCatalog {
		owned[item.ID] = true
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			if err := ValidateRoomLayout(c.Layout, owned); (err == nil) != c.Valid {
				t.Fatalf("valid=%v, err=%v", c.Valid, err)
			}
		})
	}
	angle := 42.25
	for _, value := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		if ValidateRoomLayout([]RoomPlacement{{ID: "chair", X: value, Y: 2, Angle: &angle}}, owned) == nil {
			t.Fatal("non-finite position accepted")
		}
		if ValidateRoomLayout([]RoomPlacement{{ID: "chair", X: 2, Y: 2, Angle: &value}}, owned) == nil {
			t.Fatal("non-finite angle accepted")
		}
	}
	if ValidateRoomLayout([]RoomPlacement{{ID: "chair", X: 1.5, Y: 2}}, owned) == nil {
		t.Fatal("fractional legacy coordinate accepted without angle")
	}
}

func TestHomeExpansionStagesAndBoundaries(t *testing.T) {
	owned := map[string]bool{"pool": true}
	angle := 0.0
	for level, size := range []int{7, 9, 12, 16, 20} {
		home := residentHome(level+1, 1000)
		if home.Size != size || home.Area != size*size || len(home.Stages) != 5 {
			t.Fatalf("wrong stage %+v", home)
		}
		resident := models.Resident{HomeLevel: level + 1, RoomLayout: `[{"id":"chair","x":1,"y":3,"rotation":0}]`}
		room, err := readHomeRoom(&resident)
		if err != nil || room.Size != size || room.Level != level+1 || room.Layout[0].X != 1 {
			t.Fatalf("old room changed %+v %v", room, err)
		}
		p := RoomPlacement{ID: "chair", X: float64(size) - .5, Y: 2.5, Angle: &angle}
		if ValidateRoomLayoutForLevel([]RoomPlacement{p}, owned, level+1) != nil {
			t.Fatal("expanded floor cannot be used")
		}
		p.X += .1
		if ValidateRoomLayoutForLevel([]RoomPlacement{p}, owned, level+1) == nil {
			t.Fatal("crossed current house boundary")
		}
		p.X = float64(size) / 2
		p.Y = float64(size) - .5
		if ValidateRoomLayoutForLevel([]RoomPlacement{p}, owned, level+1) == nil {
			t.Fatal("blocked current doorway")
		}
	}
	if residentHome(3, 59).CanUpgrade || !residentHome(3, 60).CanUpgrade {
		t.Fatal("villa price is not authoritative")
	}
	if residentHome(5, 999).NextLevel != 0 || residentHome(5, 999).CanUpgrade {
		t.Fatal("max home can upgrade")
	}
	if len(furnitureCatalog) != MaxRoomFurniture {
		t.Fatal("room limit no longer matches catalog")
	}
	for _, item := range furnitureCatalog {
		if item.Width > homeStage(1).Size || item.Depth > homeStage(1).Size {
			t.Fatalf("furniture has no usable footprint: %s", item.ID)
		}
	}
}
