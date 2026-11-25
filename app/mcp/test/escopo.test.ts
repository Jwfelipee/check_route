/** Escopo por remetente: token assinado e matriz ferramenta × papel × rota de fora. Precisa do Postgres do docker compose. */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emitirToken, lerToken, type Escopo } from '../src/escopo.js';
import { FERRAMENTAS, POR_PAPEL } from '../src/tools.js';
import { pool } from '../src/db.js';

const SEG = 'segredo-de-teste';
const base = { sub: 'CT-1', papel: 'motorista' as const, rotas: ['T02'] };

describe('token de escopo', () => {
  it('aceita o token válido', () => assert.deepEqual(lerToken(emitirToken(base, SEG), SEG)?.rotas, ['T02']));
  it('recusa adulterado, outro segredo, expirado e vazio', () => {
    const t = emitirToken(base, SEG);
    const [corpo, sig] = t.split('.');
    const falso = Buffer.from(JSON.stringify({ ...base, rotas: '*', exp: 9e9 })).toString('base64url');
    assert.equal(lerToken(`${falso}.${sig}`, SEG), null);
    assert.equal(lerToken(t, 'outro'), null);
    assert.equal(lerToken(emitirToken(base, SEG, 900, Date.now() - 3_600_000), SEG), null);
    assert.equal(lerToken(undefined, SEG), null);
    assert.equal(lerToken(corpo, SEG), null);
  });
});

const rotas = ['T02', 'T05'];
const papeis: Escopo['papel'][] = ['motorista', 'transportadora', 'gestor', 'painel'];

describe('ferramentas respeitam o escopo', () => {
  after(() => pool.end());

  for (const papel of papeis.filter((p) => p === 'motorista' || p === 'transportadora')) {
    for (const nome of POR_PAPEL[papel]) {
      it(`${papel} · ${nome}: rota de fora devolve o erro neutro`, async () => {
        const esc: Escopo = { sub: 'CT-1', papel, rotas: ['T02'], exp: 9e9 };
        const fora = await FERRAMENTAS[nome].run(esc, 'T05');
        const inexistente = await FERRAMENTAS[nome].run(esc, 'T99');
        assert.deepEqual(fora, inexistente, 'rota de fora não pode ser distinguível de rota inexistente');
        assert.ok(fora.erro);
        assert.doesNotMatch(JSON.stringify(fora), /T05|Hub/);
      });

      it(`${papel} · ${nome}: a saída da própria rota não traz outra rota, telefone nem contato`, async () => {
        const esc: Escopo = { sub: 'CT-1', papel, rotas: ['T02'], exp: 9e9 };
        const r = JSON.stringify(await FERRAMENTAS[nome].run(esc, 'T02'));
        assert.doesNotMatch(r, /"erro"/);
        for (const outra of rotas.filter((x) => x !== 'T02')) assert.doesNotMatch(r, new RegExp(`\\b${outra}\\b`));
        assert.doesNotMatch(r, /\+?\d{2}\s?\(?\d{2}\)?\s?9\d{4}|telefone|responsavel|reportado_por|VEIC-|placa/i);
      });
    }
  }

  it('painel enxerga a comparação com nomes; escopo restrito não', async () => {
    const painel = await FERRAMENTAS.comparar_rotas.run({ sub: 'painel', papel: 'painel', rotas: '*', exp: 9e9 }, 'T02');
    assert.ok(Array.isArray(painel.piores_da_etapa));
    const mot = await FERRAMENTAS.comparar_rotas.run({ sub: 'CT-1', papel: 'motorista', rotas: ['T02'], exp: 9e9 }, 'T02');
    assert.equal(mot.piores_da_etapa, undefined);
    assert.equal(mot.posicao_na_etapa_por_taxa, undefined);
  });

  it('motorista não recebe atrasos nem histórico de ações', () => {
    assert.ok(!POR_PAPEL.motorista.includes('atrasos'));
    assert.ok(!POR_PAPEL.motorista.includes('historico_acoes'));
  });
});
