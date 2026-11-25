/**
 * Simula um motorista conversando, mandando webhooks falsos para o servidor local.
 * Rode o servidor em dry-run (META_DRY_RUN=1) e veja as respostas no log dele.
 *
 *   npm run simular -w app/whatsapp                       # roteiro padrão
 *   npm run simular -w app/whatsapp -- "texto livre"      # uma mensagem
 *   npm run simular -w app/whatsapp -- --confirmar        # aperta o botão Confirmar
 */
import { createHmac } from 'node:crypto';
import { config } from '../src/config.js';

const URL_WEBHOOK = process.env.WEBHOOK_URL || `http://localhost:${config.porta}/webhook`;
const TELEFONE = process.env.TELEFONE || '5511999990000';

async function enviar(mensagem: Record<string, unknown>) {
  const corpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA-TESTE', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      contacts: [{ wa_id: TELEFONE, profile: { name: 'Motorista Teste' } }],
      messages: [{ id: `wamid.teste.${Date.now()}.${Math.random()}`, from: TELEFONE, timestamp: String(Math.floor(Date.now() / 1000)), ...mensagem }],
    } }] }],
  });
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.meta.appSecret) headers['x-hub-signature-256'] = 'sha256=' + createHmac('sha256', config.meta.appSecret).update(corpo).digest('hex');
  const r = await fetch(URL_WEBHOOK, { method: 'POST', headers, body: corpo });
  console.log(`→ ${JSON.stringify(mensagem)}  [HTTP ${r.status}]`);
}

const texto = (body: string) => enviar({ type: 'text', text: { body } });
const botao = (id: string, title: string) => enviar({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title } } });
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
if (args[0] === '--confirmar') await botao('confirmar_ocorrencia', 'Confirmar');
else if (args[0] === '--corrigir') await botao('corrigir_ocorrencia', 'Corrigir');
else if (args.length) await texto(args.join(' '));
else {
  // Roteiro: relato incompleto → completa → confirma.
  await texto('Tombou o caminhão, a carga de geladeiras ficou toda espalhada');
  await pausa(Number(process.env.PAUSA_MS || 8000));
  await texto('Foi hoje 03:40 na BR-381 km 512, indo pro hub de Belo Horizonte. Sem feridos, 40 caixas, prejuízo uns R$ 38.000');
  await pausa(Number(process.env.PAUSA_MS || 8000));
  await botao('confirmar_ocorrencia', 'Confirmar');
}
