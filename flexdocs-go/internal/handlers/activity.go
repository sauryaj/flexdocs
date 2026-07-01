package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/sauryaj/flexdocs-go/internal/db"
	"github.com/sauryaj/flexdocs-go/internal/middleware"
	"github.com/sauryaj/flexdocs-go/internal/models"
)

func ListActivity(w http.ResponseWriter, r *http.Request) {
	page, limit := middleware.GetPagination(r)
	offset := (page - 1) * limit
	action := r.URL.Query().Get("action")
	resourceType := r.URL.Query().Get("resourceType")

	var where []string
	var args []interface{}
	argIdx := 1

	if action != "" {
		where = append(where, fmt.Sprintf(`a.action = $%d`, argIdx))
		args = append(args, action)
		argIdx++
	}
	if resourceType != "" {
		where = append(where, fmt.Sprintf(`a."resourceType" = $%d`, argIdx))
		args = append(args, resourceType)
		argIdx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	var total int
	db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM \"ActivityLog\" a "+whereClause, args...).Scan(&total)

	args = append(args, limit, offset)
	query := fmt.Sprintf(
		`SELECT a.id, a."userId", a.action, a."resourceType", a."resourceId", a."resourceName", a.details, a.ip, a."createdAt"
		 FROM "ActivityLog" a %s ORDER BY a."createdAt" DESC LIMIT $%d OFFSET $%d`,
		whereClause, argIdx, argIdx+1,
	)

	rows, err := db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch activity")
		return
	}
	defer rows.Close()

	var logs []models.ActivityLog
	for rows.Next() {
		var l models.ActivityLog
		if err := rows.Scan(&l.ID, &l.UserID, &l.Action, &l.ResourceType, &l.ResourceID, &l.ResourceName, &l.Details, &l.IP, &l.CreatedAt); err != nil {
			continue
		}
		logs = append(logs, l)
	}

	middleware.WriteOK(w, models.PaginatedResponse[models.ActivityLog]{
		Items: logs, Total: total, Page: page, Limit: limit, HasMore: offset+limit < total,
	})
}

func ActivityRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", ListActivity)
	return r
}
