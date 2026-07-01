package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/sauryaj/flexdocs-go/internal/db"
)

type Claims struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

type contextKey string

const UserContextKey contextKey = "user"

type UserContext struct {
	UserID string
	Email  string
	Role   string
}

func GetJWTSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = os.Getenv("NEXTAUTH_SECRET")
	}
	return []byte(secret)
}

func GenerateToken(userID, email, role string) (string, error) {
	claims := Claims{
		UserID: userID,
		Email:  email,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(GetJWTSecret())
}

func ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return GetJWTSecret(), nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}

func GenerateSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// GetDefaultUser returns the first user (single-user mode)
func GetDefaultUser(ctx context.Context) (userID, email, role string, err error) {
	row := db.Pool.QueryRow(ctx, `SELECT id, email, role FROM "User" LIMIT 1`)
	err = row.Scan(&userID, &email, &role)
	if err != nil {
		return "", "", "", fmt.Errorf("no user found: %w", err)
	}
	return
}

// GetUserFromRequest extracts user from JWT token or falls back to default user
func GetUserFromRequest(r *http.Request) (*UserContext, error) {
	ctx := r.Context()

	// Try JWT token first
	if authHeader := r.Header.Get("Authorization"); authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			claims, err := ValidateToken(parts[1])
			if err != nil {
				return nil, fmt.Errorf("invalid token: %w", err)
			}
			return &UserContext{
				UserID: claims.UserID,
				Email:  claims.Email,
				Role:   claims.Role,
			}, nil
		}
	}

	// Try API key
	if apiKey := r.Header.Get("X-API-Key"); apiKey != "" {
		var userID, email, role string
		err := db.Pool.QueryRow(ctx,
			`SELECT u.id, u.email, u.role FROM "ApiKey" ak JOIN "User" u ON ak."userId" = u.id WHERE ak.key = $1 AND ak."isActive" = true`,
			apiKey,
		).Scan(&userID, &email, &role)
		if err == nil {
			// Update last used
			db.Pool.Exec(ctx, `UPDATE "ApiKey" SET "lastUsedAt" = NOW() WHERE key = $1`, apiKey)
			return &UserContext{UserID: userID, Email: email, Role: role}, nil
		}
	}

	// Fall back to default user (single-user mode)
	uid, em, rl, e := GetDefaultUser(ctx)
	if e != nil {
		return nil, e
	}
	return &UserContext{UserID: uid, Email: em, Role: rl}, nil
}

// ContextWithUser adds user to context
func ContextWithUser(ctx context.Context, user *UserContext) context.Context {
	return context.WithValue(ctx, UserContextKey, user)
}

// UserFromContext retrieves user from context
func UserFromContext(ctx context.Context) *UserContext {
	user, _ := ctx.Value(UserContextKey).(*UserContext)
	return user
}
