import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sql } from '../src/db.js';
import { sugerirAcaoFake } from '../src/ia/fake.js';
import { assinaturaDaRota, conferirProposta } from '../src/ia/ferramentas.js';
import type { SugestaoIa } from '../src/ia/schemas.js';
import { store } from '../src/store.js';

const bancoNoAr = await sql('SELECT 1').then(() => true, () => false);
const skip = !bancoNoAr && 'Postgres fora do ar';
after(() => pool.end());

/** MCP em processo: as mesmas ferramentas do app/mcp, com o escopo do painel. */
const poolMcp = bancoNoAr ? (await import('../../mcp/src/db.js')).pool : null;
after(() => poolMcp?.end());
async function mcpEmProcesso() {
  const { FERRAMENTAS } = await import('../../mcp/src/tools.js');
  return {
    tools: Object.keys(FERRAMENTAS).map((name) => ({ name, inputSchema: { type: 'object' as const } })),
    client: {
      async callTool(p: { name: string; arguments?: Record<string, unknown> }) {
        const r = await FERRAMENTAS[p.name].run({ sub: 'painel', papel: 'painel', rotas: '*', exp: 9e9 }, String(p.arguments?.rota_id));
        return { content: [{ type: 'text' as const, text: JSON.stringify(r) }] };
      },
    },
  };
}

const proposta = (o: Partial<SugestaoIa> = {}): SugestaoIa => ({
  acao: 'Rever o trecho e o horário (TRF-08).',
  praticas: [{ id: 'TRF-08', papel: 'principal', como_usou: 'modelo' }],
  justificativa: 'x', numeros_usados: [], considerou_contexto: null, ...o,
});

test('ação simulada consulta o MCP, cita as práticas e passa na conferência', { skip }, async () => {
  const rota = (await store.rotas()).find((r) => r.rota_id === 'T02')!;
  const ctx = { rota, numeros: { score: 58 }, foco: 'ocorr_100' };
  const r = await sugerirAcaoFake(ctx, {}, await mcpEmProcesso());
  const nomes = r.ferramentas_chamadas.map((c) => c.nome);
  assert.equal(nomes[0], 'listar_praticas');
  assert.ok(nomes.includes('resumo_rota') && nomes.includes('ocorrencias_por_tipo') && nomes.includes('padrao_horario'));
  assert.equal(nomes.at(-1), 'propor_acao');
  assert.equal(r.praticas.filter((p) => p.papel === 'principal').length, 1);
  for (const p of r.praticas) assert.ok(r.acao.includes(p.id), `texto cita ${p.id}`);
  assert.equal(await conferirProposta(ctx, r), null);
  assert.equal(r.considerou_contexto, null);
  const com = await sugerirAcaoFake(ctx, { contexto: 'trocaram o motorista em outubro' }, await mcpEmProcesso());
  assert.match(com.considerou_contexto ?? '', /trocaram o motorista/);
});

test('conferirProposta recusa prática fora do guia, sem principal, repetida e não citada', { skip }, async () => {
  const rota = (await store.rotas()).find((r) => r.rota_id === 'T02')!;
  const ctx = { rota, numeros: {} };
  assert.equal(await conferirProposta(ctx, proposta()), null);
  assert.match((await conferirProposta(ctx, proposta({ praticas: [{ id: 'INVENTADA-99', papel: 'principal', como_usou: 'x' }] }))) ?? '', /não existe no guia/);
  assert.match((await conferirProposta(ctx, proposta({ praticas: [{ id: 'TRF-08', papel: 'apoio', como_usou: 'x' }] }))) ?? '', /exatamente uma/);
  assert.match((await conferirProposta(ctx, proposta({ praticas: [
    { id: 'TRF-08', papel: 'principal', como_usou: 'x' }, { id: 'TRF-05', papel: 'apoio', como_usou: 'x' }] }))) ?? '', /Faltou: TRF-05/);
  assert.match((await conferirProposta(ctx, proposta({ praticas: [
    { id: 'TRF-08', papel: 'principal', como_usou: 'x' }, { id: 'TRF-08', papel: 'apoio', como_usou: 'x' }] }))) ?? '', /repetida/);
});

test('a assinatura da rota muda quando chega ocorrência nova ou o número muda', { skip }, async () => {
  const antes = await assinaturaDaRota('T02', { score: 58 });
  assert.equal(await assinaturaDaRota('T02', { score: 58 }), antes, 'estável');
  assert.notEqual(await assinaturaDaRota('T02', { score: 57 }), antes);
  const id = `OC-TESTE-${Date.now()}`;
  await sql(`INSERT INTO ocorrencias_novas (id, dados) VALUES ($1, $2)`, [id, { id, rota_id: 'T02', mes: '2026-11' }]);
  try {
    assert.notEqual(await assinaturaDaRota('T02', { score: 58 }), antes);
  } finally {
    await sql('DELETE FROM ocorrencias_novas WHERE id = $1', [id]);
  }
});
