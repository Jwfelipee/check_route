import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calcKpis, calcKpisTotal, calcPadroes, calcRedeMes, calcRotaMes, calcSaudeRotas, nota, situacaoDe } from './score';
import type { Filtros, Fontes } from './types';

const ler = (n: string) => JSON.parse(readFileSync(new URL(`../../public/data/${n}.json`, import.meta.url), 'utf8'));
const fontes: Fontes = {
  rotas: ler('rotas'), operacao_mes: ler('operacao_mes'), ocorrencias: ler('ocorrencias'),
  premissas: ler('premissas'), praticas: ler('praticas'), referencia: ler('referencia')[0],
};
const semFiltro: Filtros = { uf_coleta: 'SP', uf_entrega: 'SP', zona_coleta: '', zona_entrega: '', regiao: '' };

describe('régua das premissas', () => {
  it('nota linear limitada a 0..100, inclusive quando "menor é melhor"', () => {
    expect(nota(0.97, 0.8, 0.97)).toBe(100);
    expect(nota(0.7, 0.8, 0.97)).toBe(0);
    expect(nota(5, 8, 2)).toBeCloseTo(50); // ocorrências por 100: 8 → 0, 2 → 100
    expect(nota(null, 0, 1)).toBeNull();
  });
  it('faixas de situação', () => {
    const f = { ok: 85, atencao: 65 };
    expect(situacaoDe(90, f)).toBe('Saudável');
    expect(situacaoDe(70, f)).toBe('Atenção');
    expect(situacaoDe(10, f)).toBe('Crítica');
  });
});

describe('motor do score com os dados do protótipo', () => {
  const rotaMes = calcRotaMes(fontes);
  const saude = calcSaudeRotas(rotaMes, fontes.ocorrencias, fontes.referencia, fontes.premissas, fontes.praticas);

  it('72 rotas no mês da posição, todas com score entre 0 e 100', () => {
    expect(saude).toHaveLength(72);
    for (const r of saude) { expect(r.score).not.toBeNull(); expect(r.score!).toBeGreaterThanOrEqual(0); expect(r.score!).toBeLessThanOrEqual(100); }
  });

  it('rotas não saudáveis recebem ação do guia, sem {placeholder} sobrando', () => {
    for (const r of saude.filter((x) => x.situacao !== 'Saudável')) expect(r.acao).not.toMatch(/\{\w+\}/);
  });

  it('kpis_total: linha geral soma as pernas', () => {
    const t = calcKpisTotal(rotaMes, fontes.referencia);
    const geral = t.find((x) => x.perna === 'geral')!;
    expect(geral.n_rotas).toBe(72);
    expect(geral.prejuizo).toBeCloseTo(t.filter((x) => x.perna !== 'geral').reduce((s, x) => s + x.prejuizo, 0));
  });

  it('kpis e padrões seguem os filtros', () => {
    const rede = calcRedeMes(rotaMes, fontes.referencia, fontes.premissas, semFiltro);
    const k = calcKpis(rede, rotaMes, fontes.referencia, fontes.premissas, semFiltro);
    expect(k.map((x) => x.perna)).toEqual(['coleta', 'transferencia', 'entrega']);
    const p = calcPadroes(fontes.ocorrencias, fontes.rotas, fontes.referencia, semFiltro);
    const shareTipo = p.filter((x) => x.perna === 'coleta' && x.dim === 'tipo').reduce((s, x) => s + x.share_custo, 0);
    expect(shareTipo).toBeCloseTo(1);
  });
});
