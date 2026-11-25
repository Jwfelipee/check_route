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
import { assinaturaDaRota, conferirProposta } from '../ia/ferramentas.js';
import { ErroIa } from '../ia/mcp.js';
import { contatoPorId, internoValido, podeNaRota, publico } from '../contatos.js';
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

    // Quem registra: pelo WhatsApp só contato cadastrado e ativo, em rota dele, e só o app de WhatsApp (token interno).
    let contato = null;
    if (f.canal === 'whatsapp' && !internoValido(req)) return reply.code(401).send({ erro: 'Registro por WhatsApp: uso interno do app de WhatsApp' });
    if (f.canal === 'whatsapp' && !f.reportado_por) return reply.code(403).send({ erro: 'Registro por WhatsApp exige um contato cadastrado' });
    if (f.reportado_por) {
      contato = await contatoPorId(f.reportado_por);
      if (!contato || !contato.ativo) return reply.code(403).send({ erro: 'Contato não cadastrado ou inativo' });
      if (!podeNaRota(contato, f.rota_id)) return reply.code(403).send({ erro: 'Esta rota não está entre as rotas deste contato' });
    }

    const data = f.data_hora.slice(0, 10);
    const ref = (await store.referencia()).data;
    const diasAberto = Math.max(0, Math.round((Date.parse(ref) - Date.parse(data)) / 86_400_000));

    // Nada entra no banco sem máscara: relato e campos livres de novo (defesa em profundidade,
    // vale para o WhatsApp, que anexa telefone e nome ao relato) e placa só como pseudônimo.
    const { relato, canal, com_foto, reportado_por: _rep, ...campos } = f;
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
        ...(contato ? { reportado_por: publico(contato) } : {}),
      },
    };
    return reply.code(201).send(await store.criarOcorrencia(oc));
  });

  /** Ocorrências registradas pelo relato (WhatsApp ou formulário), mais novas primeiro, com relato × ficha. */
  app.get<{ Querystring: { limite?: string } }>('/ocorrencias/recentes', async (req) => {
    const limite = Math.min(200, Math.max(1, Number(req.query.limite) || 50));
    return store.ocorrenciasRecentes(limite);
  });

  /**
   * Ação sugerida por IA (não existe sugestão sem IA). A sugestão fica guardada por rota e versão:
   *  - sem `contexto`: devolve a última versão se os dados da rota não mudaram (assinatura igual); senão gera outra;
   *  - com `contexto` ("Dar detalhes"): sempre gera outra versão, levando em conta o que a pessoa disse.
   * Falha da IA, falta de chave ou MCP fora do ar: 503 com `motivo`.
   */
  const gerando = new Map<string, Promise<Record<string, unknown>>>();

  app.post('/acoes/sugerir', async (req, reply) => {
    const p = PedidoSugestao.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ erro: 'Pedido inválido', detalhes: z.flattenError(p.error) });
    const pedido = p.data;
    const rota = (await store.rotas()).find((r) => r.rota_id === pedido.rota_id);
    if (!rota) return reply.code(404).send({ erro: 'Rota não encontrada' });

    // O que a pessoa escreve é dado: sem dado pessoal, sem delimitadores e com instrução suspeita marcada.
    const bruto = p.data.contexto?.trim() || undefined;
    const privado = bruto ? mascarar(bruto) : null;
    const contexto = privado ? neutralizarDelimitadores(privado.texto) : undefined;
    const guardas = bruto ? detectarInstrucao(bruto) : { instrucao_suspeita: false, motivos: [] };
    const privacidade = { mascarados: privado?.mascarados ?? [] };

    const assinatura = await assinaturaDaRota(rota.rota_id, p.data.numeros);
    const [ultima] = await sql<LinhaSugestao>('SELECT * FROM sugestoes_acao WHERE rota_id = $1 ORDER BY versao DESC LIMIT 1', [rota.rota_id]);
    if (!contexto && ultima && ultima.assinatura === assinatura) return doBanco(ultima, true);

    const chave = `${rota.rota_id}|${assinatura}|${contexto ?? ''}`;
    let promessa = gerando.get(chave);
    if (!promessa) {
      promessa = gerar().finally(() => gerando.delete(chave));
      gerando.set(chave, promessa);
    }
    try {
      return await promessa;
    } catch (e) {
      if (e instanceof ErroIa) return reply.code(503).send({ erro: e.message, motivo: e.motivo });
      app.log.error(e);
      return reply.code(502).send({ erro: (e as Error).message, motivo: 'falha_ia' });
    }

    async function gerar(): Promise<Record<string, unknown>> {
      const ctx = { rota: rota!, numeros: pedido.numeros, foco: pedido.foco, tipoMaisCaro: pedido.tipo_mais_caro };
      const anterior = ultima ? { acao: ultima.sugestao.acao as string, praticas: (ultima.sugestao.praticas as { id: string }[]).map((x) => ({ id: x.id })) } : undefined;
      const { dados, consultas, meta } = await ia.sugerirAcao(ctx, { contexto, anterior: contexto ? anterior : undefined });
      const erro = await conferirProposta(ctx, dados);
      if (erro) throw new ErroIa('falha_ia', `A IA propôs algo fora do guia. ${erro}`);

      const guia = await store.praticas();
      const sugestao = {
        acao: dados.acao,
        justificativa: dados.justificativa,
        numeros_usados: dados.numeros_usados,
        considerou_contexto: dados.considerou_contexto,
        praticas: dados.praticas.map((u) => {
          const g = guia.find((x) => x.id === u.id)!;
          return { ...u, titulo: g.titulo, prazo_dias: g.prazo_dias, esforco: g.esforco };
        }),
        // Números que vieram do código: os do front e os que as ferramentas devolveram à IA.
        numeros_fora: numerosFora(dados.acao.replace(/\b[A-Z]{3}-\d{2}\b/g, ''), [pedido.numeros, consultas.map((c) => c.resultado), { km: rota!.km }]),
        ferramentas_chamadas: dados.ferramentas_chamadas,
        privacidade,
        guardas,
      };
      const [nova] = await sql<LinhaSugestao>(
        `INSERT INTO sugestoes_acao (rota_id, versao, assinatura, contexto, sugestao, ferramentas, modelo, uso, simulado)
         VALUES ($1, COALESCE((SELECT max(versao) FROM sugestoes_acao WHERE rota_id = $1), 0) + 1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [rota!.rota_id, assinatura, contexto ?? null, sugestao, JSON.stringify(dados.ferramentas_chamadas), meta.modelo, meta, meta.modo === 'simulado'],
      );
      return doBanco(nova, false);
    }
  });

  /** Histórico de versões da sugestão de uma rota (a mais nova primeiro). */
  app.get<{ Params: { rota_id: string } }>('/acoes/sugestoes/:rota_id', async (req) => {
    const linhas = await sql<LinhaSugestao>('SELECT * FROM sugestoes_acao WHERE rota_id = $1 ORDER BY versao DESC LIMIT 20', [req.params.rota_id]);
    return linhas.map((l) => doBanco(l, false));
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

interface LinhaSugestao {
  rota_id: string; versao: number; assinatura: string; contexto: string | null;
  sugestao: Record<string, unknown>; modelo: string; uso: Record<string, unknown> | null; simulado: boolean; criada_em: Date;
}

function doBanco(l: LinhaSugestao, cache: boolean): Record<string, unknown> {
  return {
    ...l.sugestao,
    rota_id: l.rota_id,
    versao: l.versao,
    contexto: l.contexto,
    simulado: l.simulado,
    cache,
    criada_em: l.criada_em.toISOString(),
    meta: l.uso,
  };
}
