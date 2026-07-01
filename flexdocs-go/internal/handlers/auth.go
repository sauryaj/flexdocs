package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sauryaj/flexdocs-go/internal/auth"
	"github.com/sauryaj/flexdocs-go/internal/db"
	"github.com/sauryaj/flexdocs-go/internal/middleware"
)

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Single-user mode: return the first user with a JWT
	userID, email, role, err := auth.GetDefaultUser(r.Context())
	if err != nil {
		middleware.WriteError(w, http.StatusUnauthorized, "No users configured")
		return
	}

	token, err := auth.GenerateToken(userID, email, role)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	middleware.WriteOK(w, map[string]interface{}{
		"token": token,
		"user": map[string]string{
			"id":    userID,
			"email": email,
			"role":  role,
		},
	})
}

func GetCurrentUserHandler(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		middleware.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var name, avatar, bio, phone, timezone string
	err := db.Pool.QueryRow(r.Context(),
		`SELECT COALESCE(name,''), COALESCE(avatar,''), COALESCE(bio,''), COALESCE(phone,''), COALESCE(timezone,'UTC') FROM "User" WHERE id = $1`,
		user.UserID,
	).Scan(&name, &avatar, &bio, &phone, &timezone)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch user")
		return
	}

	middleware.WriteOK(w, map[string]interface{}{
		"id":       user.UserID,
		"email":    user.Email,
		"name":     name,
		"avatar":   avatar,
		"bio":      bio,
		"phone":    phone,
		"timezone": timezone,
		"role":     user.Role,
	})
}

func GetUsersHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(r.Context(),
		`SELECT id, email, COALESCE(name,''), role, COALESCE(avatar,''), "createdAt" FROM "User" ORDER BY "createdAt" DESC`)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch users")
		return
	}
	defer rows.Close()

	var users []map[string]interface{}
	for rows.Next() {
		var id, name, role, avatar string
		var email string
		var createdAt interface{}
		if err := rows.Scan(&id, &email, &name, &role, &avatar, &createdAt); err != nil {
			continue
		}
		users = append(users, map[string]interface{}{
			"id": id, "email": email, "name": name, "role": role, "avatar": avatar, "createdAt": createdAt,
		})
	}

	middleware.WriteOK(w, users)
}

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	// Only allow if no users exist (first user)
	var count int
	db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM "User"`).Scan(&count)
	if count > 0 {
		middleware.WriteError(w, http.StatusForbidden, "Registration is closed")
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	_, err := db.Pool.Exec(r.Context(),
		`INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, 'admin', NOW(), NOW())`,
		req.Email, req.Name,
	)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to create user")
		return
	}

	middleware.WriteOK(w, map[string]string{"message": "User created"})
}

func Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/login", LoginHandler)
	r.Post("/register", RegisterHandler)
	r.Get("/me", GetCurrentUserHandler)
	r.Get("/", GetUsersHandler)
	return r
}
