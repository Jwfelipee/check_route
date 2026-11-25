/** Estado de tela: perna aberta, aba, filtros e filtro de situação por perna. */
import { create } from 'zustand';
import type { Filtros, Perna, Situacao } from '@/lib/types';

interface Estado {
  aba: 'painel' | 'guia';
  perna: Perna;
  filtros: Filtros;
  situacao: Partial<Record<Perna, Situacao | ''>>;
  setAba: (a: Estado['aba']) => void;
  setPerna: (p: Perna) => void;
  setFiltro: (k: keyof Filtros, v: string) => void;
  setSituacao: (p: Perna, s: Situacao | '') => void;
}

const pernaDoHash = (): Perna => {
  const h = location.hash.replace('#perna-', '');
  return h === 'transferencia' || h === 'entrega' ? h : 'coleta';
};

export const useFiltros = create<Estado>((set) => ({
  aba: 'painel',
  perna: pernaDoHash(),
  filtros: { uf_coleta: 'SP', uf_entrega: 'SP', zona_coleta: '', zona_entrega: '', regiao: '' },
  situacao: {},
  setAba: (aba) => set({ aba }),
  setPerna: (perna) => { history.replaceState(null, '', '#perna-' + perna); set({ perna }); },
  setFiltro: (k, v) => set((s) => ({ filtros: { ...s.filtros, [k]: v } })),
  setSituacao: (p, v) => set((s) => ({ situacao: { ...s.situacao, [p]: v } })),
}));
