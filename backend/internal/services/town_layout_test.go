package services

import (
	"testing"

	"github.com/zhangga/little-town/backend/internal/models"
)

func TestTownLayoutNormalizesLegacyPositionsAndPreservesValidCells(t *testing.T) {
	raw := []models.UserBuilding{
		{ID: 1, PositionX: 60, PositionY: 60},
		{ID: 2, PositionX: 2, PositionY: 4},
		{ID: 3, PositionX: 2, PositionY: 4},
	}
	layout := NormalizeTownLayout(raw, TownPosition{}, 11)
	if layout.Columns != 3 || layout.Rows != 6 || len(layout.Buildings) != 3 {
		t.Fatalf("unexpected layout: %+v", layout)
	}
	if layout.Buildings[1].TownPosition != (TownPosition{X: 2, Y: 4}) {
		t.Fatal("a valid saved position was moved")
	}
	seen := map[TownPosition]bool{layout.Home: true}
	for _, item := range layout.Buildings {
		if seen[item.TownPosition] {
			t.Fatal("overlapping cells")
		}
		seen[item.TownPosition] = true
	}
	if raw[0].PositionX != 60 || raw[0].PositionY != 60 {
		t.Fatal("read normalization must not modify the database records")
	}
	if TownLayoutRows(30, 0) < 12 || TownLayoutRows(11, 0) != TownLayoutRows(11, 11) {
		t.Fatal("reserve the full catalog before construction")
	}
}

func TestTownLayoutValidationChecksCompleteOwnershipAndUniqueCells(t *testing.T) {
	owned := []models.UserBuilding{{ID: 1}, {ID: 2}}
	valid := []TownPlacement{{ID: 1, TownPosition: TownPosition{X: 2, Y: 5}}, {ID: 2, TownPosition: TownPosition{X: 1}}}
	if err := ValidateTownLayout(TownPosition{}, valid, owned, 11); err != nil {
		t.Fatal(err)
	}
	for _, invalid := range [][]TownPlacement{
		valid[:1],
		{{ID: 3, TownPosition: TownPosition{X: 2}}, valid[1]},
		{valid[0], valid[0]},
		{{ID: 1}, valid[1]},
		{{ID: 1, TownPosition: TownPosition{X: 3}}, valid[1]},
		{{ID: 1, TownPosition: TownPosition{Y: -1}}, valid[1]},
		{{ID: 1, TownPosition: TownPosition{Y: 6}}, valid[1]},
	} {
		if ValidateTownLayout(TownPosition{}, invalid, owned, 11) == nil {
			t.Fatalf("accepted invalid layout: %+v", invalid)
		}
	}
}
