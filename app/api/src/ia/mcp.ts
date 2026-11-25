/**
 * Cliente do servidor MCP (app/mcp): os dados específicos da rota que a IA consulta.
 * Cada sugestão abre uma conexão própria com um token de escopo curto (stateless) e registra
 * o que foi chamado e devolvido: o painel mostra "a IA consultou…" e o controle de números
 * inventados confere o texto contra estes resultados.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MCPCallToolResultLike, MCPClientLike, MCPToolLike } from '@anthropic-ai/sdk/helpers/beta/mcp';
import { emitirToken, type Escopo } from '../escopo.js';

export const MCP_URL = () => process.env.MCP_URL || 'http://localhost:7335/mcp';
export const SEGREDO_ESCOPO = () => process.env.MCP_ESCOPO_SECRET || 'checkroute-escopo-dev';

/** Falha da IA com motivo, para a tela explicar e oferecer "Tentar de novo". */
export class ErroIa extends Error {
  constructor(public motivo: 'sem_chave' | 'falha_ia' | 'mcp_indisponivel', mensagem: string) {
    super(mensagem);
  }
}

export interface ChamadaRegistrada { nome: string; entrada: Record<string, unknown>; resultado: unknown }

export interface ConexaoMcp {
  tools: MCPToolLike[];
  /** Cliente que registra cada chamada (usado pelo toolRunner e pelo modo simulado). */
  client: MCPClientLike;
  chamadas: ChamadaRegistrada[];
  fechar(): Promise<void>;
}

export const ESCOPO_PAINEL: Omit<Escopo, 'exp'> = { sub: 'painel', papel: 'painel', rotas: '*' };

export async function abrirMcp(escopo: Omit<Escopo, 'exp'> = ESCOPO_PAINEL): Promise<ConexaoMcp> {
  const token = emitirToken(escopo, SEGREDO_ESCOPO(), 300);
  const real = new Client({ name: 'checkroute-api', version: '0.1.0' });
  try {
    await real.connect(new StreamableHTTPClientTransport(new URL(MCP_URL()), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    const { tools } = await real.listTools();
    const chamadas: ChamadaRegistrada[] = [];
    const client: MCPClientLike = {
      async callTool(p) {
        const r = (await real.callTool({ name: p.name, arguments: p.arguments })) as unknown as MCPCallToolResultLike;
        const texto = r.content.find((c) => c.type === 'text');
        let resultado: unknown = texto && 'text' in texto ? texto.text : null;
        try { resultado = JSON.parse(String(resultado)); } catch { /* texto puro */ }
        chamadas.push({ nome: p.name, entrada: p.arguments ?? {}, resultado });
        return r;
      },
    };
    return { tools: tools as MCPToolLike[], client, chamadas, fechar: () => real.close().catch(() => undefined) };
  } catch (e) {
    await real.close().catch(() => undefined);
    throw new ErroIa('mcp_indisponivel', `Servidor MCP indisponível (${(e as Error).message}).`);
  }
}
