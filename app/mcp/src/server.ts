/**
 * Servidor MCP (Streamable HTTP, sem sessão): POST /mcp com `Authorization: Bearer <token de escopo>`.
 * Cada requisição cria um servidor só com as ferramentas do papel e com o escopo do token.
 * GET /saude responde 200 para o healthcheck.
 */
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { lerToken, type Escopo } from './escopo.js';
import { FERRAMENTAS, POR_PAPEL } from './tools.js';

// .env local (fora do Docker): app/mcp/.env
const envFile = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const SEGREDO = process.env.MCP_ESCOPO_SECRET || 'checkroute-escopo-dev';
const PORTA = Number(process.env.PORT || 7335);

export function criarServidor(escopo: Escopo): McpServer {
  const s = new McpServer({ name: 'checkroute-rotas', version: '0.1.0' });
  for (const nome of POR_PAPEL[escopo.papel]) {
    const f = FERRAMENTAS[nome];
    s.registerTool(
      nome,
      {
        description: f.descricao,
        inputSchema: { rota_id: z.string().min(1).max(20).describe('Id da rota, ex.: T02') },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ rota_id }) => {
        const r = await f.run(escopo, rota_id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(r) }], ...(r.erro ? { isError: true } : {}) };
      },
    );
  }
  return s;
}

const corpo = (req: IncomingMessage) =>
  new Promise<unknown>((ok, falha) => {
    let t = '';
    req.on('data', (c) => { t += c; if (t.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { ok(t ? JSON.parse(t) : undefined); } catch (e) { falha(e); } });
    req.on('error', falha);
  });

export function iniciar(porta = PORTA) {
  const http = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/saude') { res.writeHead(200).end('ok'); return; }
      if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      const escopo = lerToken(bearer, SEGREDO);
      if (!escopo) {
        res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ erro: 'token de escopo ausente, inválido ou expirado' }));
        return;
      }
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return; }
      const servidor = criarServidor(escopo);
      const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transporte.close(); void servidor.close(); });
      await servidor.connect(transporte);
      await transporte.handleRequest(req, res, await corpo(req));
    } catch (e) {
      console.error('[mcp] erro:', e);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ erro: 'falha interna' }));
    }
  });
  return new Promise<typeof http>((ok) => http.listen(porta, '0.0.0.0', () => { console.log(`[mcp] ouvindo em ${porta}`); ok(http); }));
}

if (import.meta.url === `file://${process.argv[1]}`) void iniciar();
