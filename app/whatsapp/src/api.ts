/** Cliente da API do painel (app/api): só os endpoints que o agente usa. */
import { config } from './config.js';

export interface RespostaExtracao {
  ok: boolean;
  ficha: Record<string, unknown> & { resumo?: string; pergunta_ao_motorista?: string | null };
  faltando: string[];
  pergunta: string | null;
}

export interface RotaDoContato { rota_id: string; rota: string }
/** Quem está falando, como a API cadastrou (o número vem verificado pela Meta; o resto vem do cadastro, nunca da mensagem). */
export interface Contato {
  id: string;
  nome: string;
  papel: 'motorista' | 'transportadora' | 'gestor';
  transportadora: string | null;
  ativo: boolean;
  rotas: RotaDoContato[];
  todas_as_rotas: boolean;
}

export interface Rota { rota_id: string; perna: string; rota: string; destino: string; transportadora: string }

class ErroHttp extends Error {
  constructor(mensagem: string, public status: number) { super(mensagem); }
}

async function chamar<T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`${config.apiUrl}${caminho}`, {
    method: metodo,
    headers: { 'x-internal-token': config.internalToken, ...(corpo ? { 'content-type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new ErroHttp(json.erro ?? `API ${caminho}: HTTP ${r.status}`, r.status);
  return json;
}

export const api = {
  extrair: (relato: string, imagem?: { base64: string; mime: string }) =>
    chamar<RespostaExtracao>('POST', '/ocorrencias/extrair', {
      relato,
      ...(imagem ? { imagemBase64: imagem.base64, imagemTipo: imagem.mime } : {}),
    }),
  /** null se o número não está cadastrado. Erro de rede/API é lançado (não confundir com "não cadastrado"). */
  contato: async (telefone: string): Promise<Contato | null> => {
    try {
      return await chamar<Contato>('GET', `/contatos/por-telefone/${encodeURIComponent(telefone.replace(/\D/g, ''))}`);
    } catch (e) {
      if (e instanceof ErroHttp && e.status === 404) return null;
      throw e;
    }
  },
  /** Token curto do MCP: só as rotas deste contato. */
  escopo: (contatoId: string) => chamar<{ token: string }>('POST', `/contatos/${contatoId}/escopo`),
  // canal e reportado_por: a API grava de onde veio, quem registrou e confere se a rota é dele.
  registrar: (ficha: Record<string, unknown>, contatoId: string) =>
    chamar<{ id: string }>('POST', '/ocorrencias', { ...ficha, canal: 'whatsapp', reportado_por: contatoId }),
  hubs: async () => (await chamar<Rota[]>('GET', '/rotas')).filter((r) => r.perna === 'transferencia'),
};
