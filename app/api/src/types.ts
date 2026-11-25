/**
 * Formatos do contrato (espelham app/web/src/lib/types.ts, que é a fonte de verdade).
 * Qualquer fonte de dados nova precisa devolver exatamente estes campos.
 */
export type Perna = 'coleta' | 'transferencia' | 'entrega';

export interface Rota {
  rota_id: string;
  perna: Perna;
  rota: string;
  cidade: string | null;
  uf: string | null;
  zona: string | null;
  regiao: 'N' | 'NE' | 'CO' | 'SE' | 'S';
  origem: string;
  destino: string;
  transportadora: string;
  km: number | null;
  frete_orcado: number;
}

export interface OperacaoMes {
  mes: string;
  rota_id: string;
  perna: Perna;
  unidades: number;
  no_prazo: number;
  primeira_tentativa: number | null;
  frete_total: number;
  horas_ate_cd: number | null;
  ocupacao: number | null;
  horas_crossdock: number | null;
}

export interface Ocorrencia {
  id: string;
  data: string;
  mes: string;
  perna: Perna;
  rota_id: string;
  transportadora: string;
  tipo: string;
  produto: string;
  custo: number;
  acao: string;
  status: string;
  dias_resolucao: number | null;
  dias_em_aberto: number | null;
  /** Por onde chegou (ocorrências do relato: whatsapp | formulario; da bronze: canal do SAC). */
  canal?: string;
  /** Campos extras da ficha do acidente (só nas ocorrências criadas pela IA). */
  detalhes?: Record<string, unknown>;
}

export interface Premissa {
  perna: string;
  tipo: 'pilar' | 'parametro';
  chave: string;
  premissa: string;
  descricao?: string;
  peso?: number;
  nota_zero?: number;
  nota_cem?: number;
  formato?: string;
  valor?: number;
}

export interface Pratica {
  id: string;
  perna: Perna;
  gatilho: string;
  titulo: string;
  quando_usar: string;
  acao: string;
  como_fazer: string;
  melhora: string;
  esforco: string;
  prazo_dias: number;
  origem: string;
}

export interface Referencia {
  data: string;
  mes: string;
  mes_anterior: string;
}

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
  prazo: string;
  status: AcaoStatus;
  score_inicial: number | null;
  validada_em: string;
  validada_por: string | null;
  pratica_id: string | null;
  concluida_em?: string;
  cancelada_em?: string;
  descartada_em?: string;
  /** De onde veio o texto da ação: regra do guia ou IA (com as ferramentas que ela consultou). */
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
