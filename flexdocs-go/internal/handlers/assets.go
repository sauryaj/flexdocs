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

func ListTags(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	rows, err := db.Pool.Query(r.Context(),
		`SELECT id, name, color, "userId", "createdAt" FROM "Tag" WHERE "userId" = $1 ORDER BY name`, user.UserID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch tags")
		return
	}
	defer rows.Close()

	var tags []models.Tag
	for rows.Next() {
		var t models.Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color, &t.UserID, &t.CreatedAt); err != nil {
			continue
		}
		tags = append(tags, t)
	}
	middleware.WriteOK(w, tags)
}

func CreateTag(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if req.Color == "" {
		req.Color = "#6366f1"
	}

	var tag models.Tag
	err := db.Pool.QueryRow(r.Context(),
		`INSERT INTO "Tag" (id, name, color, "userId", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())
		 RETURNING id, name, color, "userId", "createdAt"`,
		req.Name, req.Color, user.UserID,
	).Scan(&tag.ID, &tag.Name, &tag.Color, &tag.UserID, &tag.CreatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to create tag")
		return
	}
	middleware.WriteCreated(w, tag)
}

func DeleteTag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := db.Pool.Exec(r.Context(), `DELETE FROM "Tag" WHERE id = $1`, id)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to delete tag")
		return
	}
	middleware.WriteOK(w, map[string]string{"message": "Tag deleted"})
}

// ── Flexible Assets ─────────────────────────────────────────────

func ListAssets(w http.ResponseWriter, r *http.Request) {
	page, limit := middleware.GetPagination(r)
	offset := (page - 1) * limit
	orgQ := r.URL.Query().Get("organizationId")
	assetType := r.URL.Query().Get("type")
	search := r.URL.Query().Get("search")

	var where []string
	var args []interface{}
	argIdx := 1

	if orgQ != "" {
		where = append(where, fmt.Sprintf(`a."organizationId" = $%d`, argIdx))
		args = append(args, orgQ)
		argIdx++
	}
	if assetType != "" {
		where = append(where, fmt.Sprintf(`a."assetType" = $%d`, argIdx))
		args = append(args, assetType)
		argIdx++
	}
	if search != "" {
		where = append(where, fmt.Sprintf(`a.name ILIKE $%d`, argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	var total int
	db.Pool.QueryRow(r.Context(), fmt.Sprintf(`SELECT COUNT(*) FROM "FlexibleAsset" a %s`, whereClause), args...).Scan(&total)

	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT a.id, a.name, a."assetType", a.fields, a.notes, a."isArchived",
		       a."userId", a."organizationId", a."createdAt", a."updatedAt"
		FROM "FlexibleAsset" a %s
		ORDER BY a.name
		LIMIT $%d OFFSET $%d`, whereClause, argIdx, argIdx+1)

	rows, err := db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch assets")
		return
	}
	defer rows.Close()

	var assets []models.FlexibleAsset
	for rows.Next() {
		var a models.FlexibleAsset
		if err := rows.Scan(&a.ID, &a.Name, &a.AssetType, &a.Fields, &a.Notes, &a.IsArchived,
			&a.UserID, &a.OrganizationID, &a.CreatedAt, &a.UpdatedAt); err != nil {
			continue
		}
		assets = append(assets, a)
	}

	middleware.WriteOK(w, models.PaginatedResponse[models.FlexibleAsset]{
		Items: assets, Total: total, Page: page, Limit: limit, HasMore: offset+limit < total,
	})
}

func CreateAsset(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	var req struct {
		Name           string  `json:"name"`
		AssetType      string  `json:"assetType"`
		Fields         string  `json:"fields"`
		Notes          *string `json:"notes"`
		OrganizationID *string `json:"organizationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if req.Fields == "" {
		req.Fields = "{}"
	}

	var a models.FlexibleAsset
	err := db.Pool.QueryRow(r.Context(),
		`INSERT INTO "FlexibleAsset" (id, name, "assetType", fields, notes, "userId", "organizationId", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())
		 RETURNING id, name, "assetType", fields, notes, "isArchived", "userId", "organizationId", "createdAt", "updatedAt"`,
		req.Name, req.AssetType, req.Fields, req.Notes, user.UserID, req.OrganizationID,
	).Scan(&a.ID, &a.Name, &a.AssetType, &a.Fields, &a.Notes, &a.IsArchived,
		&a.UserID, &a.OrganizationID, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to create asset")
		return
	}
	middleware.WriteCreated(w, a)
}

func DeleteAsset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := db.Pool.Exec(r.Context(), `DELETE FROM "FlexibleAsset" WHERE id = $1`, id)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to delete asset")
		return
	}
	middleware.WriteOK(w, map[string]string{"message": "Asset deleted"})
}

// ── Checklists ─────────────────────────────────────────────────

func ListChecklists(w http.ResponseWriter, r *http.Request) {
	page, limit := middleware.GetPagination(r)
	offset := (page - 1) * limit
	orgQ := r.URL.Query().Get("organizationId")
	category := r.URL.Query().Get("category")

	var where []string
	var args []interface{}
	argIdx := 1

	if orgQ != "" {
		where = append(where, fmt.Sprintf(`c."organizationId" = $%d`, argIdx))
		args = append(args, orgQ)
		argIdx++
	}
	if category != "" {
		where = append(where, fmt.Sprintf(`c.category = $%d`, argIdx))
		args = append(args, category)
		argIdx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	var total int
	db.Pool.QueryRow(r.Context(), fmt.Sprintf(`SELECT COUNT(*) FROM "Checklist" c %s`, whereClause), args...).Scan(&total)

	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT c.id, c.name, c.description, c.category, c."isComplete", c."isArchived",
		       c."dueDate", c."userId", c."organizationId", c."createdAt", c."updatedAt"
		FROM "Checklist" c %s
		ORDER BY c."isComplete", c."dueDate" ASC NULLS LAST
		LIMIT $%d OFFSET $%d`, whereClause, argIdx, argIdx+1)

	rows, err := db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch checklists")
		return
	}
	defer rows.Close()

	var checklists []models.Checklist
	for rows.Next() {
		var c models.Checklist
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.Category, &c.IsComplete, &c.IsArchived,
			&c.DueDate, &c.UserID, &c.OrganizationID, &c.CreatedAt, &c.UpdatedAt); err != nil {
			continue
		}

		// Fetch items
		itemRows, err := db.Pool.Query(r.Context(),
			`SELECT id, text, "isComplete", "order", "checklistId", "createdAt", "updatedAt"
			 FROM "ChecklistItem" WHERE "checklistId" = $1 ORDER BY "order"`, c.ID)
		if err == nil {
			for itemRows.Next() {
				var item models.ChecklistItem
				if err := itemRows.Scan(&item.ID, &item.Text, &item.IsComplete, &item.Order, &item.ChecklistID, &item.CreatedAt, &item.UpdatedAt); err == nil {
					c.Items = append(c.Items, item)
				}
			}
			itemRows.Close()
		}

		checklists = append(checklists, c)
	}

	middleware.WriteOK(w, models.PaginatedResponse[models.Checklist]{
		Items: checklists, Total: total, Page: page, Limit: limit, HasMore: offset+limit < total,
	})
}

func CreateChecklist(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	var req struct {
		Name           string  `json:"name"`
		Description    *string `json:"description"`
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

	var c models.Checklist
	err := db.Pool.QueryRow(r.Context(),
		`INSERT INTO "Checklist" (id, name, description, category, "userId", "organizationId", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())
		 RETURNING id, name, description, category, "isComplete", "isArchived", "dueDate", "userId", "organizationId", "createdAt", "updatedAt"`,
		req.Name, req.Description, req.Category, user.UserID, req.OrganizationID,
	).Scan(&c.ID, &c.Name, &c.Description, &c.Category, &c.IsComplete, &c.IsArchived,
		&c.DueDate, &c.UserID, &c.OrganizationID, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to create checklist")
		return
	}
	middleware.WriteCreated(w, c)
}

func AddChecklistItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	var item models.ChecklistItem
	err := db.Pool.QueryRow(r.Context(),
		`INSERT INTO "ChecklistItem" (id, text, "checklistId", "order", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, (SELECT COALESCE(MAX("order"),0)+1 FROM "ChecklistItem" WHERE "checklistId" = $2), NOW(), NOW())
		 RETURNING id, text, "isComplete", "order", "checklistId", "createdAt", "updatedAt"`,
		req.Text, id,
	).Scan(&item.ID, &item.Text, &item.IsComplete, &item.Order, &item.ChecklistID, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to add item")
		return
	}
	middleware.WriteCreated(w, item)
}

func ToggleChecklistItem(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "itemId")
	var isComplete bool
	err := db.Pool.QueryRow(r.Context(),
		`UPDATE "ChecklistItem" SET "isComplete" = NOT "isComplete", "updatedAt" = NOW() WHERE id = $1 RETURNING "isComplete"`, itemID,
	).Scan(&isComplete)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "Item not found")
		return
	}
	middleware.WriteOK(w, map[string]bool{"isComplete": isComplete})
}

func DeleteChecklistItem(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "itemId")
	_, err := db.Pool.Exec(r.Context(), `DELETE FROM "ChecklistItem" WHERE id = $1`, itemID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to delete item")
		return
	}
	middleware.WriteOK(w, map[string]string{"message": "Item deleted"})
}

func TagRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", ListTags)
	r.Post("/", CreateTag)
	r.Delete("/{id}", DeleteTag)
	return r
}

func AssetRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", ListAssets)
	r.Post("/", CreateAsset)
	r.Delete("/{id}", DeleteAsset)
	return r
}

func ChecklistRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", ListChecklists)
	r.Post("/", CreateChecklist)
	r.Post("/{id}/items", AddChecklistItem)
	r.Put("/{id}/items/{itemId}/toggle", ToggleChecklistItem)
	r.Delete("/{id}/items/{itemId}", DeleteChecklistItem)
	return r
}
