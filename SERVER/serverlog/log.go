package serverlog

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorBlue   = "\033[34m"
	colorPurple = "\033[35m"
	colorCyan   = "\033[36m"
	colorGray   = "\033[90m"
	colorBold   = "\033[1m"
)

type loggingResponseWriter struct {
	http.ResponseWriter
	statusCode   int
	bytesWritten int
}

func Banner() {
	fmt.Println()
	fmt.Println(colorCyan + colorBold + "+--------------------------------------------+" + colorReset)
	fmt.Println(colorCyan + colorBold + "|        Vocabulary API - SQLite Server      |" + colorReset)
	fmt.Println(colorCyan + colorBold + "+--------------------------------------------+" + colorReset)
	fmt.Println()
}

func Info(message string) {
	fmt.Println(colorCyan + "i " + colorReset + message)
}

func Success(message string) {
	fmt.Println(colorGreen + "OK " + colorReset + message)
}

func Warn(message string) {
	fmt.Println(colorYellow + "! " + colorReset + message)
}

func Error(message string) {
	fmt.Println(colorRed + "x " + colorReset + message)
}

func Route(method string, path string, description string) {
	methodColor := methodColor(method)
	fmt.Printf(
		"  %s%-6s%s %s%-20s%s %s\n",
		methodColor, method, colorReset,
		colorCyan, path, colorReset,
		description,
	)
}

func WithLogging(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lrw := &loggingResponseWriter{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}

		next(lrw, r)

		duration := time.Since(start)
		printRequest(r, lrw.statusCode, lrw.bytesWritten, duration)
	}
}

func (lrw *loggingResponseWriter) WriteHeader(statusCode int) {
	lrw.statusCode = statusCode
	lrw.ResponseWriter.WriteHeader(statusCode)
}

func (lrw *loggingResponseWriter) Write(data []byte) (int, error) {
	n, err := lrw.ResponseWriter.Write(data)
	lrw.bytesWritten += n
	return n, err
}

func printRequest(r *http.Request, statusCode int, bytesWritten int, duration time.Duration) {
	now := time.Now().Format("15:04:05")
	method := r.Method
	path := r.URL.Path
	query := r.URL.RawQuery
	clientIP := clientIP(r)

	if query != "" {
		path = path + "?" + query
	}

	fmt.Printf(
		"%s[%s]%s %s%-7s%s %s%-28s%s %s%3d%s %s%9s%s %s%7dB%s %s%s%s\n",
		colorGray, now, colorReset,
		methodColor(method), method, colorReset,
		colorCyan, path, colorReset,
		statusColor(statusCode), statusCode, colorReset,
		colorPurple, duration.Round(time.Millisecond), colorReset,
		colorBlue, bytesWritten, colorReset,
		colorGray, clientIP, colorReset,
	)
}

func clientIP(r *http.Request) string {
	xForwardedFor := r.Header.Get("X-Forwarded-For")
	if xForwardedFor != "" {
		parts := strings.Split(xForwardedFor, ",")
		return strings.TrimSpace(parts[0])
	}

	xRealIP := r.Header.Get("X-Real-IP")
	if xRealIP != "" {
		return xRealIP
	}

	return r.RemoteAddr
}

func methodColor(method string) string {
	switch method {
	case http.MethodGet:
		return colorGreen
	case http.MethodPost:
		return colorBlue
	case http.MethodPut:
		return colorYellow
	case http.MethodDelete:
		return colorRed
	case http.MethodOptions:
		return colorPurple
	default:
		return colorReset
	}
}

func statusColor(statusCode int) string {
	switch {
	case statusCode >= 200 && statusCode < 300:
		return colorGreen
	case statusCode >= 300 && statusCode < 400:
		return colorCyan
	case statusCode >= 400 && statusCode < 500:
		return colorYellow
	case statusCode >= 500:
		return colorRed
	default:
		return colorReset
	}
}
