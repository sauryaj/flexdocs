package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sauryaj/flexdocs-go/internal/db"
	"github.com/sauryaj/flexdocs-go/internal/middleware"
)

func SearchAll(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		middleware.WriteOK(w, map[string]interface{}{
			"documents": []interface{}{},
			"passwords": []interface{}{},
			"domains":   []interface{}{},
			"assets":    []interface{}{},
		})
		return
	}

	s := "%" + q + "%"
	ctx := r.Context()

	type SearchResult struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Type  string `json:"type"`
	}

	var results map[string][]SearchResult = map[string][]SearchResult{
		"documents": {},
		"passwords": {},
		"domains":   {},
		"assets":    {},
	}

	// Search documents
	rows, err := db.Pool.Query(ctx, `SELECT id, title FROM "Document" WHERE title ILIKE $1 OR content ILIKE $1 LIMIT 10`, s)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var r SearchResult
			r.Type = "document"
			if rows.Scan(&r.ID, &r.Title) == nil {
				results["documents"] = append(results["documents"], r)
			}
		}
	}

	// Search passwords
	rows2, err := db.Pool.Query(ctx, `SELECT id, name FROM "Password" WHERE name ILIKE $1 OR username ILIKE $1 LIMIT 10`, s)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var r SearchResult
			r.Type = "password"
			if rows2.Scan(&r.ID, &r.Title) == nil {
				results["passwords"] = append(results["passwords"], r)
			}
		}
	}

	// Search domains
	rows3, err := db.Pool.Query(ctx, `SELECT id, name FROM "Domain" WHERE name ILIKE $1 LIMIT 10`, s)
	if err == nil {
		defer rows3.Close()
		for rows3.Next() {
			var r SearchResult
			r.Type = "domain"
			if rows3.Scan(&r.ID, &r.Title) == nil {
				results["domains"] = append(results["domains"], r)
			}
		}
	}

	// Search assets
	rows4, err := db.Pool.Query(ctx, `SELECT id, name FROM "FlexibleAsset" WHERE name ILIKE $1 LIMIT 10`, s)
	if err == nil {
		defer rows4.Close()
		for rows4.Next() {
			var r SearchResult
			r.Type = "asset"
			if rows4.Scan(&r.ID, &r.Title) == nil {
				results["assets"] = append(results["assets"], r)
			}
		}
	}

	middleware.WriteOK(w, results)
}

func HealthCheck(w http.ResponseWriter, r *http.Request) {
	err := db.Pool.Ping(r.Context())
	status := "ok"
	if err != nil {
		status = "error"
	}

	middleware.WriteOK(w, map[string]interface{}{
		"status":   status,
		"database": status,
		"version":  "1.0.0-go",
	})
}

func SearchRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", SearchAll)
	return r
}

func HealthRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", HealthCheck)
	return r
}
