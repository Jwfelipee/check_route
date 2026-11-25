import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitos, mascararTelefone, podeNaRota, publico, variantesDoTelefone, type Contato } from '../src/contatos.js';

const base: Contato = { id: 'CT-0001', telefone: '5531999990000', nome: 'Rafael', papel: 'motorista', transportadora: 'Transp. Alfa', rotas: ['T02'], ativo: true, criado_em: new Date() };

test('telefone brasileiro vale com ou sem o 9 depois do DDD', () => {
  assert.deepEqual(variantesDoTelefone('+55 (31) 99999-0000').sort(), ['553199990000', '5531999990000']);
  assert.deepEqual(variantesDoTelefone('553199990000').sort(), ['553199990000', '5531999990000']);
  assert.equal(digitos('+55 (31) 99999-0000'), '5531999990000');
});

test('o telefone nunca sai inteiro na visão do painel', () => {
  assert.equal(mascararTelefone('5531999990000'), '+55 31 •••••0000');
  assert.ok(!JSON.stringify(publico(base)).includes('999990000'));
});

test('motorista só registra na própria rota; inativo não registra; gestor vale para todas', () => {
  assert.equal(podeNaRota(base, 'T02'), true);
  assert.equal(podeNaRota(base, 'T05'), false);
  assert.equal(podeNaRota({ ...base, ativo: false }, 'T02'), false);
  assert.equal(podeNaRota({ ...base, papel: 'gestor', rotas: [] }, 'T05'), true);
});
