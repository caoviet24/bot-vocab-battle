package firebase

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type RefreshRequest struct {
	Key          string `json:"key"`
	RefreshToken string `json:"refresh_token"`
}

type RefreshResponse struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    string `json:"expires_in"`
	TokenType    string `json:"token_type"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
	UserID       string `json:"user_id"`
	ProjectID    string `json:"project_id"`
}

type RefreshError struct {
	StatusCode int
	Data       interface{}
	Message    string
}

func (e *RefreshError) Error() string {
	return e.Message
}

func RefreshToken(ctx context.Context, req RefreshRequest) (*RefreshResponse, error) {
	formData := url.Values{}
	formData.Set("grant_type", "refresh_token")
	formData.Set("refresh_token", req.RefreshToken)

	googleURL := fmt.Sprintf("https://securetoken.googleapis.com/v1/token?key=%s", req.Key)
	client := &http.Client{Timeout: 10 * time.Second}

	googleReq, err := http.NewRequestWithContext(ctx, http.MethodPost, googleURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, &RefreshError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error creating Firebase request",
		}
	}

	googleReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	googleReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

	googleResp, err := client.Do(googleReq)
	if err != nil {
		return nil, &RefreshError{
			StatusCode: http.StatusBadGateway,
			Message:    "cannot connect to Firebase server",
		}
	}
	defer googleResp.Body.Close()

	if googleResp.StatusCode != http.StatusOK {
		var errData interface{}
		_ = json.NewDecoder(googleResp.Body).Decode(&errData)
		return nil, &RefreshError{
			StatusCode: googleResp.StatusCode,
			Data:       errData,
			Message:    "Firebase API returned an error",
		}
	}

	var refreshResult RefreshResponse
	if err := json.NewDecoder(googleResp.Body).Decode(&refreshResult); err != nil {
		return nil, &RefreshError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error decoding Firebase response",
		}
	}

	return &refreshResult, nil
}
