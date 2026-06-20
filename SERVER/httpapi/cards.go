package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"SERVER/models"
	"SERVER/response"
	"SERVER/serverlog"
)

func (s *Server) cards(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case http.MethodPost:
		s.createCard(w, r)
	case http.MethodGet:
		s.getAllCards(w, r)
	default:
		response.WriteJSON(w, http.StatusMethodNotAllowed, response.API{
			Success: false,
			Message: "Method is not supported",
		})
	}
}

func (s *Server) createCard(w http.ResponseWriter, r *http.Request) {
	var req models.Card
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		serverlog.Warn("POST /cards - invalid JSON")
		response.WriteJSON(w, http.StatusBadRequest, response.API{
			Success: false,
			Message: "Invalid JSON",
		})
		return
	}

	req.CardID = strings.TrimSpace(req.CardID)
	req.Word = strings.TrimSpace(req.Word)

	if req.CardID == "" || req.Word == "" {
		serverlog.Warn("POST /cards - empty data")
		response.WriteJSON(w, http.StatusBadRequest, response.API{
			Success: false,
			Message: "card_id and word cannot be empty",
		})
		return
	}

	card, duplicate, err := s.store.CreateCard(r.Context(), req)
	if err != nil {
		serverlog.Error(fmt.Sprintf("POST /cards - error adding card_id=%s: %v", req.CardID, err))
		response.WriteJSON(w, http.StatusInternalServerError, response.API{
			Success: false,
			Message: fmt.Sprintf("Error adding word: %v", err),
		})
		return
	}

	if duplicate {
		serverlog.Warn(fmt.Sprintf("POST /cards - duplicate card_id=%s, skipped", req.CardID))
		response.WriteJSON(w, http.StatusConflict, response.API{
			Success: false,
			Message: "card_id already exists",
		})
		return
	}

	serverlog.Success(fmt.Sprintf("POST /cards - added word: card_id=%s | word=%s", card.CardID, card.Word))
	response.WriteJSON(w, http.StatusCreated, response.API{
		Success: true,
		Message: "Word added successfully",
		Data:    card,
	})
}

func (s *Server) getAllCards(w http.ResponseWriter, r *http.Request) {
	cards, err := s.store.GetAllCards(r.Context())
	if err != nil {
		serverlog.Error(fmt.Sprintf("GET /cards - error loading cards: %v", err))
		response.WriteJSON(w, http.StatusInternalServerError, response.API{
			Success: false,
			Message: fmt.Sprintf("Error loading cards: %v", err),
		})
		return
	}

	serverlog.Info(fmt.Sprintf("GET /cards - returned %d vocabulary items", len(cards)))
	response.WriteJSON(w, http.StatusOK, response.API{
		Success: true,
		Message: "Cards loaded successfully",
		Data:    cards,
	})
}
