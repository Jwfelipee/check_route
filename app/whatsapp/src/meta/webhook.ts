/**
 * Entrada do webhook da WhatsApp Cloud API: verificação da assinatura e
 * tradução do payload da Meta para mensagens simples que o agente entende.
 * Docs: developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Confere X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(corpo bruto, app secret). */
export function assinaturaValida(corpoBruto: Buffer, cabecalho: string | undefined, appSecret: string): boolean {
  if (!appSecret || !cabecalho?.startsWith('sha256=')) return false;
  const esperado = createHmac('sha256', appSecret).update(corpoBruto).digest();
  const recebido = Buffer.from(cabecalho.slice('sha256='.length), 'hex');
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export type MensagemRecebida =
  | { tipo: 'texto'; id: string; de: string; nome?: string; texto: string }
  | { tipo: 'imagem'; id: string; de: string; nome?: string; mediaId: string; mime: string; legenda?: string }
  | { tipo: 'botao'; id: string; de: string; nome?: string; botaoId: string; titulo: string }
  | { tipo: 'audio'; id: string; de: string; nome?: string; mediaId: string }
  | { tipo: 'outro'; id: string; de: string; nome?: string; original: string };

// Formato do payload (só o que usamos).
interface Payload {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type: string; caption?: string };
          audio?: { id: string };
          interactive?: { type: string; button_reply?: { id: string; title: string } };
          button?: { payload: string; text: string };
        }[];
      };
    }[];
  }[];
}

/** Extrai as mensagens do payload. Status de entrega (sent/delivered/read) são ignorados. */
export function lerMensagens(payload: unknown): MensagemRecebida[] {
  const p = payload as Payload;
  if (p?.object !== 'whatsapp_business_account') return [];
  const saida: MensagemRecebida[] = [];
  for (const entry of p.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value;
      if (ch.field !== 'messages' || !v?.messages) continue;
      for (const m of v.messages) {
        const nome = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
        const base = { id: m.id, de: m.from, nome };
        if (m.type === 'text' && m.text) saida.push({ ...base, tipo: 'texto', texto: m.text.body });
        else if (m.type === 'image' && m.image) saida.push({ ...base, tipo: 'imagem', mediaId: m.image.id, mime: m.image.mime_type, legenda: m.image.caption });
        else if (m.type === 'interactive' && m.interactive?.button_reply) saida.push({ ...base, tipo: 'botao', botaoId: m.interactive.button_reply.id, titulo: m.interactive.button_reply.title });
        else if (m.type === 'button' && m.button) saida.push({ ...base, tipo: 'botao', botaoId: m.button.payload, titulo: m.button.text });
        else if (m.type === 'audio' && m.audio) saida.push({ ...base, tipo: 'audio', mediaId: m.audio.id });
        else saida.push({ ...base, tipo: 'outro', original: m.type });
      }
    }
  }
  return saida;
}
