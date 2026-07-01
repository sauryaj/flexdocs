package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/sauryaj/flexdocs-go/internal/auth"
	"github.com/sauryaj/flexdocs-go/internal/db"
	"github.com/sauryaj/flexdocs-go/internal/middleware"
	"github.com/sauryaj/flexdocs-go/internal/models"
)

func ListDocuments(w http.ResponseWriter, r *http.Request) {
	_ = auth.UserFromContext(r.Context()) // authenticated but not filtered per user in single-user mode
	page, limit := middleware.GetPagination(r)
	offset := (page - 1) * limit
	orgQ := r.URL.Query().Get("organizationId")
	category := r.URL.Query().Get("category")
	search := r.URL.Query().Get("search")

	var where []string
	var args []interface{}
	argIdx := 1

	if orgQ != "" {
		where = append(where, fmt.Sprintf(`d."organizationId" = $%d`, argIdx))
		args = append(args, orgQ)
		argIdx++
	}
	if category != "" {
		where = append(where, fmt.Sprintf(`d.category = $%d`, argIdx))
		args = append(args, category)
		argIdx++
	}
	if search != "" {
		where = append(where, fmt.Sprintf(`(d.title ILIKE $%d OR d.content ILIKE $%d)`, argIdx, argIdx+1))
		s := "%" + search + "%"
		args = append(args, s, s)
		argIdx += 2
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	// Count total
	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM "Document" d %s`, whereClause)
	db.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total)

	// Fetch with pagination
	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT d.id, d.title, d.content, d.type, d.category, d."isPinned", d."isArchived",
		       d."folderId", d."userId", d."organizationId", d."createdAt", d."updatedAt"
		FROM "Document" d %s
		ORDER BY d."isPinned" DESC, d."createdAt" DESC
		LIMIT $%d OFFSET $%d`, whereClause, argIdx, argIdx+1)

	rows, err := db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch documents")
		return
	}
	defer rows.Close()

	var docs []models.Document
	for rows.Next() {
		var doc models.Document
		if err := rows.Scan(&doc.ID, &doc.Title, &doc.Content, &doc.Type, &doc.Category,
			&doc.IsPinned, &doc.IsArchived, &doc.FolderID, &doc.UserID, &doc.OrganizationID,
			&doc.CreatedAt, &doc.UpdatedAt); err != nil {
			continue
		}
		docs = append(docs, doc)
	}

	middleware.WriteOK(w, models.PaginatedResponse[models.Document]{
		Items:   docs,
		Total:   total,
		Page:    page,
		Limit:   limit,
		HasMore: offset+limit < total,
	})
}

func GetDocument(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var doc models.Document
	err := db.Pool.QueryRow(r.Context(),
		`SELECT id, title, content, type, category, "isPinned", "isArchived", "folderId", "userId", "organizationId", "createdAt", "updatedAt"
		 FROM "Document" WHERE id = $1`, id,
	).Scan(&doc.ID, &doc.Title, &doc.Content, &doc.Type, &doc.Category,
		&doc.IsPinned, &doc.IsArchived, &doc.FolderID, &doc.UserID, &doc.OrganizationID,
		&doc.CreatedAt, &doc.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "Document not found")
		return
	}
	middleware.WriteOK(w, doc)
}

func CreateDocument(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	var req struct {
		Title          string  `json:"title"`
		Content        string  `json:"content"`
		Type           string  `json:"type"`
		Category       string  `json:"category"`
		FolderID       *string `json:"folderId"`
		OrganizationID *string `json:"organizationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	if req.Type == "" {
		req.Type = "markdown"
	}
	if req.Category == "" {
		req.Category = "general"
	}

	var doc models.Document
	err := db.Pool.QueryRow(r.Context(),
		`INSERT INTO "Document" (id, title, content, type, category, "userId", "organizationId", "folderId", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
		 RETURNING id, title, content, type, category, "isPinned", "isArchived", "folderId", "userId", "organizationId", "createdAt", "updatedAt"`,
		req.Title, req.Content, req.Type, req.Category, user.UserID, req.OrganizationID, req.FolderID,
	).Scan(&doc.ID, &doc.Title, &doc.Content, &doc.Type, &doc.Category,
		&doc.IsPinned, &doc.IsArchived, &doc.FolderID, &doc.UserID, &doc.OrganizationID,
		&doc.CreatedAt, &doc.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to create document")
		return
	}

	middleware.WriteCreated(w, doc)
}

func UpdateDocument(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Title    *string `json:"title"`
		Content  *string `json:"content"`
		Category *string `json:"category"`
		IsPinned *bool   `json:"isPinned"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Title != nil {
		setClauses = append(setClauses, fmt.Sprintf(`title = $%d`, argIdx))
		args = append(args, *req.Title)
		argIdx++
	}
	if req.Content != nil {
		setClauses = append(setClauses, fmt.Sprintf(`content = $%d`, argIdx))
		args = append(args, *req.Content)
		argIdx++
	}
	if req.Category != nil {
		setClauses = append(setClauses, fmt.Sprintf(`category = $%d`, argIdx))
		args = append(args, *req.Category)
		argIdx++
	}
	if req.IsPinned != nil {
		setClauses = append(setClauses, fmt.Sprintf(`"isPinned" = $%d`, argIdx))
		args = append(args, *req.IsPinned)
		argIdx++
	}

	if len(setClauses) == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "No fields to update")
		return
	}

	setClauses = append(setClauses, `"updatedAt" = NOW()`)
	args = append(args, id)

	query := fmt.Sprintf(`UPDATE "Document" SET %s WHERE id = $%d RETURNING id, title, content, type, category, "isPinned", "isArchived", "folderId", "userId", "organizationId", "createdAt", "updatedAt"`,
		strings.Join(setClauses, ", "), argIdx)

	var doc models.Document
	err := db.Pool.QueryRow(r.Context(), query, args...).Scan(
		&doc.ID, &doc.Title, &doc.Content, &doc.Type, &doc.Category,
		&doc.IsPinned, &doc.IsArchived, &doc.FolderID, &doc.UserID, &doc.OrganizationID,
		&doc.CreatedAt, &doc.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "Document not found")
		return
	}

	middleware.WriteOK(w, doc)
}

func DeleteDocument(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tag, _ := json.Marshal(map[string]string{"action": "delete", "resource": "document"})
	_ = tag

	_, err := db.Pool.Exec(r.Context(), `DELETE FROM "Document" WHERE id = $1`, id)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to delete document")
		return
	}
	middleware.WriteOK(w, map[string]string{"message": "Document deleted"})
}

func DocumentRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", ListDocuments)
	r.Post("/", CreateDocument)
	r.Get("/{id}", GetDocument)
	r.Put("/{id}", UpdateDocument)
	r.Delete("/{id}", DeleteDocument)
	return r
}
