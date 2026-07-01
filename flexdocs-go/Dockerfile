# Stage 1: Build React frontend
FROM node:20-slim AS frontend
WORKDIR /app
COPY ../flexdocs/package.json ../flexdocs/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install
COPY ../flexdocs/ .
RUN npm run build

# Stage 2: Build Go backend
FROM golang:1.23-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

# Stage 3: Final image
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=backend /server .
COPY --from=frontend /app/.next/standalone ./
COPY --from=frontend /app/.next/static ./.next/static
COPY --from=frontend /app/public ./public
RUN mkdir -p uploads

EXPOSE 3000
ENV PORT=3000
ENV WEB_DIR=./public
CMD ["./server"]
