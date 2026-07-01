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

func ListDomains(w http.ResponseWriter, r *http.Request) {
	page, limit := middleware.GetPagination(r)
	offset := (page - 1) * limit
	orgQ := r.URL.Query().Get("organizationId")
	status := r.URL.Query().Get("status")
	search := r.URL.Query().Get("search")

	var where []string
	var args []interface{}
	argIdx := 1

	if orgQ != "" {
		where = append(where, fmt.Sprintf(`d."organizationId" = $%d`, argIdx))
		args = append(args, orgQ)
		argIdx++
	}
	if status != "" {
		where = append(where, fmt.Sprintf(`d.status = $%d`, argIdx))
		args = append(args, status)
		argIdx++
	}
	if search != "" {
		where = append(where, fmt.Sprintf(`d.name ILIKE $%d`, argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	var total int
	db.Pool.QueryRow(r.Context(), fmt.Sprintf(`SELECT COUNT(*) FROM "Domain" d %s`, whereClause), args...).Scan(&total)

	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT d.id, d.name, d.registrar, d.nameservers, d."expiresAt", d."autoRenew", d.status, d.notes,
		       d."userId", d."organizationId", d."whoisCreated", d."whoisCountry", d."whoisState",
		       d."privacyProtection", d."dnsRecords", d."lastWhoisCheck", d."lastDnsCheck",
		       d."createdAt", d."updatedAt"
		FROM "Domain" d %s
		ORDER BY d."expiresAt" ASC NULLS LAST
		LIMIT $%d OFFSET $%d`, whereClause, argIdx, argIdx+1)

	rows, err := db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch domains")
		return
	}
	defer rows.Close()

	var domains []models.Domain
	for rows.Next() {
		var dom models.Domain
		if err := rows.Scan(&dom.ID, &dom.Name, &dom.Registrar, &dom.Nameservers, &dom.ExpiresAt,
			&dom.AutoRenew, &dom.Status, &dom.Notes, &dom.UserID, &dom.OrganizationID,
			&dom.WhoisCreated, &dom.WhoisCountry, &dom.WhoisState, &dom.PrivacyProtection,
			&dom.DNSRecords, &dom.LastWhoisCheck, &dom.LastDnsCheck, &dom.CreatedAt, &dom.UpdatedAt); err != nil {
			continue
		}
		domains = append(domains, dom)
	}

	middleware.WriteOK(w, models.PaginatedResponse[models.Domain]{
		Items:   domains,
		Total:   total,
		Page:    page,
		Limit:   limit,
		HasMore: offset+limit < total,
	})
}

func GetDomain(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var dom models.Domain
	err := db.Pool.QueryRow(r.Context(),
		`SELECT id, name, registrar, nameservers, "expiresAt", "autoRenew", status, notes,
		        "userId", "organizationId", "whoisCreated", "whoisCountry", "whoisState",
		        "privacyProtection", "dnsRecords", "lastWhoisCheck", "lastDnsCheck",
		        "createdAt", "updatedAt"
		 FROM "Domain" WHERE id = $1`, id,
	).Scan(&dom.ID, &dom.Name, &dom.Registrar, &dom.Nameservers, &dom.ExpiresAt,
		&dom.AutoRenew, &dom.Status, &dom.Notes, &dom.UserID, &dom.OrganizationID,
		&dom.WhoisCreated, &dom.WhoisCountry, &dom.WhoisState, &dom.PrivacyProtection,
		&dom.DNSRecords, &dom.LastWhoisCheck, &dom.LastDnsCheck, &dom.CreatedAt, &dom.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "Domain not found")
		return
	}
	middleware.WriteOK(w, dom)
}

func CreateDomain(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	var req struct {
		Name           string  `json:"name"`
		Registrar      *string `json:"registrar"`
		Nameservers    *string `json:"nameservers"`
		ExpiresAt      *string `json:"expiresAt"`
		AutoRenew      *bool   `json:"autoRenew"`
		Status         *string `json:"status"`
		Notes          *string `json:"notes"`
		OrganizationID *string `json:"organizationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	autoRenew := true
	if req.AutoRenew != nil {
		autoRenew = *req.AutoRenew
	}
	status := "active"
	if req.Status != nil {
		status = *req.Status
	}

	var dom models.Domain
	err := db.Pool.QueryRow(r.Context(),
		`INSERT INTO "Domain" (id, name, registrar, nameservers, "autoRenew", status, notes, "userId", "organizationId", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		 RETURNING id, name, "createdAt"`,
		req.Name, req.Registrar, req.Nameservers, autoRenew, status, req.Notes, user.UserID, req.OrganizationID,
	).Scan(&dom.ID, &dom.Name, &dom.CreatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to create domain: "+err.Error())
		return
	}

	middleware.WriteCreated(w, dom)
}

func UpdateDomain(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Registrar   *string `json:"registrar"`
		Nameservers *string `json:"nameservers"`
		ExpiresAt   *string `json:"expiresAt"`
		AutoRenew   *bool   `json:"autoRenew"`
		Status      *string `json:"status"`
		Notes       *string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Registrar != nil {
		setClauses = append(setClauses, fmt.Sprintf(`registrar = $%d`, argIdx))
		args = append(args, *req.Registrar)
		argIdx++
	}
	if req.Nameservers != nil {
		setClauses = append(setClauses, fmt.Sprintf(`nameservers = $%d`, argIdx))
		args = append(args, *req.Nameservers)
		argIdx++
	}
	if req.AutoRenew != nil {
		setClauses = append(setClauses, fmt.Sprintf(`"autoRenew" = $%d`, argIdx))
		args = append(args, *req.AutoRenew)
		argIdx++
	}
	if req.Status != nil {
		setClauses = append(setClauses, fmt.Sprintf(`status = $%d`, argIdx))
		args = append(args, *req.Status)
		argIdx++
	}
	if req.Notes != nil {
		setClauses = append(setClauses, fmt.Sprintf(`notes = $%d`, argIdx))
		args = append(args, *req.Notes)
		argIdx++
	}

	if len(setClauses) == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "No fields to update")
		return
	}

	setClauses = append(setClauses, `"updatedAt" = NOW()`)
	args = append(args, id)

	query := fmt.Sprintf(`UPDATE "Domain" SET %s WHERE id = $%d RETURNING id`, strings.Join(setClauses, ", "), argIdx)
	var updatedID string
	err := db.Pool.QueryRow(r.Context(), query, args...).Scan(&updatedID)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "Domain not found")
		return
	}

	middleware.WriteOK(w, map[string]string{"message": "Domain updated"})
}

func DeleteDomain(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := db.Pool.Exec(r.Context(), `DELETE FROM "Domain" WHERE id = $1`, id)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to delete domain")
		return
	}
	middleware.WriteOK(w, map[string]string{"message": "Domain deleted"})
}

func ListDomainRevisions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rows, err := db.Pool.Query(r.Context(),
		`SELECT id, "domainId", data, source, message, "userId", "createdAt"
		 FROM "DomainRevision" WHERE "domainId" = $1 ORDER BY "createdAt" DESC`, id)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "Failed to fetch revisions")
		return
	}
	defer rows.Close()

	var revisions []models.DomainRevision
	for rows.Next() {
		var rev models.DomainRevision
		if err := rows.Scan(&rev.ID, &rev.DomainID, &rev.Data, &rev.Source, &rev.Message, &rev.UserID, &rev.CreatedAt); err != nil {
			continue
		}
		revisions = append(revisions, rev)
	}

	middleware.WriteOK(w, revisions)
}

func DomainRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", ListDomains)
	r.Post("/", CreateDomain)
	r.Get("/{id}", GetDomain)
	r.Put("/{id}", UpdateDomain)
	r.Delete("/{id}", DeleteDomain)
	r.Get("/{id}/revisions", ListDomainRevisions)
	return r
}
