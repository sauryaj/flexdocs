package server

import (
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/sauryaj/flexdocs-go/internal/handlers"
	"github.com/sauryaj/flexdocs-go/internal/middleware"
)

func NewRouter() *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(chimw.Compress(5))
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-API-Key"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check (no auth)
	r.Route("/health", func(r chi.Router) {
		r.Get("/", handlers.HealthCheck)
	})

	// Auth routes (no auth required)
	r.Route("/api/auth", func(r chi.Router) {
		r.Mount("/", handlers.Routes())
	})

	// Protected API routes
	r.Route("/api", func(r chi.Router) {
		r.Use(middleware.Auth)
		r.Use(middleware.RateLimit(200, 1*time.Minute))

		// Current user
		r.Get("/me", handlers.GetCurrentUserHandler)
		r.Get("/users", handlers.GetUsersHandler)

		// Core resources
		r.Mount("/documents", handlers.DocumentRoutes())
		r.Mount("/passwords", handlers.PasswordRoutes())
		r.Mount("/domains", handlers.DomainRoutes())
		r.Mount("/tags", handlers.TagRoutes())
		r.Mount("/assets", handlers.AssetRoutes())
		r.Mount("/checklists", handlers.ChecklistRoutes())
		r.Mount("/organizations", handlers.OrganizationRoutes())
		r.Mount("/activity", handlers.ActivityRoutes())
		r.Mount("/search", handlers.SearchRoutes())

		// Placeholder routes for infrastructure (TODO: implement)
		r.Get("/servers", func(w http.ResponseWriter, r *http.Request) {
			middleware.WriteOK(w, []interface{}{})
		})
		r.Get("/cloud", func(w http.ResponseWriter, r *http.Request) {
			middleware.WriteOK(w, []interface{}{})
		})
		r.Get("/network", func(w http.ResponseWriter, r *http.Request) {
			middleware.WriteOK(w, []interface{}{})
		})
		r.Route("/automation", func(r chi.Router) {
			r.Get("/docker", func(w http.ResponseWriter, r *http.Request) {
				middleware.WriteOK(w, []interface{}{})
			})
			r.Get("/schedules", func(w http.ResponseWriter, r *http.Request) {
				middleware.WriteOK(w, []interface{}{})
			})
			r.Get("/changes", func(w http.ResponseWriter, r *http.Request) {
				middleware.WriteOK(w, []interface{}{})
			})
			r.Get("/costs", func(w http.ResponseWriter, r *http.Request) {
				middleware.WriteOK(w, []interface{}{})
			})
		})
		r.Get("/ssl", func(w http.ResponseWriter, r *http.Request) {
			middleware.WriteOK(w, []interface{}{})
		})
		r.Get("/maintenance", func(w http.ResponseWriter, r *http.Request) {
			middleware.WriteOK(w, []interface{}{})
		})
		r.Get("/status", func(w http.ResponseWriter, r *http.Request) {
			middleware.WriteOK(w, []interface{}{})
		})
	})

	// Serve React static files
	webDir := os.Getenv("WEB_DIR")
	if webDir == "" {
		webDir = "./web"
	}
	r.Get("/*", serveStatic(webDir))

	return r
}

func serveStatic(webDir string) http.HandlerFunc {
	fileServer := http.FileServer(http.Dir(webDir))
	return func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(webDir, r.URL.Path)

		// Try to serve the file
		_, err := os.Stat(path)
		if err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback: serve index.html for all non-file routes
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	}
}
