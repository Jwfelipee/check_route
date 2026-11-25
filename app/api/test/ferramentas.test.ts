import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sql } from '../src/db.js';
import { sugerirAcaoFake } from '../src/ia/fake.js';
import { conferirProposta, ocorrenciasDaRota } from '../src/ia/ferramentas.js';
import { store } from '../src/store.js';

const bancoNoAr = await sql('SELECT 1').then(() => true, () => false);
after(() => pool.end());

test('ação sugerida percorre as ferramentas na ordem e termina em propor_acao', { skip: !bancoNoAr && 'Postgres fora do ar' }, async () => {
  const rota = (await store.rotas()).find((r) => r.rota_id === 'T02')!;
  const r = await sugerirAcaoFake({ rota, numeros: { score: 58 }, foco: 'ocorr_100' });
  assert.deepEqual(
    r.ferramentas_chamadas.map((c) => c.nome),
    ['consultar_rota', 'ocorrencias_da_rota', 'listar_praticas', 'propor_acao'],
  );
  assert.equal(await conferirProposta({ rota, numeros: {} }, r), null, 'prática dentro do guia');
});

test('propor_acao recusa prática fora do guia', { skip: !bancoNoAr && 'Postgres fora do ar' }, async () => {
  const rota = (await store.rotas()).find((r) => r.rota_id === 'T02')!;
  const erro = await conferirProposta({ rota, numeros: {} }, { pratica_id: 'INVENTADA-99', acao: 'x', justificativa: 'x', numeros_usados: [] });
  assert.match(erro ?? '', /não existe no guia/);
});

test('ocorrencias_da_rota calcula a taxa por mil viagens em código', { skip: !bancoNoAr && 'Postgres fora do ar' }, async () => {
  const o = await ocorrenciasDaRota('T02');
  if (o.operacoes_no_mes > 0) {
    assert.equal(o.ocorrencias_por_mil, Math.round((o.ocorrencias / o.operacoes_no_mes) * 10000) / 10);
  }
  assert.ok(o.por_tipo.every((t, i, xs) => i === 0 || xs[i - 1].custo >= t.custo), 'ordenado por custo');
});
