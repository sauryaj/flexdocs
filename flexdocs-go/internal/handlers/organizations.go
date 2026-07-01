package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sauryaj/flexdocs-go/internal/db"
	"github.com/sauryaj/flexdocs-go/internal/middleware"
	"github.com/sauryaj/flexdocs-go/internal/models"
)

func ListOrganizations(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(r.Context(),
		`SELECT id, name, description, website, phone, email, address, logo, "createdAt", "updatedAt"
		 FROM "Organization" ORDER BY name`)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch organizations")
		return
	}
	defer rows.Close()

	var orgs []models.Organization
	for rows.Next() {
		var o models.Organization
		if err := rows.Scan(&o.ID, &o.Name, &o.Description, &o.Website, &o.Phone, &o.Email, &o.Address, &o.Logo, &o.CreatedAt, &o.UpdatedAt); err != nil {
			continue
		}
		orgs = append(orgs, o)
	}
	middleware.WriteOK(w, orgs)
}

func GetOrganization(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var o models.Organization
	err := db.Pool.QueryRow(r.Context(),
		`SELECT id, name, description, website, phone, email, address, logo, "createdAt", "updatedAt"
		 FROM "Organization" WHERE id = $1`, id,
	).Scan(&o.ID, &o.Name, &o.Description, &o.Website, &o.Phone, &o.Email, &o.Address, &o.Logo, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "Organization not found")
		return
	}
	middleware.WriteOK(w, o)
}

func CreateOrganization(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
		Website     *string `json:"website"`
		Phone       *string `json:"phone"`
		Email       *string `json:"email"`
		Address     *string `json:"address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	var o models.Organization
	err := db.Pool.QueryRow(r.Context(),
		`INSERT INTO "Organization" (id, name, description, website, phone, email, address, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())
		 RETURNING id, name, description, website, phone, email, address, "createdAt", "updatedAt"`,
		req.Name, req.Description, req.Website, req.Phone, req.Email, req.Address,
	).Scan(&o.ID, &o.Name, &o.Description, &o.Website, &o.Phone, &o.Email, &o.Address, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to create organization")
		return
	}
	middleware.WriteCreated(w, o)
}

func UpdateOrganization(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Website     *string `json:"website"`
		Phone       *string `json:"phone"`
		Email       *string `json:"email"`
		Address     *string `json:"address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	if req.Name != nil {
		db.Pool.Exec(r.Context(), `UPDATE "Organization" SET name = $1, "updatedAt" = NOW() WHERE id = $2`, *req.Name, id)
	}
	if req.Description != nil {
		db.Pool.Exec(r.Context(), `UPDATE "Organization" SET description = $1, "updatedAt" = NOW() WHERE id = $2`, *req.Description, id)
	}
	if req.Website != nil {
		db.Pool.Exec(r.Context(), `UPDATE "Organization" SET website = $1, "updatedAt" = NOW() WHERE id = $2`, *req.Website, id)
	}
	if req.Phone != nil {
		db.Pool.Exec(r.Context(), `UPDATE "Organization" SET phone = $1, "updatedAt" = NOW() WHERE id = $2`, *req.Phone, id)
	}
	if req.Email != nil {
		db.Pool.Exec(r.Context(), `UPDATE "Organization" SET email = $1, "updatedAt" = NOW() WHERE id = $2`, *req.Email, id)
	}
	if req.Address != nil {
		db.Pool.Exec(r.Context(), `UPDATE "Organization" SET address = $1, "updatedAt" = NOW() WHERE id = $2`, *req.Address, id)
	}

	middleware.WriteOK(w, map[string]string{"message": "Organization updated"})
}

func DeleteOrganization(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := db.Pool.Exec(r.Context(), `DELETE FROM "Organization" WHERE id = $1`, id)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to delete organization")
		return
	}
	middleware.WriteOK(w, map[string]string{"message": "Organization deleted"})
}

func OrganizationRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", ListOrganizations)
	r.Post("/", CreateOrganization)
	r.Get("/{id}", GetOrganization)
	r.Put("/{id}", UpdateOrganization)
	r.Delete("/{id}", DeleteOrganization)
	return r
}
