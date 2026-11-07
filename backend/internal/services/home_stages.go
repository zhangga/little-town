package services

const MaxHomeLevel = 5

type HomeStage struct {
	Level   int    `json:"level"`
	Name    string `json:"name"`
	Size    int    `json:"size"`
	Cost    int    `json:"cost"`
	Summary string `json:"summary"`
}

var homeStages = []HomeStage{
	{1, "初来的小屋", 7, 0, "橡木小屋、方块木门，第一间属于自己的家。"},
	{2, "暖暖的家", 9, 15, "扩出更大的起居空间，添上石砖门廊和明亮的窗户。"},
	{3, "花园之家", 12, 30, "宽阔的客餐厅，搭配落地窗和花园门廊。"},
	{4, "林间大别墅", 16, 60, "挑高大厅、石砖立柱、玻璃采光顶，尽情布置生活。"},
	{5, "橡木庄园", 20, 100, "400 格超大别墅，双开木门、开阔玻璃厅和宽敞门廊。"},
}

func homeStage(level int) HomeStage { return homeStages[max(0, min(len(homeStages)-1, level-1))] }

func residentHome(level, bricks int) ResidentHome {
	stage := homeStage(level)
	home := ResidentHome{Level: stage.Level, Name: stage.Name, Size: stage.Size, Area: stage.Size * stage.Size, Summary: stage.Summary, Stages: append([]HomeStage{}, homeStages...)}
	if stage.Level < MaxHomeLevel {
		next := homeStage(stage.Level + 1)
		home.NextLevel, home.NextName, home.NextSize, home.NextSummary = next.Level, next.Name, next.Size, next.Summary
		home.UpgradeCost, home.CanUpgrade = next.Cost, bricks >= next.Cost
	}
	return home
}
