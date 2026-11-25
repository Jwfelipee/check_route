/**
 * Ações validadas ("de sugestão para acompanhamento") e descartadas.
 * Duas implementações: HTTP (API, compartilhado entre todos) e localStorage
 * (sem API, um navegador só). Trocar é mudar uma linha em `acoesRepo`.
 */
import type { Acao, AcaoStatus } from '@/lib/types';

export interface AcoesRepo {
  listar(): Promise<Acao[]>;
  criar(a: Omit<Acao, 'id'>): Promise<Acao>;
  mudarStatus(id: string, status: Extract<AcaoStatus, 'Concluída' | 'Cancelada'>): Promise<void>;
}

const hoje = () => new Date().toISOString().slice(0, 10);
const CHAVE = 'saude-rotas:acoes';

export const localRepo: AcoesRepo = {
  async listar() {
    try { return JSON.parse(localStorage.getItem(CHAVE) || '[]'); } catch { return []; }
  },
  async criar(a) {
    const nova: Acao = { ...a, id: `${a.rota_id}-${Date.now()}` };
    const todas = await this.listar();
    localStorage.setItem(CHAVE, JSON.stringify([...todas, nova]));
    return nova;
  },
  async mudarStatus(id, status) {
    const todas = await this.listar();
    const data = status === 'Concluída' ? { concluida_em: hoje() } : { cancelada_em: hoje() };
    localStorage.setItem(CHAVE, JSON.stringify(todas.map((x) => (x.id === id ? { ...x, status, ...data } : x))));
  },
};

export function httpRepo(base: string): AcoesRepo {
  const j = (r: Response) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  return {
    listar: () => fetch(`${base}/acoes`).then(j),
    criar: (a) => fetch(`${base}/acoes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(a) }).then(j),
    mudarStatus: (id, status) => fetch(`${base}/acoes/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) }).then(() => undefined),
  };
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
export const acoesRepo: AcoesRepo = BASE ? httpRepo(BASE) : localRepo;
