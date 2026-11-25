import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assinaturaValida, lerMensagens } from '../src/meta/webhook.js';
import { faltandoNaFicha, resumoParaConfirmar } from '../src/agente/ficha.js';

const payload = (mensagem: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    contacts: [{ wa_id: '5511999990000', profile: { name: 'João' } }],
    messages: [{ id: 'wamid.1', from: '5511999990000', timestamp: '1', ...mensagem }],
  } }] }],
});

describe('assinatura do webhook', () => {
  const corpo = Buffer.from(JSON.stringify(payload({ type: 'text', text: { body: 'oi' } })));
  const assinatura = 'sha256=' + createHmac('sha256', 'segredo').update(corpo).digest('hex');
  it('aceita a assinatura certa', () => expect(assinaturaValida(corpo, assinatura, 'segredo')).toBe(true));
  it('recusa segredo errado, corpo alterado ou cabeçalho ausente', () => {
    expect(assinaturaValida(corpo, assinatura, 'outro')).toBe(false);
    expect(assinaturaValida(Buffer.from(corpo.toString() + ' '), assinatura, 'segredo')).toBe(false);
    expect(assinaturaValida(corpo, undefined, 'segredo')).toBe(false);
  });
});

describe('leitura do payload da Meta', () => {
  it('texto, com o nome do contato', () => {
    expect(lerMensagens(payload({ type: 'text', text: { body: 'Tombou o caminhão' } }))).toEqual([
      { tipo: 'texto', id: 'wamid.1', de: '5511999990000', nome: 'João', texto: 'Tombou o caminhão' },
    ]);
  });
  it('foto com legenda, botão e áudio', () => {
    expect(lerMensagens(payload({ type: 'image', image: { id: 'm1', mime_type: 'image/jpeg', caption: 'carga' } }))[0]).toMatchObject({ tipo: 'imagem', mediaId: 'm1', legenda: 'carga' });
    expect(lerMensagens(payload({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'confirmar_ocorrencia', title: 'Confirmar' } } }))[0]).toMatchObject({ tipo: 'botao', botaoId: 'confirmar_ocorrencia' });
    expect(lerMensagens(payload({ type: 'audio', audio: { id: 'a1' } }))[0]).toMatchObject({ tipo: 'audio' });
  });
  it('ignora status de entrega e outros objetos', () => {
    expect(lerMensagens({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'x' }] } }] }] })).toEqual([]);
    expect(lerMensagens({ object: 'page' })).toEqual([]);
  });
});

describe('regras da ficha', () => {
  it('produto e custo também são obrigatórios (POST /ocorrencias exige)', () => {
    expect(faltandoNaFicha({ tipo: 'Tombamento', rota_id: 'T02', data_hora: '2026-11-25T03:40', trecho: 'BR-381 km 512', produto: null, custo_estimado: null }))
      .toEqual(['produto', 'custo_estimado']);
  });
  it('resumo legível para o motorista conferir', () => {
    const t = resumoParaConfirmar({ tipo: 'Tombamento', rota_id: 'T02', data_hora: '2026-11-25T03:40', trecho: 'BR-381 km 512', produto: 'Eletrodomésticos', custo_estimado: 38000 }, 'CD Cajamar → Hub Belo Horizonte');
    expect(t).toContain('Hub Belo Horizonte');
    expect(t).toContain('25/11 às 03:40');
    expect(t).toMatch(/R\$\s?38\.000/);
  });
});
