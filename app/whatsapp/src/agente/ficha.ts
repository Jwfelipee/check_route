/**
 * Regras da ficha que ficam no código (não no modelo): o que falta para a API aceitar
 * (POST /ocorrencias exige também produto e custo) e o texto do resumo que o motorista confirma.
 */
export const OBRIGATORIOS = ['tipo', 'rota_id', 'data_hora', 'trecho', 'produto', 'custo_estimado'] as const;

export const PERGUNTA_CAMPO: Record<string, string> = {
  tipo: 'o que aconteceu (colisão, tombamento, saída de pista, avaria, roubo…)',
  rota_id: 'para qual hub a carga ia',
  data_hora: 'o dia e o horário',
  trecho: 'a rodovia e o km (ou um ponto de referência)',
  produto: 'qual carga foi afetada (eletrônicos, eletrodomésticos, moda, saúde e beleza ou casa)',
  custo_estimado: 'o valor estimado do prejuízo em reais (pode ser aproximado)',
};

export function faltandoNaFicha(ficha: Record<string, unknown> | null): string[] {
  if (!ficha) return [...OBRIGATORIOS];
  return OBRIGATORIOS.filter((c) => ficha[c] === null || ficha[c] === undefined || ficha[c] === '');
}

export function perguntaPadrao(faltando: string[]): string {
  return `Para registrar, preciso saber: ${faltando.map((c) => PERGUNTA_CAMPO[c] ?? c).join('; ')}.`;
}

const brl = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—');
const dataHora = (v: unknown) => {
  const s = String(v ?? '');
  return s.length >= 16 ? `${s.slice(8, 10)}/${s.slice(5, 7)} às ${s.slice(11, 16)}` : s || '—';
};

/** Resumo montado pelo código a partir da ficha da API: é isto que o motorista confirma. */
export function resumoParaConfirmar(f: Record<string, unknown>, nomeHub?: string): string {
  const linhas = [
    '*Confere a ocorrência?*',
    `• O que houve: ${f.tipo ?? '—'}`,
    `• Rota: ${nomeHub ?? f.rota_id ?? '—'}`,
    `• Quando: ${dataHora(f.data_hora)}`,
    `• Onde: ${f.trecho ?? '—'}`,
    `• Carga: ${f.produto ?? '—'}${f.volumes_afetados ? ` (${f.volumes_afetados} volumes)` : ''}`,
    `• Prejuízo estimado: ${brl(f.custo_estimado)}`,
  ];
  if (f.placa) linhas.push(`• Placa: ${f.placa}`);
  if (f.houve_vitima === true) linhas.push('• Houve vítima: sim');
  if (f.resumo) linhas.push('', String(f.resumo));
  return linhas.join('\n');
}
