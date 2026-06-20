package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

// CardAnswer đại diện cho cấu trúc dữ liệu của một hàng trong bảng card_answers
type CardAnswer struct {
	CardID string `json:"card_id"`
	Word   string `json:"word"`
}

func main() {
	// 1. Kết nối tới cơ sở dữ liệu SQLite (card_cache.db)
	db, err := sql.Open("sqlite3", "card_cache.db")
	if err != nil {
		log.Fatalf("Lỗi kết nối database: %v", err)
	}
	defer db.Close()

	// 2. Truy vấn dữ liệu từ bảng card_answers
	query := "SELECT card_id, word FROM card_answers"
	rows, err := db.Query(query)
	if err != nil {
		log.Fatalf("Lỗi truy vấn dữ liệu: %v", err)
	}
	defer rows.Close()

	var results []CardAnswer

	// 3. Đọc dữ liệu từ các hàng kết quả
	for rows.Next() {
		var ca CardAnswer
		err := rows.Scan(&ca.CardID, &ca.Word)
		if err != nil {
			log.Fatalf("Lỗi quét dữ liệu dòng: %v", err)
		}
		results = append(results, ca)
	}

	// Kiểm tra lỗi trong quá trình lặp
	if err = rows.Err(); err != nil {
		log.Fatalf("Lỗi trong quá trình duyệt rows: %v", err)
	}

	// 4. Chuyển đổi slice kết quả thành định dạng JSON (với thụt lề cho đẹp)
	jsonData, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		log.Fatalf("Lỗi chuyển đổi sang JSON: %v", err)
	}

	// 5. Ghi dữ liệu JSON ra file (output.json)
	outputFile := "output.json"
	err = os.WriteFile(outputFile, jsonData, 0644)
	if err != nil {
		log.Fatalf("Lỗi ghi file JSON: %v", err)
	}

	fmt.Printf("Xuất dữ liệu thành công ra file %s! Tổng số bản ghi: %d\n", outputFile, len(results))
}
