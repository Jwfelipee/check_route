# API do painel Saúde das rotas. Build a partir da raiz do monorepo:
#   docker compose up -d --build
FROM node:24-bookworm-slim

WORKDIR /app

# Só os manifests primeiro, para o npm ci ficar em cache entre builds.
COPY package.json package-lock.json ./
COPY app/api/package.json app/api/
COPY app/web/package.json app/web/
COPY app/whatsapp/package.json app/whatsapp/
RUN npm ci --workspace app/api --include-workspace-root=false --no-audit --no-fund

COPY app/api app/api
# JSON do front: fallback quando o ETL não rodou e guia de boas práticas.
COPY app/web/public/data app/web/public/data

WORKDIR /app/app/api
ENV NODE_ENV=production \
    PORT=7333 \
    HOST=0.0.0.0
EXPOSE 7333

CMD ["npx", "tsx", "src/server.ts"]
