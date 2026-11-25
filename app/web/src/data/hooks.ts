import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { carregaFontes, carregaMapa } from './api';
import { acoesRepo } from './acoes';
import { iaApi, temApi } from './ia';
import {
  calcKpis, calcKpisTotal, calcPadroes, calcRedeMes, calcRegioes, calcRotaMes, calcSaudeRotas, calcZonas,
} from '@/lib/score';
import { useFiltros } from '@/app/store';
import type { Acao, AcaoStatus } from '@/lib/types';
import type { SaudeRota } from '@/lib/score';

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

// ---------------------------------------------------------------- ações e ocorrências

export const useRecentes = () =>
  useQuery({ queryKey: ['recentes'], queryFn: iaApi.recentes, enabled: temApi, refetchInterval: 15_000 });

/** Ação ativa (em acompanhamento) de cada rota. */
export function useAcaoAtivaPorRota() {
  const { data } = useAcoes();
  return useMemo(() => new Map((data ?? []).filter((a) => a.status === 'Em acompanhamento').map((a) => [a.rota_id, a])), [data]);
}

export function useCriarAcao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Omit<Acao, 'id'>) => acoesRepo.criar(a),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acoes'] }),
  });
}

export function useMudarStatusAcao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Extract<AcaoStatus, 'Concluída' | 'Cancelada'> }) => acoesRepo.mudarStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acoes'] }),
  });
}

/** Grava a ocorrência confirmada e recarrega o painel (score, taxas e recentes). */
export function useRegistrarOcorrencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: iaApi.registrar,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['fontes'] }), qc.invalidateQueries({ queryKey: ['recentes'] })]),
  });
}

/**
 * Sugestão de ação da rota, sempre por IA. A API guarda a última versão e só gera outra quando os
 * dados da rota mudam, então abrir a rota de novo não custa uma chamada. `habilitado` segura a
 * geração até o bloco aparecer na tela.
 */
export function useSugestaoAcao(rota: SaudeRota, habilitado: boolean) {
  const numeros = numerosDaRota(rota);
  return useQuery({
    queryKey: ['sugestao', rota.rota_id, numeros],
    queryFn: () => iaApi.sugerir({ rota_id: rota.rota_id, numeros, foco: rota.foco_chave, tipo_mais_caro: rota.tipo_top }),
    enabled: habilitado && temApi,
    staleTime: Infinity,
    retry: false,
  });
}

/** "Dar detalhes": a pessoa conta o que a IA não vê nos dados e ela sugere de novo. */
export function useDarDetalhes(rota: SaudeRota) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contexto: string) =>
      iaApi.sugerir({ rota_id: rota.rota_id, numeros: numerosDaRota(rota), foco: rota.foco_chave, tipo_mais_caro: rota.tipo_top, contexto }),
    onSuccess: (s) => qc.setQueryData(['sugestao', rota.rota_id, numerosDaRota(rota)], s),
  });
}

/** Números da rota já calculados no front, enviados à IA (ela não recalcula nada). */
export function numerosDaRota(r: SaudeRota): Record<string, number | string | null> {
  const arred = (v: number | null, casas = 1) => (v == null ? null : Math.round(v * 10 ** casas) / 10 ** casas);
  return {
    score: arred(r.score, 0),
    score_mes_anterior: arred(r.score_ant, 0),
    situacao: r.situacao,
    unidades_no_mes: r.unidades,
    ocorrencias: r.ocorrencias,
    ocorrencias_por_100: arred(r.ocorr_100),
    acidentes: r.acidentes,
    acidentes_por_mil: arred(r.acidentes_mil),
    pct_prazo: r.pct_prazo == null ? null : `${Math.round(r.pct_prazo * 100)}%`,
    prejuizo_mes: Math.round(r.prejuizo),
    economia_estimada: Math.round(r.economia),
    tipo_mais_caro: r.tipo_top,
    produto_mais_afetado: r.produto_top,
  };
}

// ---------- contatos (quem pode registrar pelo WhatsApp) ----------

export const useContatos = () => useQuery({ queryKey: ['contatos'], queryFn: iaApi.contatos, enabled: temApi });

export function useCriarContato() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: iaApi.criarContato, onSuccess: () => qc.invalidateQueries({ queryKey: ['contatos'] }) });
}

export function useEditarContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dados }: { id: string } & Parameters<typeof iaApi.editarContato>[1]) => iaApi.editarContato(id, dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contatos'] }),
  });
}

/** Quem responde pela rota (para sugerir o responsável ao validar a ação). */
export const useResponsaveis = (rotaId: string, ativo: boolean) =>
  useQuery({ queryKey: ['responsaveis', rotaId], queryFn: () => iaApi.responsaveis(rotaId), enabled: ativo && temApi, staleTime: 60_000 });
