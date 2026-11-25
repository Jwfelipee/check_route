/**
 * Modo simulado (sem ANTHROPIC_API_KEY ou AI_PROVIDER=fake): regras simples
 * por palavra-chave, para a demo não travar sem rede. Não é "a IA" do pitch.
 */
import type { Pratica, Rota } from '../types.js';
import type { ClassificacaoIa, FichaIa, SugestaoIa } from './schemas.js';
import { TIPOS_ACIDENTE } from './schemas.js';
import { consultarRota, listarPraticas, ocorrenciasDaRota, type ChamadaFerramenta, type ContextoSugestao } from './ferramentas.js';

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

/**
 * Modo simulado da ação sugerida: percorre as MESMAS ferramentas que o Claude usa
 * (consultar_rota → ocorrencias_da_rota → listar_praticas → propor_acao), mas a escolha
 * é por regra. Assim a tela mostra o mesmo rastro de consultas com ou sem chave.
 */
export async function sugerirAcaoFake(ctx: ContextoSugestao): Promise<SugestaoIa & { ferramentas_chamadas: ChamadaFerramenta[] }> {
  const chamadas: ChamadaFerramenta[] = [];
  chamadas.push({ nome: 'consultar_rota', entrada: { rota_id: ctx.rota.rota_id } });
  const rota = consultarRota(ctx);
  chamadas.push({ nome: 'ocorrencias_da_rota', entrada: { rota_id: ctx.rota.rota_id } });
  const ocorr = await ocorrenciasDaRota(ctx.rota.rota_id);
  chamadas.push({ nome: 'listar_praticas', entrada: { perna: ctx.rota.perna } });
  const praticas = await listarPraticas(ctx.rota.perna);

  const tipoTop = ocorr.por_tipo[0]?.tipo ?? rota.tipo_mais_caro;
  const casa = (p: Pratica, chave?: string | null) => Boolean(chave && p.gatilho.split('|').includes(chave));
  const pratica =
    praticas.find((p) => casa(p, tipoTop)) ?? praticas.find((p) => casa(p, ctx.foco)) ?? praticas[0];

  const topo = ocorr.por_tipo.find((t) => t.tipo === tipoTop);
  const usados: string[] = [];
  const valores: Record<string, unknown> = {
    transportadora: ctx.rota.transportadora,
    tipo: tipoTop?.toLowerCase(),
    n_tipo: topo?.ocorrencias,
    ...ctx.numeros,
    produto: String(ctx.numeros.produto_mais_afetado ?? 'carga').toLowerCase(),
  };
  const acao = pratica.acao.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (valores[k] === undefined || valores[k] === null) return m;
    usados.push(k);
    return String(valores[k]);
  });
  const taxa = tipoTop && TIPOS_ACIDENTE.includes(tipoTop) ? ocorr.acidentes_por_mil : topo?.por_mil;
  chamadas.push({ nome: 'propor_acao', entrada: { pratica_id: pratica.id } });
  return {
    pratica_id: pratica.id,
    acao,
    justificativa: tipoTop
      ? `${tipoTop} é o tipo que mais custou na rota no mês${taxa != null ? ` (${String(taxa).replace('.', ',')} por mil viagens)` : ''}; a prática ${pratica.id} do guia trata esse gatilho.`
      : `A prática ${pratica.id} do guia trata o foco da rota (${ctx.foco ?? 'sem foco definido'}).`,
    numeros_usados: usados,
    ferramentas_chamadas: chamadas,
  };
}

export function classificarRelatoFake(args: { relato: string; tipos: { codigo: string; descricao: string }[] }): ClassificacaoIa {
  const t = sem(args.relato);
  const achado = args.tipos.find((x) => sem(x.descricao).split(' ').some((p) => p.length > 4 && t.includes(p)));
  return { codigo: achado?.codigo ?? args.tipos[0].codigo, confianca: achado ? 'media' : 'baixa' };
}
