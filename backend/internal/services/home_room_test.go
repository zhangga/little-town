package services

import (
	"errors"
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
