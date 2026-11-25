/** Estado de tela: página aberta no menu, perna, filtros e filtro de situação por perna. */
import { create } from 'zustand';
import type { Filtros, Perna, Situacao } from '@/lib/types';

export type Pagina = 'visao' | 'rotas' | 'guia';

interface Estado {
  pagina: Pagina;
  perna: Perna;
  filtros: Filtros;
  situacao: Partial<Record<Perna, Situacao | ''>>;
  menuAberto: boolean;
  setPagina: (p: Pagina) => void;
  setPerna: (p: Perna) => void;
  abrirRota: (p: Perna) => void;
  setFiltro: (k: keyof Filtros, v: string) => void;
  setSituacao: (p: Perna, s: Situacao | '') => void;
  setMenuAberto: (v: boolean) => void;
}

// Links diretos: #visao, #guia, #perna-coleta|transferencia|entrega.
const hash = () => location.hash.replace('#', '');
const pernaDoHash = (): Perna => {
  const h = hash().replace('perna-', '');
  return h === 'transferencia' || h === 'entrega' ? h : 'coleta';
};
const paginaDoHash = (): Pagina => (hash().startsWith('perna-') ? 'rotas' : hash() === 'guia' ? 'guia' : 'visao');
const gravaHash = (h: string) => history.replaceState(null, '', '#' + h);

export const useFiltros = create<Estado>((set, get) => ({
  pagina: paginaDoHash(),
  perna: pernaDoHash(),
  filtros: { uf_coleta: 'SP', uf_entrega: 'SP', zona_coleta: '', zona_entrega: '', regiao: '' },
  situacao: {},
  menuAberto: false,
  setPagina: (pagina) => {
    gravaHash(pagina === 'rotas' ? 'perna-' + get().perna : pagina);
    set({ pagina, menuAberto: false });
    window.scrollTo({ top: 0 });
  },
  setPerna: (perna) => { gravaHash('perna-' + perna); set({ perna }); },
  abrirRota: (perna) => { gravaHash('perna-' + perna); set({ perna, pagina: 'rotas', menuAberto: false }); window.scrollTo({ top: 0 }); },
  setFiltro: (k, v) => set((s) => ({ filtros: { ...s.filtros, [k]: v } })),
  setSituacao: (p, v) => set((s) => ({ situacao: { ...s.situacao, [p]: v } })),
  setMenuAberto: (menuAberto) => set({ menuAberto }),
}));
