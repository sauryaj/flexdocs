package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/sauryaj/flexdocs-go/internal/auth"
	"github.com/sauryaj/flexdocs-go/internal/db"
)

type APIResponse struct {
	OK      bool        `json:"ok"`
	Error   string      `json:"error,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
}

func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func WriteOK(w http.ResponseWriter, data interface{}) {
	WriteJSON(w, http.StatusOK, APIResponse{OK: true, Data: data})
}

func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, APIResponse{OK: false, Error: msg})
}

func WriteCreated(w http.ResponseWriter, data interface{}) {
	WriteJSON(w, http.StatusCreated, APIResponse{OK: true, Data: data})
}

// Auth extracts user from request and adds to context
func Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, err := auth.GetUserFromRequest(r)
		if err != nil {
			WriteError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		ctx := auth.ContextWithUser(r.Context(), user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Logger logs requests
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

// Recovery catches panics
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("PANIC: %v", err)
				WriteError(w, http.StatusInternalServerError, "Internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type rateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	limit    int
	window   time.Duration
}

var limiters = make(map[string]*rateLimiter)

func getLimiter(key string, limit int, window time.Duration) *rateLimiter {
	if l, ok := limiters[key]; ok {
		return l
	}
	limiters[key] = &rateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
	return limiters[key]
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	// Clean old entries
	reqs := rl.requests[key]
	valid := make([]time.Time, 0, len(reqs))
	for _, t := range reqs {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.limit {
		rl.requests[key] = valid
		return false
	}

	rl.requests[key] = append(valid, now)
	return true
}

// RateLimit applies rate limiting by IP
func RateLimit(limit int, window time.Duration) func(http.Handler) http.Handler {
	limiter := getLimiter("global", limit, window)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
				ip = strings.Split(fwd, ",")[0]
			}

			if !limiter.allow(ip) {
				WriteError(w, http.StatusTooManyRequests, "Rate limit exceeded")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// AuditLog logs user actions
func AuditLog(action, resourceType string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r)

			user := auth.UserFromContext(r.Context())
			if user == nil {
				return
			}

			ip := r.RemoteAddr
			if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
				ip = strings.Split(fwd, ",")[0]
			}
			ua := r.UserAgent()

			go func() {
				_, err := db.Pool.Exec(context.Background(),
					`INSERT INTO "ActivityLog" (id, "userId", action, "resourceType", ip, "userAgent", "createdAt")
					 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())`,
					user.UserID, action, resourceType, ip, ua,
				)
				if err != nil {
					log.Printf("Audit log error: %v", err)
				}
			}()
		})
	}
}

// AdminOnly restricts to admin users
func AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil || user.Role != "admin" {
			WriteError(w, http.StatusForbidden, "Admin access required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// GetPagination extracts page/limit from query params
func GetPagination(r *http.Request) (page, limit int) {
	page = 1
	limit = 50

	if p := r.URL.Query().Get("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	return
}

// GetOrgID extracts organization ID from query params
func GetOrgID(r *http.Request) *string {
	orgID := r.URL.Query().Get("organizationId")
	if orgID == "" {
		return nil
	}
	return &orgID
}
