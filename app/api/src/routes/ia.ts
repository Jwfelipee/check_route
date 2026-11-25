/**
 * Os dois pontos de IA do recorte da demo (Transferência):
 *  a) relato do motorista → ficha com campos fixos (se faltar dado, pergunta);
 *  b) padrão da rota → ação escolhida do guia, citando só os números do código.
 * A ficha só entra na base depois que uma pessoa confirma (POST /ocorrencias),
 * e a ação só vale depois do "Validar e acompanhar" (POST /acoes).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod/v4';
import { sql } from '../db.js';
import { ia } from '../ia/index.js';
import { ocorrenciasDaRota } from '../ia/ferramentas.js';
import {
  CAMPOS_OBRIGATORIOS,
  FichaConfirmada,
  PedidoExtracao,
  PedidoSugestao,
  TIPOS_ACIDENTE,
  type FichaIa,
} from '../ia/schemas.js';
import { detectarInstrucao, neutralizarDelimitadores, revisarSaida } from '../guardas.js';
import { mascarar, mascararCampos, mascararPlaca, type TipoDado } from '../privacidade.js';
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

    // Privacidade e guardas ANTES do modelo: ele não recebe dado pessoal e o relato não fecha a tag <relato>.
    const privado = mascarar(p.data.relato);
    const guardas = detectarInstrucao(p.data.relato);
    const relatoSeguro = neutralizarDelimitadores(privado.texto);

    const rotas = await store.rotas();
    const { dados: ficha, meta } = await ia.extrairFicha({
      rotas,
      relato: relatoSeguro,
      dataReferencia: new Date().toISOString().slice(0, 10),
      imagem: p.data.imagemBase64
        ? { base64: p.data.imagemBase64.replace(/^data:[^,]+,/, ''), tipo: p.data.imagemTipo ?? 'image/jpeg' }
        : undefined,
    });

    // Regras do código, não do modelo: rota precisa existir; obrigatórios decidem se a ficha está completa.
    const idsTransferencia = new Set(rotas.filter((r) => r.perna === 'transferencia').map((r) => r.rota_id));
    const f: FichaIa = { ...ficha, placa: mascararPlaca(ficha.placa) };
    if (!f.rota_id && p.data.rota_id) f.rota_id = p.data.rota_id;
    if (f.rota_id && !idsTransferencia.has(f.rota_id)) f.rota_id = null;
    // A foto também pode trazer dado pessoal: o texto que o modelo devolve passa de novo pela máscara.
    const saida = mascararCampos(f, ['resumo', 'trecho', 'embalagem', 'condicao_via_clima', 'tipo_veiculo']);

    const faltando = CAMPOS_OBRIGATORIOS.filter((c) => saida.obj[c] === null || saida.obj[c] === '');
    const pergunta = faltando.length
      ? (saida.obj.pergunta_ao_motorista ?? `Para registrar, preciso saber: ${faltando.map((c) => NOMES_CAMPO[c]).join('; ')}.`)
      : null;

    return {
      ok: faltando.length === 0,
      ficha: { ...saida.obj, pergunta_ao_motorista: pergunta },
      faltando,
      pergunta,
      // Campos que a pessoa precisa olhar com atenção antes de confirmar (ex.: custo implausível).
      revisar: revisarSaida(saida.obj),
      relato_mascarado: privado.texto,
      privacidade: { mascarados: unir(privado.mascarados, saida.mascarados) },
      guardas,
      meta: { ...meta, processado_em: new Date().toISOString() },
    };
  });

  app.post('/ocorrencias', async (req, reply) => {
    const p = FichaConfirmada.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ erro: 'Ficha incompleta', detalhes: z.flattenError(p.error) });
    const f = p.data;
    const rota = (await store.rotas()).find((r) => r.rota_id === f.rota_id && r.perna === 'transferencia');
    if (!rota) return reply.code(400).send({ erro: `Rota de transferência desconhecida: ${f.rota_id}` });

    const data = f.data_hora.slice(0, 10);
    const ref = (await store.referencia()).data;
    const diasAberto = Math.max(0, Math.round((Date.parse(ref) - Date.parse(data)) / 86_400_000));

    // Nada entra no banco sem máscara: relato e campos livres de novo (defesa em profundidade,
    // vale para o WhatsApp, que anexa telefone e nome ao relato) e placa só como pseudônimo.
    const { relato, canal, com_foto, ...campos } = f;
    const privRelato = relato ? mascarar(relato) : { texto: undefined, mascarados: [] as TipoDado[] };
    const privCampos = mascararCampos({ ...campos, placa: mascararPlaca(campos.placa) }, [
      'resumo', 'trecho', 'embalagem', 'condicao_via_clima', 'tipo_veiculo',
    ]);
    const guardas = relato ? detectarInstrucao(relato) : { instrucao_suspeita: false, motivos: [] };

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
      canal,
      detalhes: {
        ...privCampos.obj,
        relato: privRelato.texto,
        com_foto: Boolean(com_foto),
        acidente: TIPOS_ACIDENTE.includes(f.tipo),
        origem: 'relato + IA, confirmado por pessoa',
        registrada_em: new Date().toISOString(),
        privacidade: { mascarados: unir(privRelato.mascarados, privCampos.mascarados) },
        guardas,
      },
    };
    return reply.code(201).send(await store.criarOcorrencia(oc));
  });

  /** Ocorrências registradas pelo relato (WhatsApp ou formulário), mais novas primeiro, com relato × ficha. */
  app.get<{ Querystring: { limite?: string } }>('/ocorrencias/recentes', async (req) => {
    const limite = Math.min(200, Math.max(1, Number(req.query.limite) || 50));
    return store.ocorrenciasRecentes(limite);
  });

  app.post('/acoes/sugerir', async (req, reply) => {
    const p = PedidoSugestao.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ erro: 'Pedido inválido', detalhes: z.flattenError(p.error) });
    const rota = (await store.rotas()).find((r) => r.rota_id === p.data.rota_id);
    if (!rota) return reply.code(404).send({ erro: 'Rota não encontrada' });
    const praticas = (await store.praticas()).filter((x) => x.perna === rota.perna);

    const { dados, meta } = await ia.sugerirAcao({
      rota,
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
      // Números que vieram do código: os do front e os que as ferramentas devolveram à IA.
      numeros_fora: numerosFora(dados.acao, [p.data.numeros, await ocorrenciasDaRota(rota.rota_id), { km: rota.km }]),
      meta,
    };
  });

  app.get('/ia/uso', async () => {
    const resumo = await sql(
      `SELECT operacao, modelo, simulado, COUNT(*)::int AS chamadas,
              ROUND(AVG(ms))::int AS ms_medio, SUM(input_tokens)::int AS input_tokens,
              SUM(output_tokens)::int AS output_tokens, SUM(custo_usd) AS custo_usd,
              SUM(custo_usd) / COUNT(*) AS custo_medio_usd
       FROM ia_uso GROUP BY operacao, modelo, simulado ORDER BY operacao`,
    );
    const ultimas = await sql('SELECT * FROM ia_uso ORDER BY id DESC LIMIT 20');
    return { resumo, ultimas };
  });
}

/**
 * Confere se cada número citado no texto veio do código (controle "a IA não inventa números"):
 * dos números enviados pelo front ou das ferramentas que a IA consultou.
 * Compara só os dígitos, para aceitar formatos como "12,5%" ou "R$ 1.234".
 */
function numerosFora(texto: string, fontes: unknown[]): string[] {
  const digitos = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');
  const conhecidos = new Set<string>();
  const coleta = (v: unknown): void => {
    if (v == null) return;
    if (typeof v === 'number') {
      // Aceita o valor como veio e as formas arredondadas que a IA costuma citar (inteiro, 1 casa).
      [v, Math.round(v), Math.round(v * 10) / 10].forEach((n) => conhecidos.add(digitos(String(n))));
    } else if (typeof v === 'string') {
      (v.match(/\d[\d.,]*/g) ?? []).forEach((n) => conhecidos.add(digitos(n)));
    } else if (Array.isArray(v)) v.forEach(coleta);
    else if (typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(coleta);
  };
  fontes.forEach(coleta);
  const citados = texto.match(/\d[\d.,]*/g) ?? [];
  return citados.filter((n) => {
    const d = digitos(n);
    return d.length > 0 && !conhecidos.has(d);
  });
}

const unir = (...listas: TipoDado[][]) => [...new Set(listas.flat())];
