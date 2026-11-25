import { z } from 'zod';

/** As três pernas da operação. */
export const PERNAS = ['coleta', 'transferencia', 'entrega'] as const;
export type Perna = (typeof PERNAS)[number];

export const REGIOES = ['N', 'NE', 'CO', 'SE', 'S'] as const;
export type Regiao = (typeof REGIOES)[number];

export type Situacao = 'Saudável' | 'Atenção' | 'Crítica';

// ---------- Fontes de dados (public/data/*.json ou API) ----------

export const RotaSchema = z.object({
  rota_id: z.string(),
  perna: z.enum(PERNAS),
  rota: z.string(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  zona: z.string().nullable(),
  regiao: z.enum(REGIOES),
  origem: z.string(),
  destino: z.string(),
  transportadora: z.string(),
  km: z.number().nullable(),
  frete_orcado: z.number(),
});
export type Rota = z.infer<typeof RotaSchema>;

export const OperacaoMesSchema = z.object({
  mes: z.string(), // AAAA-MM
  rota_id: z.string(),
  perna: z.enum(PERNAS),
  unidades: z.number(),
  no_prazo: z.number(),
  primeira_tentativa: z.number().nullable(),
  frete_total: z.number(),
  horas_ate_cd: z.number().nullable(),
  ocupacao: z.number().nullable(),
  horas_crossdock: z.number().nullable(),
});
export type OperacaoMes = z.infer<typeof OperacaoMesSchema>;

export const OcorrenciaSchema = z.object({
  id: z.string(),
  data: z.string(),
  mes: z.string(),
  perna: z.enum(PERNAS),
  rota_id: z.string(),
  transportadora: z.string(),
  tipo: z.string(),
  produto: z.string(),
  custo: z.number(),
  acao: z.string(),
  status: z.string(), // 'Aberta' | 'Resolvida'
  dias_resolucao: z.number().nullable(),
  dias_em_aberto: z.number().nullable(),
  // Rastreabilidade (opcionais): protocolo do SAC, canal e a ficha das ocorrências registradas pelo relato.
  protocolo: z.string().optional(),
  canal: z.string().optional(),
  detalhes: z.record(z.string(), z.unknown()).optional(),
});
export type Ocorrencia = z.infer<typeof OcorrenciaSchema>;

export const PremissaSchema = z.object({
  perna: z.string(), // perna ou 'todas'
  tipo: z.enum(['pilar', 'parametro']),
  chave: z.string(),
  premissa: z.string(),
  descricao: z.string().optional(),
  peso: z.number().optional(),
  nota_zero: z.number().optional(),
  nota_cem: z.number().optional(),
  formato: z.string().optional(),
  valor: z.number().optional(),
});
export type Premissa = z.infer<typeof PremissaSchema>;

export const PraticaSchema = z.object({
  id: z.string(),
  perna: z.enum(PERNAS),
  gatilho: z.string(), // chaves de premissa e/ou tipos de ocorrência separados por "|"
  titulo: z.string(),
  quando_usar: z.string(),
  acao: z.string(), // modelo com {placeholders}
  como_fazer: z.string(),
  melhora: z.string(),
  esforco: z.string(),
  prazo_dias: z.number(),
  origem: z.string(),
});
export type Pratica = z.infer<typeof PraticaSchema>;

export const ReferenciaSchema = z.object({ data: z.string(), mes: z.string(), mes_anterior: z.string() });
export type Referencia = z.infer<typeof ReferenciaSchema>;

export type AcaoStatus = 'Em acompanhamento' | 'Concluída' | 'Cancelada' | 'Descartada';
export interface Acao {
  id: string;
  rota_id: string;
  perna: Perna;
  rota: string;
  acao: string;
  acao_sugerida: string;
  foco: string | null;
  responsavel: string;
  prazo: string; // AAAA-MM-DD
  status: AcaoStatus;
  score_inicial: number | null;
  validada_em: string;
  validada_por: string | null;
  pratica_id: string | null;
  concluida_em?: string;
  cancelada_em?: string;
  descartada_em?: string;
  /** De onde veio o texto da ação: regra do guia ou IA. */
  origem_sugestao?: 'regra' | 'ia';
}

export interface Fontes {
  rotas: Rota[];
  operacao_mes: OperacaoMes[];
  ocorrencias: Ocorrencia[];
  premissas: Premissa[];
  praticas: Pratica[];
  referencia: Referencia;
}

/** Filtros da tela (equivalem aos dash/params do artifact). */
export interface Filtros {
  uf_coleta: string;
  uf_entrega: string;
  zona_coleta: string;
  zona_entrega: string;
  regiao: string; // transferência
}
