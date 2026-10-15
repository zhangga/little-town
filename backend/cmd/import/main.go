package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"

	"github.com/joho/godotenv"
	"github.com/yourusername/little-town-backend/internal/config"
	"github.com/yourusername/little-town-backend/internal/database"
	"github.com/yourusername/little-town-backend/internal/models"
	"gorm.io/gorm"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found")
	}

	// 加载配置
	cfg := config.Load()

	// 初始化数据库
	db, err := database.InitDB(cfg)
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	fmt.Println("=== Importing Words ===")
	if err := importWords(db, "data/words/grade-1-3.json"); err != nil {
		log.Fatal("Failed to import words:", err)
	}

	fmt.Println("=== Importing Buildings ===")
	if err := importBuildings(db, "data/buildings.json"); err != nil {
		log.Fatal("Failed to import buildings:", err)
	}

	fmt.Println("=== Import Complete ===")
}

func importWords(db *gorm.DB, filepath string) error {
	data, err := ioutil.ReadFile(filepath)
	if err != nil {
		return err
	}

	var words []models.Word
	if err := json.Unmarshal(data, &words); err != nil {
		return err
	}

	for _, word := range words {
		// 检查是否已存在
		var existing models.Word
		result := db.Where("word = ? AND grade = ?", word.Word, word.Grade).First(&existing)
		if result.Error == nil {
			fmt.Printf("Word already exists: %s (grade %d), skipping\n", word.Word, word.Grade)
			continue
		}

		if err := db.Create(&word).Error; err != nil {
			return fmt.Errorf("failed to create word %s: %w", word.Word, err)
		}
		fmt.Printf("Imported word: %s (%s)\n", word.Word, word.Translation)
	}

	return nil
}

func importBuildings(db *gorm.DB, filepath string) error {
	data, err := ioutil.ReadFile(filepath)
	if err != nil {
		return err
	}

	var buildings []models.Building
	if err := json.Unmarshal(data, &buildings); err != nil {
		return err
	}

	for _, building := range buildings {
		// 检查是否已存在
		var existing models.Building
		result := db.Where("name = ?", building.Name).First(&existing)
		if result.Error == nil {
			fmt.Printf("Building already exists: %s, skipping\n", building.Name)
			continue
		}

		if err := db.Create(&building).Error; err != nil {
			return fmt.Errorf("failed to create building %s: %w", building.Name, err)
		}
		fmt.Printf("Imported building: %s\n", building.Name)
	}

	return nil
}
