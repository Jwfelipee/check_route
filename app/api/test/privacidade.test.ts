import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mascarar, mascararPlaca, pseudonimoPlaca } from '../src/privacidade.js';

test('mascara o cabeçalho que o WhatsApp anexa (telefone e nome do motorista)', () => {
  const r = mascarar('Tombou na BR-381 km 512.\n[via WhatsApp 5531999990000, João Silva]');
  assert.doesNotMatch(r.texto, /5531999990000|João|Silva/);
  assert.match(r.texto, /\[via WhatsApp · Motorista #[0-9a-f]{4}\]/);
  assert.ok(r.mascarados.includes('motorista'));
});

test('mascara telefone, CPF e e-mail no texto livre', () => {
  const r = mascarar('Me liga no (31) 99876-5432 ou 31987654321, CPF 123.456.789-09, joao@transp.com.br');
  assert.doesNotMatch(r.texto, /99876|987654321|123\.456|joao@/);
  assert.deepEqual(new Set(r.mascarados), new Set(['telefone', 'cpf', 'email']));
});

test('placa vira pseudônimo estável, que ainda permite cruzar o mesmo veículo', () => {
  const r = mascarar('Carreta ABC1D23 tombou; a ABC1D23 estava carregada.');
  assert.doesNotMatch(r.texto, /ABC1D23/);
  const pseudo = pseudonimoPlaca('ABC1D23');
  assert.equal(r.texto.split(pseudo).length - 1, 2);
  assert.equal(mascararPlaca('ABC-1D23'), pseudo, 'placa com hífen gera o mesmo pseudônimo');
  assert.equal(mascararPlaca(pseudo), pseudo, 'pseudônimo não é mascarado de novo');
});

test('nome depois de "motorista" é pseudonimizado', () => {
  const r = mascarar('O motorista Carlos Pereira disse que freou forte.');
  assert.doesNotMatch(r.texto, /Carlos|Pereira/);
  assert.match(r.texto, /motorista #[0-9a-f]{4}/);
});

test('não mexe em rodovia, km, valores e horários', () => {
  const texto = 'Saída de pista na BR-381 km 512 às 03:40, prejuízo de R$ 38.000, 40 volumes.';
  const r = mascarar(texto);
  assert.equal(r.texto, texto);
  assert.deepEqual(r.mascarados, []);
});
