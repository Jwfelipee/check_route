# Servidor MCP (só leitura). Build a partir da raiz do monorepo: docker compose up -d --build
FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY app/api/package.json app/api/
COPY app/web/package.json app/web/
COPY app/whatsapp/package.json app/whatsapp/
COPY app/mcp/package.json app/mcp/
RUN npm ci --workspace app/mcp --include-workspace-root=false --no-audit --no-fund

COPY app/mcp app/mcp
WORKDIR /app/app/mcp
ENV NODE_ENV=production PORT=7335
EXPOSE 7335
CMD ["npx", "tsx", "src/server.ts"]
