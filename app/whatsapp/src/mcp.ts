/**
 * Consulta aos dados da rota pelo servidor MCP, com o escopo do contato que está conversando.
 * O token é emitido pela API para ESTE contato (só as rotas dele). Se o modelo pedir outra rota,
 * o MCP recusa: a garantia está no servidor, não no prompt.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type Anthropic from '@anthropic-ai/sdk';
import { api } from './api.js';
import { config } from './config.js';

export interface Consulta {
  ferramentas: Anthropic.Beta.BetaTool[];
  chamar(nome: string, entrada: Record<string, unknown>): Promise<string>;
  fechar(): Promise<void>;
}

/** null se o MCP não responder: o agente segue só com o registro de ocorrências. */
export async function abrirConsulta(contatoId: string): Promise<Consulta | null> {
  const cliente = new Client({ name: 'checkroute-whatsapp', version: '0.1.0' });
  try {
    const { token } = await api.escopo(contatoId);
    await cliente.connect(new StreamableHTTPClientTransport(new URL(config.mcpUrl), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    const { tools } = await cliente.listTools();
    return {
      ferramentas: tools.map((t) => ({ name: t.name, description: t.description ?? '', input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema })),
      async chamar(nome, entrada) {
        const r = await cliente.callTool({ name: nome, arguments: entrada });
        const c = (r.content as { type: string; text?: string }[]).find((x) => x.type === 'text');
        return c?.text ?? '{}';
      },
      fechar: () => cliente.close().catch(() => undefined),
    };
  } catch (e) {
    console.error('[wa] MCP indisponível:', (e as Error).message);
    await cliente.close().catch(() => undefined);
    return null;
  }
}
