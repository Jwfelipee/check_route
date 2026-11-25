import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { carregaFontes, carregaMapa } from './api';
import { acoesRepo } from './acoes';
import {
  calcKpis, calcKpisTotal, calcPadroes, calcRedeMes, calcRegioes, calcRotaMes, calcSaudeRotas, calcZonas,
} from '@/lib/score';
import { useFiltros } from '@/app/store';

export const useFontes = () => useQuery({ queryKey: ['fontes'], queryFn: carregaFontes, staleTime: Infinity });
export const useMapa = () => useQuery({ queryKey: ['mapa'], queryFn: carregaMapa, staleTime: Infinity });
export const useAcoes = () => useQuery({ queryKey: ['acoes'], queryFn: () => acoesRepo.listar() });

/** Tudo o que a tela mostra, derivado das fontes e dos filtros (equivale aos dash.calc do artifact). */
export function usePainel() {
  const { data: fontes, ...q } = useFontes();
  const filtros = useFiltros((s) => s.filtros);

  // Independe dos filtros: calcula uma vez.
  const base = useMemo(() => {
    if (!fontes) return null;
    const rotaMes = calcRotaMes(fontes);
    return {
      fontes,
      rotaMes,
      saudeRotas: calcSaudeRotas(rotaMes, fontes.ocorrencias, fontes.referencia, fontes.premissas, fontes.praticas),
      kpisTotal: calcKpisTotal(rotaMes, fontes.referencia),
      regioes: calcRegioes(rotaMes, fontes.referencia, fontes.premissas),
      zonas: calcZonas(rotaMes, fontes.referencia),
    };
  }, [fontes]);

  // Depende dos filtros.
  const filtrado = useMemo(() => {
    if (!base) return null;
    const { fontes: f, rotaMes } = base;
    const redeMes = calcRedeMes(rotaMes, f.referencia, f.premissas, filtros);
    return {
      redeMes,
      kpis: calcKpis(redeMes, rotaMes, f.referencia, f.premissas, filtros),
      padroes: calcPadroes(f.ocorrencias, f.rotas, f.referencia, filtros),
    };
  }, [base, filtros]);

  return { ...q, data: base && filtrado ? { ...base, ...filtrado } : null };
}
