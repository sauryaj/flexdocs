package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/sauryaj/flexdocs-go/internal/auth"
	"github.com/sauryaj/flexdocs-go/internal/db"
	"github.com/sauryaj/flexdocs-go/internal/encryption"
	"github.com/sauryaj/flexdocs-go/internal/middleware"
)

func ListPasswords(w http.ResponseWriter, r *http.Request) {
	_ = auth.UserFromContext(r.Context())
	page, limit := middleware.GetPagination(r)
	offset := (page - 1) * limit
	orgQ := r.URL.Query().Get("organizationId")
	category := r.URL.Query().Get("category")
	search := r.URL.Query().Get("search")
	favorite := r.URL.Query().Get("favorite")

	var where []string
	var args []interface{}
	argIdx := 1

	if orgQ != "" {
		where = append(where, fmt.Sprintf(`p."organizationId" = $%d`, argIdx))
		args = append(args, orgQ)
		argIdx++
	}
	if category != "" {
		where = append(where, fmt.Sprintf(`p.category = $%d`, argIdx))
		args = append(args, category)
		argIdx++
	}
	if favorite == "true" {
		where = append(where, `p."isFavorite" = true`)
	}
	if search != "" {
		where = append(where, fmt.Sprintf(`(p.name ILIKE $%d OR p.username ILIKE $%d)`, argIdx, argIdx+1))
		s := "%" + search + "%"
		args = append(args, s, s)
		argIdx += 2
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM "Password" p %s`, whereClause)
	db.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total)

	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT p.id, p.name, p.username, p.password, p.url, p.notes, p.category, p."isFavorite",
		       p."expiresAt", p."totpIssuer", p."totpPeriod", p."totpDigits",
		       p.customFields, p."userId", p."organizationId", p."createdAt", p."updatedAt"
		FROM "Password" p %s
		ORDER BY p."isFavorite" DESC, p."createdAt" DESC
		LIMIT $%d OFFSET $%d`, whereClause, argIdx, argIdx+1)

	rows, err := db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch passwords")
		return
	}
	defer rows.Close()

	var passwords []map[string]interface{}
	for rows.Next() {
		var id, name, username, pwd, category string
		var url, notes, totpIssuer, customFields *string
		var isFavorite bool
		var expiresAt interface{}
		var totpPeriod, totpDigits int
		var userId, createdAt, updatedAt interface{}
		var orgID *string

		if err := rows.Scan(&id, &name, &username, &pwd, &url, &notes, &category, &isFavorite,
			&expiresAt, &totpIssuer, &totpPeriod, &totpDigits, &customFields, &userId, &orgID, &createdAt, &updatedAt); err != nil {
			continue
		}
		passwords = append(passwords, map[string]interface{}{
			"id":           id,
			"name":         name,
			"username":     username,
			"password":     encryption.Decrypt(pwd),
			"url":          url,
			"notes":        notes,
			"category":     category,
			"isFavorite":   isFavorite,
			"expiresAt":    expiresAt,
			"totpIssuer":   totpIssuer,
			"totpPeriod":   totpPeriod,
			"totpDigits":   totpDigits,
			"customFields": customFields,
			"userId":       userId,
			"organizationId": orgID,
			"createdAt":    createdAt,
			"updatedAt":    updatedAt,
		})
	}

	middleware.WriteOK(w, map[string]interface{}{
		"items":   passwords,
		"total":   total,
		"page":    page,
		"limit":   limit,
		"hasMore": offset+limit < total,
	})
}

func GetPassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var id_, name, username, pwd, category string
	var url, notes, totpIssuer, customFields *string
	var isFavorite bool
	var expiresAt interface{}
	var totpPeriod, totpDigits int
	var userId, orgID, createdAt, updatedAt interface{}

	err := db.Pool.QueryRow(r.Context(),
		`SELECT id, name, username, password, url, notes, category, "isFavorite", "expiresAt",
		        "totpIssuer", "totpPeriod", "totpDigits", customFields, "userId", "organizationId", "createdAt", "updatedAt"
		 FROM "Password" WHERE id = $1`, id,
	).Scan(&id_, &name, &username, &pwd, &url, &notes, &category, &isFavorite,
		&expiresAt, &totpIssuer, &totpPeriod, &totpDigits, &customFields, &userId, &orgID, &createdAt, &updatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "Password not found")
		return
	}

	middleware.WriteOK(w, map[string]interface{}{
		"id":           id_,
		"name":         name,
		"username":     username,
		"password":     encryption.Decrypt(pwd),
		"url":          url,
		"notes":        notes,
		"category":     category,
		"isFavorite":   isFavorite,
		"expiresAt":    expiresAt,
		"totpIssuer":   totpIssuer,
		"totpPeriod":   totpPeriod,
		"totpDigits":   totpDigits,
		"customFields": customFields,
		"userId":       userId,
		"organizationId": orgID,
		"createdAt":    createdAt,
		"updatedAt":    updatedAt,
	})
}

func CreatePassword(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	var req struct {
		Name           string  `json:"name"`
		Username       string  `json:"username"`
		Password       string  `json:"password"`
		URL            *string `json:"url"`
		Notes          *string `json:"notes"`
		Category       string  `json:"category"`
		OrganizationID *string `json:"organizationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	if req.Category == "" {
		req.Category = "general"
	}

	encrypted := encryption.Encrypt(req.Password)

	var id string
	err := db.Pool.QueryRow(r.Context(),
		`INSERT INTO "Password" (id, name, username, password, url, notes, category, "userId", "organizationId", "customFields", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, '[]', NOW(), NOW())
		 RETURNING id`,
		req.Name, req.Username, encrypted, req.URL, req.Notes, req.Category, user.UserID, req.OrganizationID,
	).Scan(&id)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to create password")
		return
	}

	middleware.WriteCreated(w, map[string]string{"id": id, "message": "Password created"})
}

func UpdatePassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name     *string `json:"name"`
		Username *string `json:"username"`
		Password *string `json:"password"`
		URL      *string `json:"url"`
		Notes    *string `json:"notes"`
		Category *string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Name != nil {
		setClauses = append(setClauses, fmt.Sprintf(`name = $%d`, argIdx))
		args = append(args, *req.Name)
		argIdx++
	}
	if req.Username != nil {
		setClauses = append(setClauses, fmt.Sprintf(`username = $%d`, argIdx))
		args = append(args, *req.Username)
		argIdx++
	}
	if req.Password != nil {
		setClauses = append(setClauses, fmt.Sprintf(`password = $%d`, argIdx))
		args = append(args, encryption.Encrypt(*req.Password))
		argIdx++
	}
	if req.URL != nil {
		setClauses = append(setClauses, fmt.Sprintf(`url = $%d`, argIdx))
		args = append(args, *req.URL)
		argIdx++
	}
	if req.Notes != nil {
		setClauses = append(setClauses, fmt.Sprintf(`notes = $%d`, argIdx))
		args = append(args, *req.Notes)
		argIdx++
	}
	if req.Category != nil {
		setClauses = append(setClauses, fmt.Sprintf(`category = $%d`, argIdx))
		args = append(args, *req.Category)
		argIdx++
	}

	if len(setClauses) == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "No fields to update")
		return
	}

	setClauses = append(setClauses, `"updatedAt" = NOW()`)
	args = append(args, id)

	query := fmt.Sprintf(`UPDATE "Password" SET %s WHERE id = $%d RETURNING id`, strings.Join(setClauses, ", "), argIdx)
	var updatedID string
	err := db.Pool.QueryRow(r.Context(), query, args...).Scan(&updatedID)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "Password not found")
		return
	}

	middleware.WriteOK(w, map[string]string{"message": "Password updated"})
}

func DeletePassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := db.Pool.Exec(r.Context(), `DELETE FROM "Password" WHERE id = $1`, id)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to delete password")
		return
	}
	middleware.WriteOK(w, map[string]string{"message": "Password deleted"})
}

func TogglePasswordFavorite(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var isFav bool
	err := db.Pool.QueryRow(r.Context(),
		`UPDATE "Password" SET "isFavorite" = NOT "isFavorite", "updatedAt" = NOW() WHERE id = $1 RETURNING "isFavorite"`, id,
	).Scan(&isFav)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "Password not found")
		return
	}
	middleware.WriteOK(w, map[string]bool{"isFavorite": isFav})
}

func PasswordRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", ListPasswords)
	r.Post("/", CreatePassword)
	r.Get("/{id}", GetPassword)
	r.Put("/{id}", UpdatePassword)
	r.Delete("/{id}", DeletePassword)
	r.Post("/{id}/favorite", TogglePasswordFavorite)
	return r
}
