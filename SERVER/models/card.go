package models

type Card struct {
	ID     int64  `json:"id"`
	CardID string `json:"card_id"`
	Word   string `json:"word"`
}
