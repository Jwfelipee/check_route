/**
 * Modo simulado (só com AI_PROVIDER=fake, para testes e desenvolvimento): regras simples
 * por palavra-chave. Não é "a IA" do pitch. A ação sugerida NÃO cai aqui quando falta a chave:
 * nesse caso a API responde erro (ver ia/index.ts).
 */
import type { Pratica, Rota } from '../types.js';
import type { ClassificacaoIa, FichaIa, SugestaoIa } from './schemas.js';
import { TIPOS_ACIDENTE } from './schemas.js';
import { listarPraticas, type ChamadaFerramenta, type ContextoSugestao } from './ferramentas.js';
import type { ConexaoMcp } from './mcp.js';

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const REGRAS_TIPO: [RegExp, FichaIa['tipo']][] = [
  [/tomb/, 'Tombamento'],
  [/saiu da pista|saida de pista|ribanceira|derrap/, 'Saída de pista'],
  [/colis|bateu|batida|engavet/, 'Colisão'],
  [/freada|frenagem|freiou|frear/, 'Avaria por frenagem'],
  [/roub|assalt/, 'Roubo de carga'],
  [/extravi|sumiu|sumiram|faltando volume/, 'Extravio'],
  [/triagem|hub errado|destino errado/, 'Erro de triagem'],
  [/avaria|quebr|amass|danific/, 'Avaria no manuseio'],
];

const REGRAS_PRODUTO: [RegExp, NonNullable<FichaIa['produto']>][] = [
  [/geladeira|fogao|micro-?ondas|lavadora|eletrodom/, 'Eletrodomésticos'],
  [/celular|smartphone|\btv\b|televis|notebook|eletronic/, 'Eletrônicos'],
  [/roupa|tenis|calcad|moda/, 'Moda'],
  [/perfume|cosmet|shampoo|beleza/, 'Saúde e beleza'],
  [/movel|moveis|colchao|cama|sofa|utilidade/, 'Casa'],
];

export function extrairFichaFake(args: { rotas: Rota[]; relato: string; dataReferencia: string }): FichaIa {
  const t = sem(args.relato);
  const tipo = REGRAS_TIPO.find(([re]) => re.test(t))?.[1] ?? null;
  const rota = args.rotas.filter((r) => r.perna === 'transferencia').find((r) => r.cidade && t.includes(sem(r.cidade)));

  const dm = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  const hm = t.match(/(\d{1,2})[h:](\d{2})?/);
  let data_hora: string | null = null;
  if (dm || /hoje|agora/.test(t)) {
    const [ano, mes, dia] = args.dataReferencia.split('-');
    const d = dm ? `${dm[3] ?? ano}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : `${ano}-${mes}-${dia}`;
    data_hora = `${d}T${hm ? `${hm[1].padStart(2, '0')}:${hm[2] ?? '00'}` : '00:00'}`;
  }

  const trecho = args.relato.match(/\b(?:BR|SP|RJ|MG|PR|SC|RS|GO|BA|PE)[- ]?\d{2,3}(?:[^.;,\n]*?km\s?\d+)?/i)?.[0] ?? null;
  // O relato chega mascarado: a placa vem como pseudônimo VEIC-xxxx.
  const placa = args.relato.match(/\bVEIC-[0-9a-f]{4}\b/)?.[0] ?? args.relato.toUpperCase().match(/\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/)?.[0] ?? null;
  // "R$ 38.000", "R$ 12 mil", "R$ 1,5 mil"
  const custo = args.relato.match(/R\$\s?([\d.]+(?:,\d{1,2})?)(\s?mil\b)?/i);
  const volumes = t.match(/(\d+)\s*(?:volumes|caixas|unidades)/);
  const vitima = /sem ferid|ninguem se feriu|sem vitima/.test(t) ? false : /vitima|ferid/.test(t) ? true : null;

  const ficha: FichaIa = {
    tipo,
    rota_id: rota?.rota_id ?? null,
    data_hora,
    trecho,
    placa,
    tipo_veiculo: /carreta/.test(t) ? 'CARRETA' : /truck/.test(t) ? 'TRUCK' : null,
    produto: REGRAS_PRODUTO.find(([re]) => re.test(t))?.[1] ?? null,
    embalagem: /palet/.test(t) ? 'paletizada' : /caixa/.test(t) ? 'caixas' : null,
    condicao_via_clima: /chuv|neblina|pista molhada|buraco/.test(t) ? 'via molhada ou ruim' : null,
    gravidade: /tomb|vitima|ferid|perda total/.test(t) ? 'grave' : tipo ? 'moderada' : null,
    volumes_afetados: volumes ? Number(volumes[1]) : null,
    custo_estimado: custo ? Number(custo[1].replace(/\./g, '').replace(',', '.')) * (custo[2] ? 1000 : 1) : null,
    houve_vitima: vitima,
    resumo: args.relato.slice(0, 160),
    pergunta_ao_motorista: null,
  };
  return ficha;
}

type Dados = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Modo simulado da ação sugerida: consulta as MESMAS ferramentas do MCP que o Claude usa e
 * monta a ação por regra (prática principal pelo tipo que mais custou, apoio pelos seguintes).
 * Assim a tela mostra o mesmo rastro de consultas com ou sem o modelo.
 */
export async function sugerirAcaoFake(
  ctx: ContextoSugestao,
  opcoes: { contexto?: string },
  conexao: Pick<ConexaoMcp, 'client' | 'tools'>,
): Promise<SugestaoIa & { ferramentas_chamadas: ChamadaFerramenta[] }> {
  const chamadas: ChamadaFerramenta[] = [];
  const disponiveis = new Set(conexao.tools.map((t) => t.name));
  const rotaId = ctx.rota.rota_id;
  const consultar = async (nome: string): Promise<Dados | null> => {
    if (!disponiveis.has(nome)) return null;
    chamadas.push({ nome, entrada: { rota_id: rotaId } });
    const r = await conexao.client.callTool({ name: nome, arguments: { rota_id: rotaId } });
    const t = r.content.find((c) => c.type === 'text');
    return t && 'text' in t ? (JSON.parse(t.text) as Dados) : null;
  };

  chamadas.push({ nome: 'listar_praticas', entrada: { perna: ctx.rota.perna } });
  const praticas = await listarPraticas(ctx.rota.perna);
  await consultar('resumo_rota');
  const ocorr = (await consultar('ocorrencias_por_tipo')) ?? { por_tipo: [] };
  const horario = await consultar('padrao_horario');
  const trecho = await consultar('padrao_trecho');
  const cargas = await consultar('veiculos_e_cargas');
  await consultar('atrasos');
  await consultar('comparar_rotas');
  const historico = await consultar('historico_acoes');

  const porTipo: { tipo: string; ocorrencias: number; custo: number; por_mil: number | null }[] = ocorr.por_tipo ?? [];
  const tipoTop = porTipo[0]?.tipo ?? ctx.tipoMaisCaro ?? undefined;
  const casa = (p: Pratica, chave?: string | null) => Boolean(chave && p.gatilho.split('|').includes(chave));
  const principal = praticas.find((p) => casa(p, tipoTop)) ?? praticas.find((p) => casa(p, ctx.foco)) ?? praticas[0];
  const apoio = porTipo
    .slice(1)
    .map((t) => praticas.find((p) => casa(p, t.tipo)))
    .filter((p): p is Pratica => !!p && p.id !== principal.id)
    .filter((p, i, xs) => xs.findIndex((x) => x.id === p.id) === i)
    .slice(0, 2);

  const topo = porTipo.find((t) => t.tipo === tipoTop);
  const valores: Record<string, unknown> = {
    transportadora: ctx.rota.transportadora,
    tipo: tipoTop?.toLowerCase(),
    n_tipo: topo?.ocorrencias,
    ...ctx.numeros,
    produto: String(cargas?.cargas_mais_afetadas?.[0]?.produto ?? ctx.numeros.produto_mais_afetado ?? 'carga').toLowerCase(),
  };
  const usados: string[] = [];
  const base = principal.acao.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (valores[k] === undefined || valores[k] === null) return m;
    usados.push(String(valores[k]));
    return String(valores[k]);
  });

  // O que os dados têm de específico entra como frases curtas, sempre com números das ferramentas.
  const achados: string[] = [];
  const quando = [...(horario?.por_faixa_do_horario_da_ocorrencia?.faixas ?? [])].sort((a: Dados, b: Dados) => b.acidentes - a.acidentes)[0];
  if (quando?.acidentes > 0) achados.push(`${quando.acidentes} acidentes aconteceram na ${quando.faixa}`);
  const km = trecho?.por_faixa_km?.[0];
  if (km) achados.push(`o trecho mais crítico é ${km.faixa_km} (${km.ocorrencias} ocorrências)`);
  const clima = (trecho?.por_clima ?? []).find((c: Dados) => c.clima !== 'não informado');
  if (clima) achados.push(`${clima.ocorrencias} delas com ${clima.clima}`);
  const descartada = (historico?.acoes ?? []).find((a: Dados) => a.status === 'Descartada');
  const ids = [principal, ...apoio].map((p) => p.id).join(', ');
  const acao = `${base.replace(/\.$/, '')}${achados.length ? `. ${achados.join('; ')}` : ''} (${ids}).`;
  const taxa = tipoTop && TIPOS_ACIDENTE.includes(tipoTop) ? ocorr.acidentes_por_mil : topo?.por_mil;

  chamadas.push({ nome: 'propor_acao', entrada: { praticas: [principal, ...apoio].map((p) => p.id) } });
  return {
    acao,
    praticas: [
      { id: principal.id, papel: 'principal', como_usou: `Modelo de ação de "${principal.titulo}" adaptado aos dados da rota.` },
      ...apoio.map((p) => ({ id: p.id, papel: 'apoio' as const, como_usou: `Reforço do tipo de ocorrência tratado em "${p.titulo}".` })),
    ],
    justificativa: `${tipoTop ? `${tipoTop} é o tipo que mais custou na rota no mês${taxa != null ? ` (${String(taxa).replace('.', ',')} por mil viagens)` : ''}; ` : ''}a prática ${principal.id} do guia trata esse gatilho.${descartada ? ' Já houve uma ação descartada nesta rota, então vale revisar o que não funcionou.' : ''}`,
    numeros_usados: usados,
    considerou_contexto: opcoes.contexto ? `Detalhes informados: "${opcoes.contexto}". (Modo simulado: o texto da ação não muda; no modo com IA ele é reescrito.)` : null,
    ferramentas_chamadas: chamadas,
  };
}

export function classificarRelatoFake(args: { relato: string; tipos: { codigo: string; descricao: string }[] }): ClassificacaoIa {
  const t = sem(args.relato);
  const achado = args.tipos.find((x) => sem(x.descricao).split(' ').some((p) => p.length > 4 && t.includes(p)));
  return { codigo: achado?.codigo ?? args.tipos[0].codigo, confianca: achado ? 'media' : 'baixa' };
}
