/**
 * Os dois pontos de IA do recorte da demo (Transferência):
 *  a) relato do motorista → ficha com campos fixos (se faltar dado, pergunta);
 *  b) padrão da rota → ação escolhida do guia, citando só os números do código.
 * A ficha só entra na base depois que uma pessoa confirma (POST /ocorrencias),
 * e a ação só vale depois do "Validar e acompanhar" (POST /acoes).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod/v4';
import { db } from '../db.js';
import { ia } from '../ia/index.js';
import {
  CAMPOS_OBRIGATORIOS,
  FichaConfirmada,
  PedidoExtracao,
  PedidoSugestao,
  TIPOS_ACIDENTE,
  type FichaIa,
} from '../ia/schemas.js';
import { store } from '../store.js';
import type { Ocorrencia } from '../types.js';

const NOMES_CAMPO: Record<string, string> = {
  tipo: 'o que aconteceu (colisão, tombamento, saída de pista, avaria…)',
  rota_id: 'para qual hub a carga ia',
  data_hora: 'o dia e o horário',
  trecho: 'a rodovia e o km',
};

export async function rotasIa(app: FastifyInstance) {
  app.post('/ocorrencias/extrair', async (req, reply) => {
    const p = PedidoExtracao.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ erro: 'Pedido inválido', detalhes: z.flattenError(p.error) });

    const rotas = store.rotas();
    const { dados: ficha, meta } = await ia.extrairFicha({
      rotas,
      relato: p.data.relato,
      dataReferencia: new Date().toISOString().slice(0, 10),
      imagem: p.data.imagemBase64
        ? { base64: p.data.imagemBase64.replace(/^data:[^,]+,/, ''), tipo: p.data.imagemTipo ?? 'image/jpeg' }
        : undefined,
    });

    // Regras do código, não do modelo: rota precisa existir; obrigatórios decidem se a ficha está completa.
    const idsTransferencia = new Set(rotas.filter((r) => r.perna === 'transferencia').map((r) => r.rota_id));
    const f: FichaIa = { ...ficha };
    if (!f.rota_id && p.data.rota_id) f.rota_id = p.data.rota_id;
    if (f.rota_id && !idsTransferencia.has(f.rota_id)) f.rota_id = null;

    const faltando = CAMPOS_OBRIGATORIOS.filter((c) => f[c] === null || f[c] === '');
    const pergunta = faltando.length
      ? (f.pergunta_ao_motorista ?? `Para registrar, preciso saber: ${faltando.map((c) => NOMES_CAMPO[c]).join('; ')}.`)
      : null;

    return { ok: faltando.length === 0, ficha: { ...f, pergunta_ao_motorista: pergunta }, faltando, pergunta, meta };
  });

  app.post('/ocorrencias', async (req, reply) => {
    const p = FichaConfirmada.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ erro: 'Ficha incompleta', detalhes: z.flattenError(p.error) });
    const f = p.data;
    const rota = store.rotas().find((r) => r.rota_id === f.rota_id && r.perna === 'transferencia');
    if (!rota) return reply.code(400).send({ erro: `Rota de transferência desconhecida: ${f.rota_id}` });

    const data = f.data_hora.slice(0, 10);
    const ref = store.referencia().data;
    const diasAberto = Math.max(0, Math.round((Date.parse(ref) - Date.parse(data)) / 86_400_000));
    const { relato, ...detalhes } = f;

    const oc: Ocorrencia = {
      id: `OC-IA-${Date.now()}`,
      data,
      mes: data.slice(0, 7),
      perna: 'transferencia',
      rota_id: rota.rota_id,
      transportadora: rota.transportadora,
      tipo: f.tipo,
      produto: f.produto,
      custo: f.custo_estimado,
      acao: f.tipo === 'Erro de triagem' ? 'Reenviar ao hub certo' : 'Acionar seguro',
      status: 'Aberta',
      dias_resolucao: null,
      dias_em_aberto: diasAberto,
      detalhes: { ...detalhes, relato, acidente: TIPOS_ACIDENTE.includes(f.tipo), origem: 'relato + IA, confirmado por pessoa' },
    };
    return reply.code(201).send(store.criarOcorrencia(oc));
  });

  app.post('/acoes/sugerir', async (req, reply) => {
    const p = PedidoSugestao.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ erro: 'Pedido inválido', detalhes: z.flattenError(p.error) });
    const rota = store.rotas().find((r) => r.rota_id === p.data.rota_id);
    if (!rota) return reply.code(404).send({ erro: 'Rota não encontrada' });
    const praticas = store.praticas().filter((x) => x.perna === rota.perna);

    const { dados, meta } = await ia.sugerirAcao({
      rota,
      praticas,
      numeros: p.data.numeros,
      foco: p.data.foco,
      tipoMaisCaro: p.data.tipo_mais_caro,
    });

    const pratica = praticas.find((x) => x.id === dados.pratica_id);
    if (!pratica) {
      return reply.code(502).send({ erro: `A IA escolheu uma prática fora do guia (${dados.pratica_id}). Tente de novo.`, meta });
    }
    return {
      ...dados,
      pratica: { id: pratica.id, titulo: pratica.titulo, prazo_dias: pratica.prazo_dias, esforco: pratica.esforco },
      numeros_fora: numerosFora(dados.acao, p.data.numeros),
      meta,
    };
  });

  app.get('/ia/uso', async () => {
    const resumo = db
      .prepare(
        `SELECT operacao, modelo, simulado, COUNT(*) AS chamadas,
                ROUND(AVG(ms)) AS ms_medio, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
                SUM(custo_usd) AS custo_usd, SUM(custo_usd) / COUNT(*) AS custo_medio_usd
         FROM ia_uso GROUP BY operacao, modelo, simulado ORDER BY operacao`,
      )
      .all();
    const ultimas = db.prepare('SELECT * FROM ia_uso ORDER BY id DESC LIMIT 20').all();
    return { resumo, ultimas };
  });
}

/**
 * Confere se cada número citado no texto veio do código (controle "a IA não inventa números").
 * Compara só os dígitos, para aceitar formatos como "12,5%" ou "R$ 1.234".
 */
function numerosFora(texto: string, numeros: Record<string, unknown>): string[] {
  const digitos = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');
  const conhecidos = new Set(Object.values(numeros).filter((v) => v !== null).map((v) => digitos(String(v))));
  const citados = texto.match(/\d[\d.,]*/g) ?? [];
  return citados.filter((n) => {
    const d = digitos(n);
    return d.length > 0 && !conhecidos.has(d);
  });
}
