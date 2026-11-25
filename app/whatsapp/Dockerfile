# Agente de WhatsApp. Build a partir da raiz do monorepo:
#   docker compose up -d --build whatsapp
FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY app/api/package.json app/api/
COPY app/web/package.json app/web/
COPY app/whatsapp/package.json app/whatsapp/
RUN npm ci --workspace app/whatsapp --include-workspace-root=false --no-audit --no-fund

COPY app/whatsapp app/whatsapp
WORKDIR /app/app/whatsapp
ENV NODE_ENV=production PORT=7334 HOST=0.0.0.0
EXPOSE 7334
CMD ["npx", "tsx", "src/server.ts"]
