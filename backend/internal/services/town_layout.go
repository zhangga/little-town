package services

import (
	"fmt"

	"github.com/zhangga/little-town/backend/internal/models"
)

const TownColumns = 3

type TownPosition struct {
	X int `json:"position_x"`
	Y int `json:"position_y"`
}

type TownPlacement struct {
	ID uint `json:"id"`
	TownPosition
}

type TownLayout struct {
	Columns   int             `json:"columns"`
	Rows      int             `json:"rows"`
	Home      TownPosition    `json:"home"`
	Buildings []TownPlacement `json:"buildings"`
}

func TownLayoutRows(catalogCount, builtCount int) int {
	// 全部图鉴、小屋和额外一行一次展开，不按建造进度逐个增加空地。
	return max(6, (max(catalogCount, builtCount)+1+TownColumns+TownColumns-1)/TownColumns)
}

func validTownPosition(position TownPosition, rows int) bool {
	return position.X >= 0 && position.X < TownColumns && position.Y >= 0 && position.Y < rows
}

func NormalizeTownLayout(buildings []models.UserBuilding, home TownPosition, catalogCount int) TownLayout {
	rows := TownLayoutRows(catalogCount, len(buildings))
	if !validTownPosition(home, rows) {
		home = TownPosition{}
	}
	layout := TownLayout{Columns: TownColumns, Rows: rows, Home: home, Buildings: make([]TownPlacement, len(buildings))}
	used := map[TownPosition]bool{home: true}
	// 先保留合法位置，再给旧像素坐标、重叠坐标分配空地。
	for i, building := range buildings {
		position := TownPosition{X: building.PositionX, Y: building.PositionY}
		layout.Buildings[i] = TownPlacement{ID: building.ID, TownPosition: TownPosition{X: -1}}
		if validTownPosition(position, rows) && !used[position] {
			layout.Buildings[i].TownPosition = position
			used[position] = true
		}
	}
	for i := range layout.Buildings {
		if layout.Buildings[i].X >= 0 {
			continue
		}
		for cell := 0; cell < rows*TownColumns; cell++ {
			position := TownPosition{X: cell % TownColumns, Y: cell / TownColumns}
			if !used[position] {
				layout.Buildings[i].TownPosition = position
				used[position] = true
				break
			}
		}
	}
	return layout
}

func ValidateTownLayout(home TownPosition, positions []TownPlacement, owned []models.UserBuilding, catalogCount int) error {
	rows := TownLayoutRows(catalogCount, len(owned))
	if !validTownPosition(home, rows) || len(positions) != len(owned) {
		return fmt.Errorf("布局已变化或位置超出地图，请重新打开小镇")
	}
	ids := make(map[uint]bool, len(owned))
	for _, building := range owned {
		ids[building.ID] = true
	}
	used := map[TownPosition]bool{home: true}
	for _, position := range positions {
		if !ids[position.ID] {
			return fmt.Errorf("布局只能包含自己的全部建筑，且不能重复")
		}
		if !validTownPosition(position.TownPosition, rows) || used[position.TownPosition] {
			return fmt.Errorf("建筑需要放在不同的有效地块上")
		}
		delete(ids, position.ID)
		used[position.TownPosition] = true
	}
	return nil
}

func (layout TownLayout) FirstEmpty() TownPosition {
	used := map[TownPosition]bool{layout.Home: true}
	for _, building := range layout.Buildings {
		used[building.TownPosition] = true
	}
	for cell := 0; cell < layout.Rows*layout.Columns; cell++ {
		position := TownPosition{X: cell % layout.Columns, Y: cell / layout.Columns}
		if !used[position] {
			return position
		}
	}
	return TownPosition{Y: layout.Rows}
}
