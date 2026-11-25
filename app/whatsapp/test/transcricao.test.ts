import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { transcrever } from '../src/transcricao.js';

describe('transcrição de áudio (OpenRouter / Whisper)', () => {
  afterEach(() => vi.unstubAllGlobals());
  config.transcricao.chave = 'chave-teste';

  it('manda o áudio em multipart e devolve o texto limpo', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ text: ' tombou o caminhão ' })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(transcrever(Buffer.from('ogg'), 'audio/ogg; codecs=opus')).resolves.toBe('tombou o caminhão');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer chave-teste');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('openai/whisper-1');
    expect(form.get('language')).toBe('pt');
    const arquivo = form.get('file') as File;
    expect(arquivo.name).toBe('audio.ogg');
    expect(arquivo.type).toBe('audio/ogg');
  });

  it('erro HTTP vira exceção', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('sem crédito', { status: 402 })));
    await expect(transcrever(Buffer.from('x'), 'audio/ogg')).rejects.toThrow(/402/);
  });
});
