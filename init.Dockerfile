FROM node:20-slim

RUN apt-get update && apt-get install -y \
    openssl \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY src/lib ./src/lib
RUN npx prisma generate

ENTRYPOINT ["sh", "-c"]
CMD ["npx prisma db push --accept-data-loss && (npx tsx prisma/seed.ts || true) && (npx tsx prisma/seed-orgs || true)"]
