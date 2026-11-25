/**
 * Transcrição dos áudios do WhatsApp com Whisper via OpenRouter
 * (POST /audio/transcriptions, formato multipart compatível com a OpenAI).
 * O WhatsApp manda nota de voz em audio/ogg (opus), que o Whisper aceita direto.
 */
import { config } from './config.js';

export const transcricaoAtiva = () => !!config.transcricao.chave;

const EXTENSOES: Record<string, string> = { ogg: 'ogg', opus: 'ogg', mpeg: 'mp3', mp3: 'mp3', mp4: 'm4a', m4a: 'm4a', aac: 'aac', amr: 'amr', wav: 'wav', webm: 'webm' };
const extensao = (mime: string) => EXTENSOES[mime.split(';')[0].split('/')[1]?.trim() ?? ''] ?? 'ogg';

/** Devolve o texto falado no áudio (string vazia se não houver fala). */
export async function transcrever(audio: Buffer, mime: string): Promise<string> {
  const { chave, modelo, url, idioma } = config.transcricao;
  if (!chave) throw new Error('OPENROUTER_API_KEY não configurada');
  const tipo = mime.split(';')[0].trim() || 'audio/ogg';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: tipo }), `audio.${extensao(mime)}`);
  form.append('model', modelo);
  if (idioma) form.append('language', idioma);
  const r = await fetch(`${url}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${chave}`, 'X-Title': 'CheckRoute WhatsApp' },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Transcrição respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const { text } = (await r.json()) as { text?: string };
  return (text ?? '').trim();
}
