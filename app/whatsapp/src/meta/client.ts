/**
 * Saída para a WhatsApp Cloud API (Graph API). Em META_DRY_RUN (ou sem token),
 * nada é enviado: as mensagens vão para o log e para `enviadasNoDryRun`, o que
 * permite testar o fluxo inteiro sem a conta da Meta.
 */
import { config } from '../config.js';

const graph = (caminho: string) => `https://graph.facebook.com/${config.meta.versao}/${caminho}`;
const auth = () => ({ authorization: `Bearer ${config.meta.token}` });

export interface Enviada { para: string; tipo: 'texto' | 'botoes'; texto: string; botoes?: { id: string; titulo: string }[] }
export const enviadasNoDryRun: Enviada[] = [];

async function postar(corpo: Record<string, unknown>, registro: Enviada) {
  if (config.meta.dryRun) {
    enviadasNoDryRun.push(registro);
    console.log(`[dry-run] → ${registro.para}: ${registro.texto}${registro.botoes ? ` [${registro.botoes.map((b) => b.titulo).join(' | ')}]` : ''}`);
    return;
  }
  const r = await fetch(graph(`${config.meta.phoneNumberId}/messages`), {
    method: 'POST',
    headers: { ...auth(), 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...corpo }),
  });
  if (!r.ok) throw new Error(`Meta respondeu ${r.status}: ${await r.text()}`);
}

/** Texto livre. Só vale dentro da janela de 24 h desde a última mensagem do contato. */
export const enviarTexto = (para: string, texto: string) =>
  postar({ to: para, type: 'text', text: { preview_url: false, body: texto.slice(0, 4096) } }, { para, tipo: 'texto', texto });

/** Até 3 botões de resposta rápida (título com no máximo 20 caracteres). */
export const enviarBotoes = (para: string, texto: string, botoes: { id: string; titulo: string }[]) =>
  postar(
    {
      to: para,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: texto.slice(0, 1024) },
        action: { buttons: botoes.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titulo.slice(0, 20) } })) },
      },
    },
    { para, tipo: 'botoes', texto, botoes },
  );

/** Marca como lida (os dois tiques azuis) e mostra "digitando…". */
export async function marcarLida(mensagemId: string) {
  if (config.meta.dryRun) return;
  await fetch(graph(`${config.meta.phoneNumberId}/messages`), {
    method: 'POST',
    headers: { ...auth(), 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: mensagemId, typing_indicator: { type: 'text' } }),
  }).catch(() => undefined);
}

/** Baixa uma mídia recebida: primeiro pega a URL temporária pelo id, depois o arquivo (com o mesmo token). */
export async function baixarMidia(mediaId: string): Promise<{ base64: string; mime: string }> {
  const meta = await fetch(graph(mediaId), { headers: auth() });
  if (!meta.ok) throw new Error(`Mídia ${mediaId}: ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const arq = await fetch(url, { headers: auth() });
  if (!arq.ok) throw new Error(`Download da mídia: ${arq.status}`);
  return { base64: Buffer.from(await arq.arrayBuffer()).toString('base64'), mime: mime_type };
}
