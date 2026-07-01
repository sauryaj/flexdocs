package encryption

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

const (
	ivLength    = 16
	keyLength   = 32
	iterations  = 100000
	saltDefault = "flexdocs-salt-v1"
)

var (
	derivedKey []byte
)

func init() {
	key := os.Getenv("ENCRYPTION_KEY")
	if key == "" {
		key = os.Getenv("NEXTAUTH_SECRET")
	}
	if key == "" {
		panic("ENCRYPTION_KEY or NEXTAUTH_SECRET must be set")
	}
	salt := os.Getenv("ENCRYPTION_SALT")
	if salt == "" {
		salt = saltDefault
	}
	derivedKey = pbkdf2.Key([]byte(key), []byte(salt), iterations, keyLength, sha512.New)
}

// Encrypt encrypts plaintext using AES-256-GCM. Format: iv:tag:ciphertext (hex)
func Encrypt(plaintext string) string {
	if plaintext == "" {
		return plaintext
	}

	block, err := aes.NewCipher(derivedKey)
	if err != nil {
		panic(err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		panic(err)
	}

	iv := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		panic(err)
	}

	ciphertext := gcm.Seal(nil, iv, []byte(plaintext), nil)
	encrypted := ciphertext[:len(ciphertext)-gcm.Overhead()]
	tag := ciphertext[len(ciphertext)-gcm.Overhead():]

	return fmt.Sprintf("%s:%s:%s", hex.EncodeToString(iv), hex.EncodeToString(tag), hex.EncodeToString(encrypted))
}

// Decrypt decrypts ciphertext. Returns original string if not encrypted.
func Decrypt(ciphertext string) string {
	if ciphertext == "" {
		return ciphertext
	}

	parts := strings.SplitN(ciphertext, ":", 3)
	if len(parts) != 3 {
		return ciphertext // Not encrypted
	}

	iv, err := hex.DecodeString(parts[0])
	if err != nil {
		return ciphertext
	}
	tag, err := hex.DecodeString(parts[1])
	if err != nil {
		return ciphertext
	}
	encrypted, err := hex.DecodeString(parts[2])
	if err != nil {
		return ciphertext
	}

	block, err := aes.NewCipher(derivedKey)
	if err != nil {
		return ciphertext
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return ciphertext
	}

	// GCM expects ciphertext+tag combined
	combined := append(encrypted, tag...)
	plaintext, err := gcm.Open(nil, iv, combined, nil)
	if err != nil {
		return ciphertext // Decryption failed, return as-is
	}

	return string(plaintext)
}

// HashForSearch creates a deterministic HMAC hash for searching encrypted fields
func HashForSearch(plaintext string) string {
	h := hmac.New(sha256.New, derivedKey)
	h.Write([]byte(strings.ToLower(strings.TrimSpace(plaintext))))
	return hex.EncodeToString(h.Sum(nil))
}

// HashAPIKey creates a SHA-256 hash of an API key
func HashAPIKey(key string) string {
	h := sha256.Sum256([]byte(key))
	return hex.EncodeToString(h[:])
}

// VerifyAPIKey compares an API key against its hash (constant-time)
func VerifyAPIKey(key, hash string) bool {
	keyHash := HashAPIKey(key)
	return subtle.ConstantTimeCompare([]byte(keyHash), []byte(hash)) == 1
}
