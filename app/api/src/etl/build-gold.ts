/**
 * Camada gold: bronze_* → gold_* no formato exato do contrato (docs/DADOS.md).
 * As regras foram conferidas contra os JSON do front (npm run etl:check).
 *
 * Sujeiras tratadas:
 *  - tms_coletas com reenvio duplicado → fica a última ingestão por coleta_id
 *  - sac_ocorrencia_eventos duplicados → um por evento_id
 *  - código do SAC com espaço, minúscula ou legado (C01, T02…) → código atual
 *  - CNPJ com e sem máscara, decimal com vírgula, datas dd/mm/aaaa e ISO
 *  - WMS e eventos do SAC em UTC; o resto em -03:00
 *  - CT-e cancelado fora do frete; complementar soma com o normal
 *  - lançamento de ocorrência cancelado fora do custo (efetivado + provisionado entram)
 *  - tabela de frete de 2025 vencida → vale a vigência sem data de fim
 */
import { inserirEmLote, sql, transacao } from '../db.js';
import {
  arred,
  codigo,
  dataLocal,
  dataSimples,
  digitos,
  horasEntre,
  instante,
  media,
  numero,
  PERNA,
  REGIAO_DA_UF,
} from './clean.js';
import type { Ocorrencia, OperacaoMes, Premissa, Rota } from '../types.js';

type Linha = Record<string, string | null>;

// A bronze é lida uma vez do Postgres; as regras abaixo trabalham em memória.
const bronze = new Map<string, Linha[]>();
const ORDEM: Record<string, string> = {
  bronze_tms_coletas: 'ORDER BY _ingested_at',
  bronze_sac_ocorrencias: 'ORDER BY protocolo',
};
const TABELAS = [
  'bronze_tms_locais', 'bronze_erp_transportadoras', 'bronze_fin_tabela_frete', 'bronze_erp_produtos',
  'bronze_tms_veiculos', 'bronze_tms_rotas', 'bronze_fin_ctes', 'bronze_tms_coletas', 'bronze_tms_coleta_tentativas',
  'bronze_wms_recebimentos', 'bronze_wms_movimentos_crossdock', 'bronze_tms_viagens', 'bronze_tms_entrega_tentativas',
  'bronze_tms_entregas', 'bronze_sac_tipos_ocorrencia', 'bronze_fin_lancamentos_ocorrencia',
  'bronze_sac_ocorrencia_eventos', 'bronze_sac_ocorrencias', 'bronze_cfg_premissas',
];
async function carregarBronzeDoBanco() {
  await Promise.all(
    TABELAS.map(async (t) => bronze.set(t, await sql<Linha>(`SELECT * FROM ${t} ${ORDEM[t] ?? ''}`))),
  );
}
const ler = (tabela: string): Linha[] => {
  const l = bronze.get(tabela);
  if (!l) throw new Error(`Tabela não carregada: ${tabela}`);
  return l;
};

function agrupar<T>(xs: T[], chave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = chave(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Tipo da coluna pelo conteúdo: número vira DOUBLE PRECISION (volta como number), o resto TEXT. */
function tipoDaColuna(linhas: Record<string, unknown>[], c: string) {
  const valores = linhas.map((l) => l[c]).filter((v) => v !== null && v !== undefined);
  return valores.length && valores.every((v) => typeof v === 'number') ? 'DOUBLE PRECISION' : 'TEXT';
}

/** Cria (ou recria) a tabela gold com as colunas dos objetos e insere tudo. */
async function gravar(tabela: string, linhas: object[], colunasExtras: string[] = []) {
  const ls = linhas as Record<string, unknown>[];
  const colunas = [...new Set([...ls.flatMap((l) => Object.keys(l)), ...colunasExtras])];
  await transacao(async (c) => {
    await c.query(`DROP TABLE IF EXISTS ${tabela}`);
    await c.query(`CREATE TABLE ${tabela} (${colunas.map((x) => `"${x}" ${tipoDaColuna(ls, x)}`).join(', ')})`);
    await inserirEmLote(c, tabela, colunas, ls.map((l) => colunas.map((x) => l[x] ?? null)));
  });
  console.log(`  ${tabela}: ${linhas.length.toLocaleString('pt-BR')} linhas`);
}

export async function construirGold() {
  console.log('Montando o gold');
  await carregarBronzeDoBanco();

  // ---------- cadastros ----------
  const locais = new Map(ler('bronze_tms_locais').map((l) => [l.cod_local!, l]));
  const transportadoras = new Map(ler('bronze_erp_transportadoras').map((t) => [digitos(t.cnpj!), t.nome_fantasia!]));
  const freteOrcado = new Map(
    ler('bronze_fin_tabela_frete')
      .filter((f) => !f.vigencia_fim)
      .map((f) => [f.rota_id!, numero(f.valor_orcado)!]),
  );
  const categoriaDoSku = new Map(ler('bronze_erp_produtos').map((p) => [p.sku!, p.categoria!]));
  const capacidadeM3 = new Map(ler('bronze_tms_veiculos').map((v) => [v.placa!, numero(v.capacidade_m3)!]));

  // ---------- rotas ----------
  const nomeLocal = (cod: string, perna: string, papel: 'origem' | 'destino') => {
    const l = locais.get(cod)!;
    if (l.tipo_local !== 'ZONA') return l.nome!;
    const quem = perna === 'coleta' && papel === 'origem' ? 'Fornecedores' : 'Clientes';
    return `${quem} de ${l.cidade} (${l.zona})`;
  };

  const rotas: Rota[] = ler('bronze_tms_rotas').map((r) => {
    const perna = PERNA[r.tipo_perna!];
    // Coleta é descrita pela zona de origem; transferência e entrega, pelo destino.
    const ref = locais.get(perna === 'coleta' ? r.cod_local_origem! : r.cod_local_destino!)!;
    return {
      rota_id: r.rota_id!,
      perna,
      rota: r.descricao!,
      cidade: ref.cidade,
      uf: ref.uf,
      zona: ref.zona,
      regiao: REGIAO_DA_UF[ref.uf!],
      origem: nomeLocal(r.cod_local_origem!, perna, 'origem'),
      destino: nomeLocal(r.cod_local_destino!, perna, 'destino'),
      transportadora: transportadoras.get(digitos(r.cnpj_transportadora!)) ?? r.cnpj_transportadora!,
      km: numero(r.distancia_km),
      frete_orcado: freteOrcado.get(r.rota_id!)!,
    };
  });
  const rotaPorId = new Map(rotas.map((r) => [r.rota_id, r]));

  // ---------- frete pago por operação (CT-e não cancelados, normal + complementar) ----------
  const freteDaOperacao = new Map<string, number>();
  for (const c of ler('bronze_fin_ctes')) {
    if (c.situacao === 'CANCELADO') continue;
    freteDaOperacao.set(c.ref_id!, (freteDaOperacao.get(c.ref_id!) ?? 0) + numero(c.valor_prestacao)!);
  }
  const frete = (ids: string[]) => arred(ids.reduce((s, id) => s + (freteDaOperacao.get(id) ?? 0), 0), 2);

  const operacao: OperacaoMes[] = [];

  // ---------- coleta ----------
  const coletas = new Map<string, Linha>();
  for (const c of ler('bronze_tms_coletas')) coletas.set(c.coleta_id!, c); // última ingestão vence
  const tentativasColeta = agrupar(ler('bronze_tms_coleta_tentativas'), (t) => t.coleta_id!);
  const entradaNoCd = new Map(ler('bronze_wms_recebimentos').map((r) => [r.origem_id!, r.entrada_em!]));

  for (const [k, xs] of agrupar([...coletas.values()], (c) => `${c.rota_id}|${c.janela_inicio!.slice(0, 7)}`)) {
    const [rota_id, mes] = k.split('|');
    const primeiraChegada = (c: Linha) =>
      [...(tentativasColeta.get(c.coleta_id!) ?? [])].sort((a, b) => Number(a.tentativa) - Number(b.tentativa))[0];
    operacao.push({
      mes,
      rota_id,
      perna: 'coleta',
      unidades: xs.length,
      // Na janela = o veículo chegou (1ª tentativa) até o fim da janela agendada.
      no_prazo: xs.filter((c) => {
        const t = primeiraChegada(c);
        return t && instante(t.chegada_veiculo!) <= instante(c.janela_fim!);
      }).length,
      primeira_tentativa: xs.filter((c) =>
        (tentativasColeta.get(c.coleta_id!) ?? []).every((t) => t.resultado === 'COLETADA'),
      ).length,
      frete_total: frete(xs.map((c) => c.coleta_id!)),
      horas_ate_cd: arredOuNull(
        media(
          xs.filter((c) => entradaNoCd.has(c.coleta_id!)).map((c) => horasEntre(c.coletado_em!, entradaNoCd.get(c.coleta_id!)!)),
        ),
        1,
      ),
      ocupacao: null,
      horas_crossdock: null,
    });
  }

  // ---------- transferência ----------
  const crossdock = new Map<string, Record<string, string>>();
  for (const m of ler('bronze_wms_movimentos_crossdock')) {
    crossdock.set(m.viagem_id!, { ...(crossdock.get(m.viagem_id!) ?? {}), [m.evento!]: m.evento_em! });
  }
  for (const [k, xs] of agrupar(ler('bronze_tms_viagens'), (v) => `${v.rota_id}|${v.saida_cd!.slice(0, 7)}`)) {
    const [rota_id, mes] = k.split('|');
    operacao.push({
      mes,
      rota_id,
      perna: 'transferencia',
      unidades: xs.length,
      no_prazo: xs.filter((v) => instante(v.chegada_hub!) <= instante(v.previsao_chegada_hub!)).length,
      primeira_tentativa: null,
      frete_total: frete(xs.map((v) => v.viagem_id!)),
      horas_ate_cd: null,
      ocupacao: arredOuNull(
        media(xs.filter((v) => capacidadeM3.has(v.placa!)).map((v) => numero(v.carga_m3)! / capacidadeM3.get(v.placa!)!)),
        3,
      ),
      horas_crossdock: arredOuNull(
        media(
          xs
            .map((v) => crossdock.get(v.viagem_id!))
            .filter((x): x is Record<string, string> => Boolean(x?.ENTRADA && x?.SAIDA))
            .map((x) => horasEntre(x.ENTRADA, x.SAIDA)),
        ),
        1,
      ),
    });
  }

  // ---------- entrega ----------
  const tentativasEntrega = agrupar(ler('bronze_tms_entrega_tentativas'), (t) => t.entrega_id!);
  for (const [k, xs] of agrupar(ler('bronze_tms_entregas'), (e) => `${e.rota_id}|${e.saiu_para_entrega_em!.slice(0, 7)}`)) {
    const [rota_id, mes] = k.split('|');
    operacao.push({
      mes,
      rota_id,
      perna: 'entrega',
      unidades: xs.length,
      no_prazo: xs.filter((e) => e.entregue_em && dataLocal(e.entregue_em) <= dataSimples(e.data_prometida!)).length,
      primeira_tentativa: xs.filter((e) =>
        (tentativasEntrega.get(e.entrega_id!) ?? []).some((t) => t.tentativa === '1' && t.resultado === 'ENTREGUE'),
      ).length,
      frete_total: frete(xs.map((e) => e.entrega_id!)),
      horas_ate_cd: null,
      ocupacao: null,
      horas_crossdock: null,
    });
  }
  operacao.sort((a, b) => a.rota_id.localeCompare(b.rota_id) || a.mes.localeCompare(b.mes));

  // ---------- ocorrências (SAC + FIN) ----------
  const tipos = new Map<string, Linha>();
  for (const t of ler('bronze_sac_tipos_ocorrencia')) {
    tipos.set(t.codigo!, t);
    tipos.set(t.codigo_legado!, t); // de-para do código antigo
  }
  const custo = new Map<string, number>();
  for (const l of ler('bronze_fin_lancamentos_ocorrencia')) {
    if (l.situacao === 'CANCELADO') continue;
    custo.set(l.protocolo_sac!, (custo.get(l.protocolo_sac!) ?? 0) + numero(l.valor)!);
  }
  const eventosUnicos = new Map<string, Linha>();
  for (const e of ler('bronze_sac_ocorrencia_eventos')) eventosUnicos.set(e.evento_id!, e);
  const eventos = agrupar([...eventosUnicos.values()], (e) => e.protocolo!);

  const rotaDaOperacao = new Map<string, string>();
  for (const c of coletas.values()) rotaDaOperacao.set(c.coleta_id!, c.rota_id!);
  for (const v of ler('bronze_tms_viagens')) rotaDaOperacao.set(v.viagem_id!, v.rota_id!);
  for (const e of ler('bronze_tms_entregas')) rotaDaOperacao.set(e.entrega_id!, e.rota_id!);

  const [meta] = await sql<{ valor: string }>(`SELECT valor FROM bronze_meta WHERE chave = 'posicao'`).catch(() => []);
  const posicao = meta?.valor ?? '2026-11-24';

  const ocorrencias: (Ocorrencia & { protocolo: string; canal: string })[] = ler('bronze_sac_ocorrencias').map((s, i) => {
    const tipo = tipos.get(codigo(s.codigo_tipo!));
    if (!tipo) throw new Error(`Código de ocorrência desconhecido: "${s.codigo_tipo}" (${s.protocolo})`);
    const rota_id = rotaDaOperacao.get(s.ref_id!);
    if (!rota_id) throw new Error(`Operação sem rota: ${s.ref_id} (${s.protocolo})`);
    const evs = [...(eventos.get(s.protocolo!) ?? [])].sort((a, b) => instante(a.evento_em!) - instante(b.evento_em!));
    const ultimo = evs.at(-1);
    const resolvida = ultimo?.status_novo === 'RESOLVIDA';
    const data = dataLocal(s.aberta_em!);
    const resolucao = [...evs].reverse().find((e) => e.status_novo === 'RESOLVIDA');
    const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
    return {
      id: `OC-${String(i + 1).padStart(5, '0')}`,
      data,
      mes: data.slice(0, 7),
      perna: PERNA[tipo.tipo_perna!],
      rota_id,
      transportadora: rotaPorId.get(rota_id)!.transportadora,
      tipo: tipo.descricao!,
      produto: categoriaDoSku.get(s.sku_afetado!) ?? 'Outros',
      custo: arred(custo.get(s.protocolo!) ?? 0, 2),
      acao: [...evs].reverse().find((e) => e.acao)?.acao ?? '',
      status: resolvida ? 'Resolvida' : 'Aberta',
      dias_resolucao: resolucao ? diasEntre(data, dataLocal(resolucao.evento_em!)) : null,
      dias_em_aberto: resolvida ? null : diasEntre(data, posicao),
      // Rastreabilidade: de volta ao protocolo e ao canal de origem (o front ignora).
      protocolo: s.protocolo!,
      canal: s.canal!,
    };
  });

  // ---------- premissas e referência ----------
  const premissas: Premissa[] = ler('bronze_cfg_premissas').map((p) => ({
    perna: p.perna!,
    tipo: p.tipo as Premissa['tipo'],
    chave: p.chave!,
    premissa: p.premissa!,
    descricao: p.descricao ?? undefined,
    peso: numero(p.peso) ?? undefined,
    nota_zero: numero(p.nota_zero) ?? undefined,
    nota_cem: numero(p.nota_cem) ?? undefined,
    formato: p.formato ?? undefined,
    valor: numero(p.valor) ?? undefined,
  }));
  const mesAnterior = new Date(Date.parse(`${posicao.slice(0, 7)}-15`) - 30 * 86_400_000).toISOString().slice(0, 7);

  await gravar('gold_rotas', rotas);
  await gravar('gold_operacao_mes', operacao);
  await gravar('gold_ocorrencias', ocorrencias);
  await gravar('gold_premissas', premissas, ['descricao', 'peso', 'nota_zero', 'nota_cem', 'formato', 'valor']);
  await gravar('gold_referencia', [{ data: posicao, mes: posicao.slice(0, 7), mes_anterior: mesAnterior }]);
}

function arredOuNull(n: number | null, casas: number) {
  return n === null ? null : arred(n, casas);
}
