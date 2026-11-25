import type { Perna } from '@/lib/types';

/** Textos e indicadores que mudam de uma perna para outra (do artifact original). */
export const PERNA_CFG: Record<Perna, {
  titulo: string; en: string; descricao: string; unidade: [string, string];
  kpiPrazo: string; kpiChave: { label: string; campo: 'pct_primeira' | 'ocupacao' };
  economiaNota: string;
  ranking: { campo: string; label: string; fmt: 'pct1' | 'n1' | 'pct' | 'horas' | 'dias' }[];
  temMapaCidade: boolean;
}> = {
  coleta: {
    titulo: 'Coleta', en: 'first mile', unidade: ['coleta', 'coletas'],
    descricao: 'Dentro da cidade, do fornecedor até o CD ou o hub. O que mais pesa nesta perna: coleta frustrada (fornecedor sem a carga ou a nota pronta), divergência de volumes e carga esperando doca para entrar no CD.',
    kpiPrazo: 'Coletas na janela agendada',
    kpiChave: { label: 'Coletas na 1ª tentativa', campo: 'pct_primeira' },
    economiaNota: 'se cada rota chegasse na meta de ocorrências e no frete orçado',
    ranking: [
      { campo: 'pct_prazo', label: 'Na janela', fmt: 'pct1' },
      { campo: 'pct_primeira', label: '1ª tentativa', fmt: 'pct1' },
      { campo: 'ocorr_100', label: 'Ocorr. /100', fmt: 'n1' },
      { campo: 'custo_vs_orcado', label: 'Frete / orçado', fmt: 'pct' },
      { campo: 'horas_ate_cd', label: 'Horas até o CD', fmt: 'horas' },
    ],
    temMapaCidade: true,
  },
  transferencia: {
    titulo: 'Transferência', en: 'middle mile', unidade: ['viagem', 'viagens'],
    descricao: 'Do CD Cajamar até os hubs regionais, passando pelo cross-docking. O que mais pesa nesta perna: caminhão saindo com espaço vazio, carga parada no cross-docking, erro de triagem, avaria no manuseio e roubo de carga.',
    kpiPrazo: 'Chegadas no hub no prazo',
    kpiChave: { label: 'Ocupação média do caminhão', campo: 'ocupacao' },
    economiaNota: 'com a meta de ocorrências, o frete orçado e o caminhão na ocupação meta',
    ranking: [
      { campo: 'pct_prazo', label: 'Chegada no prazo', fmt: 'pct1' },
      { campo: 'ocupacao', label: 'Ocupação', fmt: 'pct1' },
      { campo: 'ocorr_100', label: 'Ocorr. /100 viagens', fmt: 'n1' },
      { campo: 'custo_vs_orcado', label: 'Frete / orçado', fmt: 'pct' },
      { campo: 'horas_crossdock', label: 'Horas no cross-docking', fmt: 'horas' },
    ],
    temMapaCidade: false,
  },
  entrega: {
    titulo: 'Entrega', en: 'last mile', unidade: ['entrega', 'entregas'],
    descricao: 'Dentro da cidade, do CD ou do hub até a casa do cliente. O que mais pesa nesta perna: destinatário ausente, recusa, compra cancelada com o veículo a caminho, avaria e roubo.',
    kpiPrazo: 'Entregas no prazo',
    kpiChave: { label: 'Entregas na 1ª tentativa', campo: 'pct_primeira' },
    economiaNota: 'se cada rota chegasse na meta de ocorrências e no frete orçado',
    ranking: [
      { campo: 'pct_prazo', label: 'No prazo', fmt: 'pct1' },
      { campo: 'pct_primeira', label: '1ª tentativa', fmt: 'pct1' },
      { campo: 'ocorr_100', label: 'Ocorr. /100', fmt: 'n1' },
      { campo: 'custo_vs_orcado', label: 'Frete / orçado', fmt: 'pct' },
      { campo: 'resolucao_dias', label: 'Dias p/ resolver', fmt: 'dias' },
    ],
    temMapaCidade: true,
  },
};
