package storage

import (
	"context"
	"database/sql"
	"fmt"

	"SERVER/models"

	_ "github.com/mattn/go-sqlite3"
)

const DefaultDBPath = "vocabulary.db"

type Store struct {
	db *sql.DB
}

func Open(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}

	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Init(ctx context.Context) error {
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS cards (
		id      INTEGER PRIMARY KEY AUTOINCREMENT,
		card_id TEXT NOT NULL UNIQUE,
		word    TEXT NOT NULL
	);`

	if _, err := s.db.ExecContext(ctx, createTableSQL); err != nil {
		return fmt.Errorf("create cards table: %w", err)
	}

	return nil
}

func (s *Store) CreateCard(ctx context.Context, card models.Card) (models.Card, bool, error) {
	result, err := s.db.ExecContext(ctx, `
		INSERT OR IGNORE INTO cards (card_id, word)
		VALUES (?, ?)
	`, card.CardID, card.Word)
	if err != nil {
		return models.Card{}, false, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return models.Card{}, false, err
	}

	if rowsAffected == 0 {
		return models.Card{}, true, nil
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		return models.Card{}, false, err
	}

	card.ID = lastID
	return card, false, nil
}

func (s *Store) GetAllCards(ctx context.Context) ([]models.Card, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, card_id, word
		FROM cards
		ORDER BY id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cards := []models.Card{}
	for rows.Next() {
		var card models.Card
		if err := rows.Scan(&card.ID, &card.CardID, &card.Word); err != nil {
			return nil, err
		}
		cards = append(cards, card)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return cards, nil
}
