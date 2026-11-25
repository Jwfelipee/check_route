/** Lista as ferramentas e chama cada uma na T02 com o escopo do painel. Uso: npm run mcp:smoke -w app/mcp */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { emitirToken } from '../src/escopo.js';

const url = process.env.MCP_URL || 'http://localhost:7335/mcp';
const token = emitirToken({ sub: 'painel', papel: 'painel', rotas: '*' }, process.env.MCP_ESCOPO_SECRET || 'checkroute-escopo-dev');
const c = new Client({ name: 'smoke', version: '0.0.1' });
await c.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
const { tools } = await c.listTools();
console.log(`${tools.length} ferramentas: ${tools.map((t) => t.name).join(', ')}\n`);
for (const t of tools) {
  const r = await c.callTool({ name: t.name, arguments: { rota_id: process.argv[2] || 'T02' } });
  const texto = (r.content as { text: string }[])[0].text;
  console.log(`• ${t.name}${r.isError ? ' [ERRO]' : ''}: ${texto.slice(0, 230)}${texto.length > 230 ? '…' : ''}`);
}
await c.close();
