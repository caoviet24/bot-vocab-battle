package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

const SQLITE_DB_PATH = "vocabulary.db"

var FOLDERS = []string{
	// "1000_WORD_COMMOM",
	// "3000_A1_OF",
	// "3000_A2_OF",
	// "600_IELTS_BASIC",
	// "600_TOEIC_BASIC",
	// "BAND_4_5_IELTS",
	"COLLECTION",
}

type Card struct {
	CardID string `json:"card_id"`
	Word   string `json:"word"`
}

func (c *Card) UnmarshalJSON(data []byte) error {
	type Alias Card

	aux := struct {
		Alias
		ID string `json:"_id"`
	}{}

	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	*c = Card(aux.Alias)

	if c.CardID == "" {
		c.CardID = aux.ID
	}

	return nil
}

func buildFileList() []string {
	var files []string

	for _, folder := range FOLDERS {
		matches, err := filepath.Glob(filepath.Join(folder, "*.json"))
		if err != nil || len(matches) == 0 {
			fmt.Printf("⚠ Không tìm thấy file JSON trong folder: %s\n", folder)
			continue
		}

		files = append(files, matches...)
	}

	return files
}

func processFile(stmt *sql.Stmt, path string) (
	inserted int,
	duplicated int,
	total int,
	err error,
) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("đọc file: %w", err)
	}

	var cards []Card
	if err := json.Unmarshal(data, &cards); err != nil {
		return 0, 0, 0, fmt.Errorf("parse JSON: %w", err)
	}

	total = len(cards)
	lastPercent := -1

	for i, card := range cards {
		if card.CardID == "" {
			log.Printf(
				"  Card thứ %d trong file %s không có card_id hoặc _id",
				i+1,
				path,
			)
			continue
		}

		result, execErr := stmt.Exec(card.CardID, card.Word)
		if execErr != nil {
			log.Printf("  Lỗi insert card %s: %v", card.CardID, execErr)
			continue
		}

		rows, _ := result.RowsAffected()

		if rows > 0 {
			inserted++
		} else {
			duplicated++
		}

		percent := (i + 1) * 100 / total
		milestone := (percent / 10) * 10

		if milestone != lastPercent && percent >= milestone {
			fmt.Printf(
				"  Đang thêm... %d%% (%d/%d cards)\n",
				milestone,
				i+1,
				total,
			)
			lastPercent = milestone
		}
	}

	return inserted, duplicated, total, nil
}

func main() {
	files := buildFileList()
	if len(files) == 0 {
		log.Fatal("Không tìm thấy file JSON nào!")
	}

	db, err := sql.Open("sqlite3", SQLITE_DB_PATH)
	if err != nil {
		log.Fatalf("Lỗi mở database: %v", err)
	}
	defer db.Close()

	createTableSQL := `
	CREATE TABLE IF NOT EXISTS cards (
		id      INTEGER PRIMARY KEY AUTOINCREMENT,
		card_id TEXT NOT NULL UNIQUE,
		word    TEXT NOT NULL
	);`

	if _, err := db.Exec(createTableSQL); err != nil {
		log.Fatalf("Lỗi tạo bảng: %v", err)
	}

	fmt.Println("✓ Bảng 'cards' đã sẵn sàng.")
	fmt.Printf(
		"Sẽ xử lý %d file JSON từ %d folder...\n\n",
		len(files),
		len(FOLDERS),
	)

	stmt, err := db.Prepare(`
		INSERT OR IGNORE INTO cards (card_id, word)
		VALUES (?, ?)
	`)
	if err != nil {
		log.Fatalf("Lỗi prepare statement: %v", err)
	}
	defer stmt.Close()

	totalInserted := 0
	totalDuplicated := 0
	totalCards := 0
	skippedFiles := 0

	for i, path := range files {
		fmt.Printf("─── [%d/%d] %s\n", i+1, len(files), path)

		inserted, duplicated, total, err :=
			processFile(stmt, path)

		if err != nil {
			fmt.Printf("  ⚠ Bỏ qua: %v\n\n", err)
			skippedFiles++
			continue
		}

		totalInserted += inserted
		totalDuplicated += duplicated
		totalCards += total

		fmt.Printf(
			"  ✓ Xong: %d thêm mới, %d trùng card_id\n\n",
			inserted,
			duplicated,
		)
	}

	fmt.Println("══════════════════════════════════")
	fmt.Println("✓ Hoàn thành tất cả!")
	fmt.Printf(
		"  Tổng file xử lý : %d / %d\n",
		len(files)-skippedFiles,
		len(files),
	)
	fmt.Printf("  Tổng cards đọc  : %d\n", totalCards)
	fmt.Printf("  Thêm mới        : %d card_id\n", totalInserted)
	fmt.Printf("  Trùng card_id   : %d\n", totalDuplicated)
	fmt.Printf("  Database        : %s\n", SQLITE_DB_PATH)
}
