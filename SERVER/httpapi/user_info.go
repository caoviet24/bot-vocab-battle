package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type UserInfoResponse struct {
	Status  string      `json:"status"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type UserInfoError struct {
	StatusCode int         `json:"status_code"`
	Data       interface{} `json:"data,omitempty"`
	Message    string      `json:"message"`
}

func (e *UserInfoError) Error() string {
	return e.Message
}

func (s *Server) updateUserInfo(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPut {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "method not allowed",
		})
		return
	}

	authHeader := r.Header.Get("Authorization")
	timezone := r.Header.Get("X-User-Timezone")

	if timezone == "" {
		timezone = "Asia/Saigon"
	}

	avatarPath := `C:\Users\frog\Downloads\OIP.png`

	result, err := UpdateUserInfo(
		r.Context(),
		authHeader,
		timezone,
		"PLAY GAME?",
		"",
		false,
		avatarPath,
	)

	if err != nil {
		if userErr, ok := err.(*UserInfoError); ok {
			writeJSON(w, userErr.StatusCode, map[string]interface{}{
				"status":  "error",
				"message": userErr.Message,
				"data":    userErr.Data,
			})
			return
		}

		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"status":  "error",
			"message": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func UpdateUserInfo(
	ctx context.Context,
	idToken string,
	timezone string,
	displayName string,
	description string,
	isPrivate bool,
	avatarPath string,
) (*UserInfoResponse, error) {
	idToken = strings.TrimSpace(idToken)

	if strings.HasPrefix(strings.ToLower(idToken), "bearer ") {
		idToken = strings.TrimSpace(idToken[7:])
	}

	if idToken == "" {
		return nil, &UserInfoError{
			StatusCode: http.StatusUnauthorized,
			Message:    "missing Firebase ID token",
		}
	}

	if timezone == "" {
		timezone = "Asia/Saigon"
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	if err := writer.WriteField("displayName", displayName); err != nil {
		return nil, &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error writing displayName field",
		}
	}

	if err := writer.WriteField("description", description); err != nil {
		return nil, &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error writing description field",
		}
	}

	if err := writer.WriteField("isPrivate", fmt.Sprintf("%t", isPrivate)); err != nil {
		return nil, &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error writing isPrivate field",
		}
	}

	if strings.TrimSpace(avatarPath) != "" {
		if err := writeAvatarFile(writer, "avatar", avatarPath); err != nil {
			return nil, err
		}
	}

	if err := writer.Close(); err != nil {
		return nil, &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error closing multipart writer",
		}
	}

	apiURL := "https://api.parroto.app/api/user/info"

	client := &http.Client{
		Timeout: 20 * time.Second,
	}

	apiReq, err := http.NewRequestWithContext(
		ctx,
		http.MethodPut,
		apiURL,
		body,
	)
	if err != nil {
		return nil, &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error creating user info request",
		}
	}

	apiReq.Header.Set("Accept", "application/json, text/plain, */*")
	apiReq.Header.Set("Content-Type", writer.FormDataContentType())
	apiReq.Header.Set("Authorization", "Bearer "+idToken)
	apiReq.Header.Set("Origin", "https://parroto.app")
	apiReq.Header.Set("Referer", "https://parroto.app/")
	apiReq.Header.Set("X-User-Timezone", timezone)
	apiReq.Header.Set("User-Agent", getBrowserUserAgent())

	apiResp, err := client.Do(apiReq)
	if err != nil {
		return nil, &UserInfoError{
			StatusCode: http.StatusBadGateway,
			Message:    "cannot connect to user info API",
		}
	}
	defer apiResp.Body.Close()

	respBody, err := io.ReadAll(apiResp.Body)
	if err != nil {
		return nil, &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error reading user info response",
		}
	}

	var respData interface{}
	if len(respBody) > 0 {
		_ = json.Unmarshal(respBody, &respData)
	}

	if apiResp.StatusCode < 200 || apiResp.StatusCode >= 300 {
		return nil, &UserInfoError{
			StatusCode: apiResp.StatusCode,
			Data:       respData,
			Message:    fmt.Sprintf("user info API returned status %d", apiResp.StatusCode),
		}
	}

	return &UserInfoResponse{
		Status:  "success",
		Message: "user info updated",
		Data:    respData,
	}, nil
}

func writeAvatarFile(writer *multipart.Writer, fieldName string, avatarPath string) error {
	file, err := os.Open(avatarPath)
	if err != nil {
		return &UserInfoError{
			StatusCode: http.StatusBadRequest,
			Message:    "cannot open avatar file",
			Data: map[string]interface{}{
				"avatarPath": avatarPath,
				"error":      err.Error(),
			},
		}
	}
	defer file.Close()

	fileName := filepath.Base(avatarPath)

	contentType, err := detectAllowedFileContentType(file, fileName)
	if err != nil {
		return err
	}

	header := make(textproto.MIMEHeader)
	header.Set(
		"Content-Disposition",
		fmt.Sprintf(`form-data; name="%s"; filename="%s"`, escapeMultipartQuote(fieldName), escapeMultipartQuote(fileName)),
	)
	header.Set("Content-Type", contentType)

	part, err := writer.CreatePart(header)
	if err != nil {
		return &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error creating avatar form file",
		}
	}

	if _, err := io.Copy(part, file); err != nil {
		return &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error copying avatar file",
		}
	}

	return nil
}

func detectAllowedFileContentType(file *os.File, fileName string) (string, error) {
	buffer := make([]byte, 512)

	n, readErr := file.Read(buffer)
	if readErr != nil && readErr != io.EOF {
		return "", &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error reading avatar file header",
		}
	}

	if _, err := file.Seek(0, 0); err != nil {
		return "", &UserInfoError{
			StatusCode: http.StatusInternalServerError,
			Message:    "error resetting avatar file reader",
		}
	}

	detectedType := http.DetectContentType(buffer[:n])

	switch detectedType {
	case "image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
		"video/mp4",
		"video/webm",
		"video/quicktime",
		"audio/mpeg",
		"audio/wav",
		"audio/ogg",
		"audio/webm":
		return detectedType, nil
	}

	// Fallback theo đuôi file.
	// Cần fallback vì một số định dạng như svg có thể bị DetectContentType nhận thành text/xml.
	ext := strings.ToLower(filepath.Ext(fileName))

	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg", nil
	case ".png":
		return "image/png", nil
	case ".gif":
		return "image/gif", nil
	case ".webp":
		return "image/webp", nil
	case ".svg":
		return "image/svg+xml", nil
	case ".mp4":
		return "video/mp4", nil
	case ".webm":
		return "video/webm", nil
	case ".mov":
		return "video/quicktime", nil
	case ".mp3":
		return "audio/mpeg", nil
	case ".wav":
		return "audio/wav", nil
	case ".ogg":
		return "audio/ogg", nil
	}

	return "", &UserInfoError{
		StatusCode: http.StatusBadRequest,
		Message:    "avatar file type not allowed",
		Data: map[string]interface{}{
			"fileName":     fileName,
			"detectedType": detectedType,
		},
	}
}

func escapeMultipartQuote(value string) string {
	replacer := strings.NewReplacer("\\", "\\\\", `"`, "\\\"")
	return replacer.Replace(value)
}
