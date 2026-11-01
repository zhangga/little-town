package services

import (
	"encoding/json"
	"errors"

	"github.com/zhangga/little-town/backend/internal/models"
	"gorm.io/gorm"
)

const HomeRoomSize = 7

var (
	ErrRoomLayout  = errors.New("家具不能重叠、超出房间或挡住门口，请换个位置")
	ErrRoomChanged = errors.New("房间已在其他地方更新，已为你取回最新布置")
	ErrMallLocked  = errors.New("先在小镇建好商场，就能购买家具啦")
)

var furnitureCatalog = []ResidentShopItem{
	{ID: "chair", Name: "原木单椅", Description: "搬进新家的礼物，坐下来歇歇脚。", Kind: "furniture", Category: "living", Price: 0, Width: 1, Depth: 1},
	{ID: "sofa", Name: "奶油双人沙发", Description: "软软的靠垫，坐下享受一个慢悠悠的下午。", Kind: "furniture", Category: "living", Price: 45, Width: 2, Depth: 1},
	{ID: "tv", Name: "自然风景电视", Description: "打开电视，翻看森林、海边和雪山的风景图片。", Kind: "furniture", Category: "living", Price: 75, Width: 1, Depth: 1},
	{ID: "lamp", Name: "暖光落地灯", Description: "轻轻一点，让房间亮起温暖的小灯。", Kind: "furniture", Category: "living", Price: 18, Width: 1, Depth: 1},
	{ID: "plant", Name: "窗边绿植", Description: "给叶子浇浇水，看一抹绿色轻轻摇晃。", Kind: "furniture", Category: "living", Price: 12, Width: 1, Depth: 1},
	{ID: "bed", Name: "云朵单人床", Description: "钻进柔软的被窝，做一个甜甜的小梦。", Kind: "furniture", Category: "bedroom", Price: 60, Width: 1, Depth: 2},
	{ID: "wardrobe", Name: "橡木衣柜", Description: "整理挂好的衣服，也可以打开自己的衣橱。", Kind: "furniture", Category: "bedroom", Price: 50, Width: 1, Depth: 1},
	{ID: "rug", Name: "圆圆编织地毯", Description: "铺上柔软的地毯，小人可以踩在上面伸个懒腰。", Kind: "furniture", Category: "bedroom", Price: 16, Width: 1, Depth: 1},
	{ID: "desk", Name: "窗边书桌", Description: "坐在书桌前画一幅画，记下今天的小故事。", Kind: "furniture", Category: "study", Price: 35, Width: 2, Depth: 1},
	{ID: "bookshelf", Name: "故事书架", Description: "抽出一本书，读一个森林里的小故事。", Kind: "furniture", Category: "study", Price: 30, Width: 1, Depth: 1},
	{ID: "table", Name: "原木餐桌", Description: "摆好杯子和餐盘，享受一场家里的下午茶。", Kind: "furniture", Category: "dining", Price: 32, Width: 2, Depth: 1},
	{ID: "fridge", Name: "薄荷小冰箱", Description: "打开冰箱，看看整齐摆好的水果和果汁。", Kind: "furniture", Category: "dining", Price: 55, Width: 1, Depth: 1},
}

type RoomPlacement struct {
	ID       string `json:"id"`
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Rotation int    `json:"rotation"`
}
type HomeRoom struct {
	Version int             `json:"version"`
	Size    int             `json:"size"`
	Layout  []RoomPlacement `json:"layout"`
}

func residentMallAvailable(tx *gorm.DB, userID uint) (bool, error) {
	var count int64
	err := tx.Model(&models.UserBuilding{}).Joins("JOIN buildings ON buildings.id = user_buildings.building_id").Where("user_buildings.user_id = ? AND buildings.name IN ? AND buildings.deleted_at IS NULL", userID, []string{"商店", "商场"}).Count(&count).Error
	return count > 0, err
}

func readHomeRoom(resident *models.Resident) (HomeRoom, error) {
	room := HomeRoom{Version: resident.RoomVersion, Size: HomeRoomSize, Layout: []RoomPlacement{{ID: "chair", X: 1, Y: 3}}}
	if resident.RoomLayout != "" {
		if err := json.Unmarshal([]byte(resident.RoomLayout), &room.Layout); err != nil {
			return room, err
		}
	}
	return room, nil
}

func ValidateRoomLayout(layout []RoomPlacement, owned map[string]bool) error {
	if layout == nil || len(layout) > len(furnitureCatalog) {
		return ErrRoomLayout
	}
	seen, cells := map[string]bool{}, map[[2]int]bool{}
	for _, p := range layout {
		item, ok := residentItem(p.ID)
		if !ok || item.Kind != "furniture" || seen[p.ID] || p.Rotation < 0 || p.Rotation > 1 {
			return ErrRoomLayout
		}
		if item.Price > 0 && !owned[p.ID] {
			return ErrResidentOwned
		}
		seen[p.ID] = true
		w, d := item.Width, item.Depth
		if p.Rotation == 1 {
			w, d = d, w
		}
		if p.X < 0 || p.Y < 0 || p.X+w > HomeRoomSize || p.Y+d > HomeRoomSize {
			return ErrRoomLayout
		}
		for x := p.X; x < p.X+w; x++ {
			for y := p.Y; y < p.Y+d; y++ {
				cell := [2]int{x, y}
				if cells[cell] || (x == 3 && y == 6) {
					return ErrRoomLayout
				}
				cells[cell] = true
			}
		}
	}
	return nil
}

func (s *ResidentService) SaveRoom(userID uint, version int, layout []RoomPlacement) (*ResidentState, error) {
	return s.mutate(userID, func(tx *gorm.DB, user *models.User, resident *models.Resident) error {
		if version != resident.RoomVersion {
			return ErrRoomChanged
		}
		var items []models.ResidentItem
		if err := tx.Where("user_id = ?", userID).Find(&items).Error; err != nil {
			return err
		}
		owned := map[string]bool{}
		for _, item := range items {
			owned[item.ItemID] = true
		}
		if err := ValidateRoomLayout(layout, owned); err != nil {
			return err
		}
		encoded, err := json.Marshal(layout)
		if err != nil {
			return err
		}
		resident.RoomLayout = string(encoded)
		resident.RoomVersion++
		return tx.Model(resident).Updates(map[string]interface{}{"room_layout": resident.RoomLayout, "room_version": resident.RoomVersion}).Error
	})
}
