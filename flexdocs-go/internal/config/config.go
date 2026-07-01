package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port          int
	DatabaseURL   string
	EncryptionKey string
	JWTSecret     string
	UploadDir     string
}

func Load() *Config {
	port := 3000
	if p, err := strconv.Atoi(os.Getenv("PORT")); err == nil {
		port = p
	}

	return &Config{
		Port:          port,
		DatabaseURL:   getEnv("DATABASE_URL", "postgresql://flexdocs:flexdocs@localhost:5432/flexdocs"),
		EncryptionKey: getEnv("ENCRYPTION_KEY", ""),
		JWTSecret:     getEnv("JWT_SECRET", getEnv("NEXTAUTH_SECRET", "")),
		UploadDir:     getEnv("UPLOAD_DIR", "uploads"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
