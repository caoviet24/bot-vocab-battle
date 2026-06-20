package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"SERVER/firebase"
	"SERVER/response"
	"SERVER/serverlog"
)

func (s *Server) refreshToken(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		response.WriteJSON(w, http.StatusMethodNotAllowed, response.API{
			Success: false,
			Message: "Method is not supported",
		})
		return
	}

	var req firebase.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		serverlog.Warn("POST /refresh-token - invalid JSON")
		response.WriteJSON(w, http.StatusBadRequest, response.API{
			Success: false,
			Message: "Invalid JSON",
		})
		return
	}

	req.Key = strings.TrimSpace(req.Key)
	req.RefreshToken = strings.TrimSpace(req.RefreshToken)

	if req.Key == "" || req.RefreshToken == "" {
		serverlog.Warn("POST /refresh-token - missing key or refresh_token")
		response.WriteJSON(w, http.StatusBadRequest, response.API{
			Success: false,
			Message: "key and refresh_token cannot be empty",
		})
		return
	}

	refreshResult, err := firebase.RefreshToken(r.Context(), req)
	if err != nil {
		var refreshErr *firebase.RefreshError
		if errors.As(err, &refreshErr) {
			serverlog.Warn(fmt.Sprintf("POST /refresh-token - Firebase error status: %d", refreshErr.StatusCode))
			response.WriteJSON(w, refreshErr.StatusCode, response.API{
				Success: false,
				Message: refreshErr.Message,
				Data:    refreshErr.Data,
			})
			return
		}

		serverlog.Error(fmt.Sprintf("POST /refresh-token - unexpected error: %v", err))
		response.WriteJSON(w, http.StatusInternalServerError, response.API{
			Success: false,
			Message: "Unexpected server error",
		})
		return
	}

	serverlog.Success(fmt.Sprintf("POST /refresh-token - refreshed token for User ID: %s", refreshResult.UserID))
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(refreshResult)
}
