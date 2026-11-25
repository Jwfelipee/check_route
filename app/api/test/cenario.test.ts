import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, sql, tabelaExiste } from '../src/db.js';
import { plantarCenarioAcidentes, PREFIXO, ROTA_CENARIO } from '../src/etl/cenario-acidentes.js';

const temBronze = await tabelaExiste('bronze_tms_viagens').catch(() => false);
after(() => pool.end());

test('cenário de acidentes é determinístico e idempotente', { skip: !temBronze && 'rode o ETL antes' }, async () => {
  const contar = async () =>
    (await sql<{ protocolo: string; relato: string }>(
      `SELECT protocolo, relato FROM bronze_sac_ocorrencias WHERE protocolo LIKE '${PREFIXO}%' ORDER BY protocolo`,
    ));
  const a = await plantarCenarioAcidentes();
  const primeira = await contar();
  const b = await plantarCenarioAcidentes();
  const segunda = await contar();
  assert.equal(a.acidentes, b.acidentes);
  assert.deepEqual(primeira, segunda, 'mesmos protocolos e relatos nas duas rodadas');
  assert.equal(primeira.length, a.acidentes, 'rodar de novo não duplica');
});

test('acidentes plantados ficam na rota do cenário, ligados a viagens reais', { skip: !temBronze && 'rode o ETL antes' }, async () => {
  const fora = await sql<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM bronze_sac_ocorrencias s
     LEFT JOIN bronze_tms_viagens v ON v.viagem_id = s.ref_id
     WHERE s.protocolo LIKE '${PREFIXO}%' AND (v.rota_id IS DISTINCT FROM $1)`,
    [ROTA_CENARIO],
  );
  assert.equal(fora[0].n, 0);
});
