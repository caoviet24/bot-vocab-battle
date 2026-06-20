package httpapi

import (
	"encoding/json"
	"net/http"

	"SERVER/botqueue"
	"SERVER/response"
)

func (s *Server) botQueueStart(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		response.WriteJSON(w, http.StatusMethodNotAllowed, response.API{Success: false, Message: "Method is not supported"})
		return
	}

	var req botqueue.StartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJSON(w, http.StatusBadRequest, response.API{Success: false, Message: "Invalid JSON"})
		return
	}

	if err := s.botQueue.Start(req); err != nil {
		response.WriteJSON(w, http.StatusBadRequest, response.API{Success: false, Message: err.Error()})
		return
	}

	response.WriteJSON(w, http.StatusOK, response.API{
		Success: true,
		Message: "Bot queue started",
		Data:    s.botQueue.Snapshot(),
	})
}

func (s *Server) botQueueStatus(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		response.WriteJSON(w, http.StatusMethodNotAllowed, response.API{Success: false, Message: "Method is not supported"})
		return
	}

	response.WriteJSON(w, http.StatusOK, response.API{
		Success: true,
		Message: "Bot queue status loaded",
		Data:    s.botQueue.Snapshot(),
	})
}

func (s *Server) botQueueStop(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		response.WriteJSON(w, http.StatusMethodNotAllowed, response.API{Success: false, Message: "Method is not supported"})
		return
	}

	s.botQueue.Stop()
	response.WriteJSON(w, http.StatusOK, response.API{
		Success: true,
		Message: "Bot queue stopped",
		Data:    s.botQueue.Snapshot(),
	})
}

func (s *Server) botQueueEvent(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		response.WriteJSON(w, http.StatusMethodNotAllowed, response.API{Success: false, Message: "Method is not supported"})
		return
	}

	var req botqueue.EventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJSON(w, http.StatusBadRequest, response.API{Success: false, Message: "Invalid JSON"})
		return
	}

	if err := s.botQueue.HandleEvent(req.BotID, req.EventName, req.Message); err != nil {
		response.WriteJSON(w, http.StatusBadRequest, response.API{Success: false, Message: err.Error()})
		return
	}

	response.WriteJSON(w, http.StatusOK, response.API{
		Success: true,
		Message: "Bot queue event received",
		Data:    s.botQueue.Snapshot(),
	})
}
