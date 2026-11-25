/**
 * Cliente do painel de atendimentos (app/whatsapp, rotas /atendimento).
 * Endereço: VITE_WA_URL. Token: digitado na tela e guardado só neste navegador
 * (nunca vai no build, que é público).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const WA_URL = ((import.meta.env.VITE_WA_URL as string | undefined) ?? '').replace(/\/$/, '');
const CHAVE_TOKEN = 'checkroute:wa-token';
const CHAVE_NOME = 'checkroute:wa-atendente';

const ler = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const gravar = (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* sem storage */ } };
export const tokenSalvo = () => ler(CHAVE_TOKEN);
export const salvarToken = (v: string) => gravar(CHAVE_TOKEN, v.trim());
export const atendenteSalvo = () => ler(CHAVE_NOME);
export const salvarAtendente = (v: string) => gravar(CHAVE_NOME, v.trim());

export type Autor = 'motorista' | 'bot' | 'atendente' | 'sistema';
export interface Evento { id: number; autor: Autor; tipo: string; texto: string; criado_em: string }
export interface ConversaResumo {
  telefone: string; nome: string | null; modo: 'bot' | 'humano'; atendente: string | null;
  aguardando_confirmacao: boolean; faltando: string[]; tem_ficha: boolean; expirada: boolean;
  iniciada_em: string; atualizado_em: string;
  ultimo_autor: Autor | null; ultima_previa: string | null; ultima_em: string | null; ultima_do_motorista: string | null;
}
export interface ConversaDetalhe {
  telefone: string; nome: string | null; modo: 'bot' | 'humano'; atendente: string | null;
  aguardando_confirmacao: boolean; ficha: Record<string, unknown> | null; faltando: string[]; resumo: string | null; eventos: Evento[];
}

export class ErroAtendimento extends Error { constructor(msg: string, public status: number) { super(msg); } }

async function chamar<T>(caminho: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!WA_URL) throw new ErroAtendimento('VITE_WA_URL não configurado no painel.', 0);
  const r = await fetch(`${WA_URL}${caminho}`, {
    method: init?.method ?? 'GET',
    headers: { authorization: `Bearer ${tokenSalvo()}`, ...(init?.body ? { 'content-type': 'application/json' } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new ErroAtendimento(j.erro ?? `HTTP ${r.status}`, r.status);
  return j;
}

export const useConversas = (ativo: boolean) =>
  useQuery({
    queryKey: ['wa', 'conversas'],
    queryFn: () => chamar<{ conversas: ConversaResumo[]; modo_ia: string; meta: string }>('/atendimento/conversas?dias=7'),
    enabled: ativo,
    refetchInterval: 5000,
    retry: (n, e) => !(e instanceof ErroAtendimento && [401, 503].includes(e.status)) && n < 2,
  });

export const useConversa = (tel: string | null) =>
  useQuery({
    queryKey: ['wa', 'conversa', tel],
    queryFn: () => chamar<ConversaDetalhe>(`/atendimento/conversas/${tel}`),
    enabled: !!tel,
    refetchInterval: 3000,
  });

type Acao = 'reiniciar' | 'assumir' | 'devolver' | 'mensagens';
export function useAcao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tel, acao, corpo }: { tel: string; acao: Acao; corpo: Record<string, unknown> }) =>
      chamar<{ ok: true }>(`/atendimento/conversas/${tel}/${acao}`, { method: 'POST', body: corpo }),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ['wa', 'conversas'] });
      void qc.invalidateQueries({ queryKey: ['wa', 'conversa', v.tel] });
    },
  });
}
