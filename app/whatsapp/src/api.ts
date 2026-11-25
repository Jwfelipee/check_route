/** Cliente da API do painel (app/api): só os endpoints que o agente usa. */
import { config } from './config.js';

export interface RespostaExtracao {
  ok: boolean;
  ficha: Record<string, unknown> & { resumo?: string; pergunta_ao_motorista?: string | null };
  faltando: string[];
  pergunta: string | null;
}

export interface Rota { rota_id: string; perna: string; rota: string; destino: string; transportadora: string }

async function chamar<T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`${config.apiUrl}${caminho}`, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `API ${caminho}: HTTP ${r.status}`);
  return json;
}

export const api = {
  extrair: (relato: string, imagem?: { base64: string; mime: string }) =>
    chamar<RespostaExtracao>('POST', '/ocorrencias/extrair', {
      relato,
      ...(imagem ? { imagemBase64: imagem.base64, imagemTipo: imagem.mime } : {}),
    }),
  registrar: (ficha: Record<string, unknown>) => chamar<{ id: string }>('POST', '/ocorrencias', ficha),
  hubs: async () => (await chamar<Rota[]>('GET', '/rotas')).filter((r) => r.perna === 'transferencia'),
};
