// ===== Saúde das rotas: cálculos, por perna (coleta, transferência e entrega) =====
dash.calc('rota_mes', {
  title: 'Score de cada rota por mês',
  description: 'Por rota e mês: os indicadores das premissas da perna da rota, a nota de 0 a 100 de cada um pela régua das premissas, o score ponderado pelos pesos, a situação, o prejuízo com ocorrências e a economia possível: ocorrências acima da meta vezes o custo médio de uma ocorrência na rota, mais o frete pago acima do orçado e, na transferência, o frete do espaço vazio abaixo da ocupação meta.',
  inputs: ['rotas', 'operacao_mes', 'ocorrencias', 'premissas'],
  fn: (rotas, operacao_mes, ocorrencias, premissas) => {
    const par = (k, d) => { const p = premissas.find((x) => x.chave === k); return p ? Number(p.valor) : d; };
    const fOk = par('faixa_saudavel', 85), fAt = par('faixa_atencao', 65);
    const nota = (v, zero, cem) => (v == null || !isFinite(v) ? null : Math.max(0, Math.min(1, (v - zero) / (cem - zero))) * 100);
    const porRotaMes = {};
    for (const o of ocorrencias) { const k = o.mes + '|' + o.rota_id; (porRotaMes[k] = porRotaMes[k] || []).push(o); }
    return operacao_mes.map((e) => {
      const r = rotas.find((x) => x.rota_id === e.rota_id) || {};
      const pil = premissas.filter((p) => p.tipo === 'pilar' && p.perna === r.perna);
      const meta = (k) => { const p = pil.find((x) => x.chave === k); return p ? Number(p.nota_cem) : null; };
      const os = porRotaMes[e.mes + '|' + e.rota_id] || [];
      const resolvidas = os.filter((o) => o.dias_resolucao != null);
      const n = Number(e.unidades) || 0;
      const prejuizo = os.reduce((a, o) => a + Number(o.custo), 0);
      const v = {
        pct_prazo: n ? e.no_prazo / n : null,
        pct_primeira: n && e.primeira_tentativa != null ? e.primeira_tentativa / n : null,
        ocorr_100: n ? (os.length / n) * 100 : null,
        custo_vs_orcado: n && r.frete_orcado ? e.frete_total / n / r.frete_orcado : null,
        resolucao_dias: resolvidas.length ? resolvidas.reduce((a, o) => a + o.dias_resolucao, 0) / resolvidas.length : os.length ? null : 0,
        horas_ate_cd: e.horas_ate_cd == null ? null : Number(e.horas_ate_cd),
        ocupacao: e.ocupacao == null ? null : Number(e.ocupacao),
        horas_crossdock: e.horas_crossdock == null ? null : Number(e.horas_crossdock),
      };
      const out = Object.assign({
        mes: e.mes, perna: r.perna, regiao: r.regiao, uf: r.uf, cidade: r.cidade, zona: r.zona, rota_id: e.rota_id, rota: r.rota, origem: r.origem, destino: r.destino, transportadora: r.transportadora, km: r.km,
        unidades: n, ocorrencias: os.length, abertas: os.filter((o) => o.status === 'Aberta').length,
        frete_unidade: n ? e.frete_total / n : null, frete_orcado: r.frete_orcado, prejuizo,
      }, v);
      let soma = 0, pesos = 0;
      for (const p of pil) {
        const nt = nota(v[p.chave], Number(p.nota_zero), Number(p.nota_cem));
        out['nota_' + p.chave] = nt;
        if (nt != null) { soma += nt * p.peso; pesos += p.peso; }
      }
      out.score = pesos ? soma / pesos : null;
      out.situacao = out.score == null ? null : out.score >= fOk ? 'Saudável' : out.score >= fAt ? 'Atenção' : 'Crítica';
      const custoMedio = os.length ? prejuizo / os.length : 0;
      const metaOc = meta('ocorr_100');
      const ocorrAcima = metaOc == null ? 0 : Math.max(0, os.length - (metaOc / 100) * n);
      const freteAcima = Math.max(0, e.frete_total - (r.frete_orcado || 0) * n);
      const metaOcup = meta('ocupacao');
      const vazio = metaOcup && v.ocupacao != null ? Math.max(0, (metaOcup - v.ocupacao) / metaOcup) * Math.min(e.frete_total, (r.frete_orcado || 0) * n) : 0;
      out.economia_vazio = vazio;
      out.economia = ocorrAcima * custoMedio + freteAcima + vazio;
      return out;
    });
  },
});

dash.calc('saude_rotas', {
  title: 'Saúde das rotas no mês',
  description: 'As rotas no mês da posição, por perna e do pior score para o melhor, com o score do mês anterior, a premissa que mais tira pontos (peso vezes o que falta para a nota 100), o tipo de ocorrência que mais custou (e o produto mais afetado) e a ação sugerida a partir do guia de boas práticas: a prática ligada à premissa que mais tira pontos e, quando ela é ocorrência, ao tipo que mais custou.',
  inputs: ['rota_mes', 'ocorrencias', 'referencia', 'premissas', 'praticas'],
  fn: (rota_mes, ocorrencias, referencia, premissas, praticas) => {
    const ref = referencia[0];
    const ordem = { coleta: 1, transferencia: 2, entrega: 3 };
    const pct = (v) => Math.round(v * 100) + '%';
    const n1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
    // A ação sai do guia de boas práticas: a prática ligada à premissa que mais tira pontos ou, quando ela é ocorrência, ao tipo que mais custou.
    const acaoDe = (r, foco, top, prodTop, os) => {
      const conta = (tipos) => os.filter((o) => tipos.includes(o.tipo)).length;
      const gatilho = foco === 'ocorr_100' && top ? top.tipo : foco;
      const daPerna = praticas.filter((p) => p.perna === r.perna);
      const p = daPerna.find((x) => String(x.gatilho).split('|').includes(gatilho)) || (top ? daPerna.find((x) => String(x.gatilho).split('|').includes(top.tipo)) : null);
      if (!p) return { texto: 'Acompanhar a premissa que mais tira pontos da rota.', pratica: null };
      const v = {
        transportadora: r.transportadora, pct_fora: pct(1 - (r.pct_prazo || 0)), pct_acima: pct((r.custo_vs_orcado || 1) - 1),
        horas: n1(r.perna === 'transferencia' ? r.horas_crossdock || 0 : r.horas_ate_cd || 0), ocupacao: pct(r.ocupacao || 0),
        vazio: 'R$ ' + Math.round(r.economia_vazio || 0).toLocaleString('pt-BR'), dias: n1(r.resolucao_dias || 0),
        n_tipo: top ? top.n : 0, tipo: top ? top.tipo.toLowerCase() : '', produto: String(prodTop || '').toLowerCase(),
        n_frustradas: Math.max(conta(['Coleta frustrada']), Math.round(r.unidades * (1 - (r.pct_primeira == null ? 1 : r.pct_primeira)))),
        n_divergencia: conta(['Divergência de volumes', 'Nota fiscal com erro']),
        n_reentregas: Math.max(conta(['Destinatário ausente', 'Recusa', 'Compra cancelada em rota']), Math.round(r.unidades * (1 - (r.pct_primeira == null ? 1 : r.pct_primeira)))),
      };
      return { texto: String(p.acao).replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? m : String(v[k]))), pratica: p };
    };
    return rota_mes
      .filter((r) => r.mes === ref.mes)
      .map((r) => {
        const pil = premissas.filter((p) => p.tipo === 'pilar' && p.perna === r.perna);
        const ant = rota_mes.find((x) => x.mes === ref.mes_anterior && x.rota_id === r.rota_id);
        const os = ocorrencias.filter((o) => o.mes === ref.mes && o.rota_id === r.rota_id);
        const tipos = {};
        for (const o of os) {
          const t = tipos[o.tipo] || (tipos[o.tipo] = { tipo: o.tipo, n: 0, custo: 0, prod: {} });
          t.n += 1; t.custo += Number(o.custo); t.prod[o.produto] = (t.prod[o.produto] || 0) + Number(o.custo);
        }
        const top = Object.values(tipos).sort((a, b) => b.custo - a.custo)[0] || null;
        const prodTop = top ? Object.keys(top.prod).sort((a, b) => top.prod[b] - top.prod[a])[0] : null;
        // Premissa que mais tira pontos do score: peso x (100 - nota).
        const fraca = pil.map((p) => ({ p, perda: r['nota_' + p.chave] == null ? null : p.peso * (100 - r['nota_' + p.chave]) })).filter((x) => x.perda != null).sort((a, b) => b.perda - a.perda)[0];
        const foco = fraca ? fraca.p.chave : null;
        const sug = r.situacao === 'Saudável' ? { texto: 'Nenhuma ação necessária: a rota está dentro das premissas.', pratica: null } : acaoDe(r, foco, top, prodTop, os);
        const acao = sug.texto;
        return Object.assign({}, r, {
          score_ant: ant ? ant.score : null,
          delta_score: ant && ant.score != null && r.score != null ? r.score - ant.score : null,
          foco: fraca ? fraca.p.premissa : null,
          tipo_top: top ? top.tipo : null,
          tipo_top_custo: top ? top.custo : null,
          produto_top: prodTop,
          acao,
          pratica_id: sug.pratica ? sug.pratica.id : null,
          pratica: sug.pratica ? sug.pratica.titulo : null,
        });
      })
      .sort((a, b) => (ordem[a.perna] || 9) - (ordem[b.perna] || 9) || a.score - b.score);
  },
});

dash.calc('rede_mes', {
  title: 'Cada perna por mês',
  description: 'Por perna e mês: unidades (coletas, viagens ou entregas), score médio e indicadores das premissas ponderados pelas unidades de cada rota, ocorrências, prejuízo, economia possível e quantas rotas em cada situação. O mês da posição é parcial. Segue os filtros de cada perna: na coleta e na entrega, o estado escolhido (e a zona clicada no mapa da cidade); na transferência, a região clicada no mapa do Brasil.',
  inputs: ['rota_mes', 'referencia', 'premissas'],
  fn: (rota_mes, referencia, premissas) => {
    const chaves = Array.from(new Set(premissas.filter((p) => p.tipo === 'pilar').map((p) => p.chave)));
    const grupos = {};
    const P = dash.params();
    const passa = (r) => (r.perna === 'transferencia' ? !P.regiao || r.regiao === P.regiao : r.uf === (P['uf_' + r.perna] || 'SP') && (!P['zona_' + r.perna] || r.zona === P['zona_' + r.perna]));
    for (const r of rota_mes) if (passa(r)) (grupos[r.perna + '|' + r.mes] = grupos[r.perna + '|' + r.mes] || []).push(r);
    return Object.keys(grupos).sort().map((k) => {
      const rs = grupos[k];
      const n = rs.reduce((a, r) => a + r.unidades, 0);
      const pond = (c) => { const v = rs.filter((r) => r[c] != null); const nn = v.reduce((a, r) => a + r.unidades, 0); return nn ? v.reduce((a, r) => a + r[c] * r.unidades, 0) / nn : null; };
      const out = { perna: rs[0].perna, mes: rs[0].mes, parcial: rs[0].mes === referencia[0].mes ? 1 : 0, unidades: n, score: pond('score') };
      for (const c of chaves) out[c] = pond(c);
      return Object.assign(out, {
        ocorrencias: rs.reduce((a, r) => a + r.ocorrencias, 0), abertas: rs.reduce((a, r) => a + r.abertas, 0),
        prejuizo: rs.reduce((a, r) => a + r.prejuizo, 0), economia: rs.reduce((a, r) => a + r.economia, 0),
        criticas: rs.filter((r) => r.situacao === 'Crítica').length, atencao: rs.filter((r) => r.situacao === 'Atenção').length, saudaveis: rs.filter((r) => r.situacao === 'Saudável').length,
      });
    });
  },
});

dash.calc('kpis', {
  title: 'Indicadores do mês por perna, nos filtros escolhidos',
  description: 'Uma linha por perna, no mês da posição contra o mês anterior, seguindo os filtros da perna (coleta e entrega: estado e zona; transferência: região): score médio, indicadores das premissas e a variação de cada um, ocorrências (e quantas em aberto), prejuízo, economia possível, rotas por situação e a parte do prejuízo nas rotas críticas.',
  inputs: ['rede_mes', 'rota_mes', 'referencia', 'premissas'],
  fn: (rede_mes, rota_mes, referencia, premissas) => {
    const ref = referencia[0];
    const P = dash.params();
    const passa = (r) => (r.perna === 'transferencia' ? !P.regiao || r.regiao === P.regiao : r.uf === (P['uf_' + r.perna] || 'SP') && (!P['zona_' + r.perna] || r.zona === P['zona_' + r.perna]));
    const nomes = { coleta: 'Coleta', transferencia: 'Transferência', entrega: 'Entrega' };
    const chaves = Array.from(new Set(premissas.filter((p) => p.tipo === 'pilar').map((p) => p.chave)));
    return ['coleta', 'transferencia', 'entrega'].map((perna) => {
      const a = rede_mes.find((x) => x.perna === perna && x.mes === ref.mes) || {};
      const b = rede_mes.find((x) => x.perna === perna && x.mes === ref.mes_anterior) || {};
      const crit = rota_mes.filter((r) => r.perna === perna && r.mes === ref.mes && r.situacao === 'Crítica' && passa(r));
      const out = { perna, nome: nomes[perna], mes: ref.mes, unidades: a.unidades, score: a.score, delta_score: a.score != null && b.score != null ? a.score - b.score : null };
      for (const c of chaves) { out[c] = a[c]; out['delta_' + c] = a[c] != null && b[c] != null ? a[c] - b[c] : null; }
      return Object.assign(out, {
        ocorrencias: a.ocorrencias, abertas: a.abertas, prejuizo: a.prejuizo, economia: a.economia,
        n_rotas: (a.criticas || 0) + (a.atencao || 0) + (a.saudaveis || 0), n_criticas: a.criticas, n_atencao: a.atencao, n_saudaveis: a.saudaveis,
        share_prej_criticas: a.prejuizo ? crit.reduce((s, r) => s + r.prejuizo, 0) / a.prejuizo : null,
      });
    });
  },
});

dash.calc('kpis_total', {
  title: 'Total de cada perna no mês',
  description: 'Sem filtros: uma linha por perna no mês da posição, com score médio ponderado pelas unidades de cada rota, rotas, rotas críticas e prejuízo com ocorrências. A linha "geral" soma as três pernas e aponta a de menor score.',
  inputs: ['rota_mes', 'referencia'],
  fn: (rota_mes, referencia) => {
    const ref = referencia[0];
    const nomes = { coleta: 'Coleta', transferencia: 'Transferência', entrega: 'Entrega' };
    const linhas = ['coleta', 'transferencia', 'entrega'].map((perna) => {
      const rs = rota_mes.filter((r) => r.perna === perna && r.mes === ref.mes);
      const n = rs.reduce((a, r) => a + r.unidades, 0);
      return {
        perna, nome: nomes[perna], unidades: n, score: n ? rs.reduce((a, r) => a + (r.score || 0) * r.unidades, 0) / n : null,
        n_rotas: rs.length, n_criticas: rs.filter((r) => r.situacao === 'Crítica').length, prejuizo: rs.reduce((a, r) => a + r.prejuizo, 0),
      };
    });
    const pior = linhas.filter((l) => l.score != null).sort((a, b) => a.score - b.score)[0] || {};
    linhas.push({
      perna: 'geral', nome: 'Operação', n_rotas: linhas.reduce((s, l) => s + l.n_rotas, 0), n_criticas: linhas.reduce((s, l) => s + l.n_criticas, 0),
      prejuizo: linhas.reduce((s, l) => s + l.prejuizo, 0), pior_nome: pior.nome, pior_score: pior.score,
    });
    return linhas;
  },
});

dash.calc('padroes', {
  title: 'Onde se concentra o prejuízo',
  description: 'Ocorrências do mês da posição, em cada perna, somadas por tipo, produto, transportadora e rota (e por tipo dentro de cada rota), com custo, parte do prejuízo da perna, dias para resolver e quantas estão em aberto. A linha "combo" é a combinação que mais custou na perna: tipo e rota na coleta e na transferência; tipo, produto e rota na entrega. Segue os filtros de cada perna (coleta e entrega: estado e zona; transferência: região).',
  inputs: ['ocorrencias', 'rotas', 'referencia'],
  fn: (ocorrencias, rotas, referencia) => {
    const ref = referencia[0];
    const nome = (id) => (rotas.find((r) => r.rota_id === id) || {}).rota || id;
    const P = dash.params();
    const passa = (r) => (r.perna === 'transferencia' ? !P.regiao || r.regiao === P.regiao : r.uf === (P['uf_' + r.perna] || 'SP') && (!P['zona_' + r.perna] || r.zona === P['zona_' + r.perna]));
    const rotaDe = (id) => rotas.find((r) => r.rota_id === id) || {};
    const saida = [];
    for (const perna of ['coleta', 'transferencia', 'entrega']) {
      const os = ocorrencias.filter((o) => o.mes === ref.mes && o.perna === perna && passa(rotaDe(o.rota_id)));
      const tot = os.reduce((a, o) => a + Number(o.custo), 0);
      const agrupa = (dim, chave, extra) => {
        const m = {};
        for (const o of os) {
          const k = chave(o);
          const g = m[k] || (m[k] = Object.assign({ perna, dim, valor: k, ocorrencias: 0, custo: 0, ds: 0, dn: 0, abertas: 0 }, extra ? extra(o) : {}));
          g.ocorrencias += 1; g.custo += Number(o.custo);
          if (o.dias_resolucao != null) { g.ds += o.dias_resolucao; g.dn += 1; }
          if (o.status === 'Aberta') g.abertas += 1;
        }
        return Object.values(m).map((g) => {
          const r = Object.assign({}, g, { share_custo: tot ? g.custo / tot : 0, dias_resolucao: g.dn ? g.ds / g.dn : null });
          delete r.ds; delete r.dn;
          return r;
        }).sort((a, b) => b.custo - a.custo);
      };
      const combo = agrupa('combo', (o) => o.tipo.toLowerCase() + (perna === 'entrega' ? ' de ' + o.produto.toLowerCase() : '') + ' na rota ' + nome(o.rota_id));
      saida.push(...agrupa('tipo', (o) => o.tipo), ...agrupa('produto', (o) => o.produto), ...agrupa('transportadora', (o) => o.transportadora),
        ...agrupa('rota_tipo', (o) => o.rota_id + ' · ' + o.tipo, (o) => ({ rota_id: o.rota_id, tipo: o.tipo })), ...combo.slice(0, 1));
    }
    return saida;
  },
});

dash.calc('regioes', {
  title: 'Score por região em cada perna',
  description: 'No mês da posição, em cada perna, as rotas agrupadas por região (coleta: região dos fornecedores; transferência: região do hub de destino; entrega: região dos clientes): quantas rotas, unidades, score médio ponderado pelas unidades, situação, rotas críticas e prejuízo com ocorrências. Região sem rota na perna fica sem score.',
  inputs: ['rota_mes', 'referencia', 'premissas'],
  fn: (rota_mes, referencia, premissas) => {
    const ref = referencia[0];
    const par = (k, d) => { const p = premissas.find((x) => x.chave === k); return p ? Number(p.valor) : d; };
    const fOk = par('faixa_saudavel', 85), fAt = par('faixa_atencao', 65);
    const nomes = { N: 'Norte', NE: 'Nordeste', CO: 'Centro-Oeste', SE: 'Sudeste', S: 'Sul' };
    const saida = [];
    for (const perna of ['coleta', 'transferencia', 'entrega']) {
      for (const reg of Object.keys(nomes)) {
        const rs = rota_mes.filter((r) => r.perna === perna && r.mes === ref.mes && r.regiao === reg);
        const n = rs.reduce((a, r) => a + r.unidades, 0);
        const score = n ? rs.reduce((a, r) => a + r.score * r.unidades, 0) / n : null;
        saida.push({
          perna, regiao: reg, nome: nomes[reg], n_rotas: rs.length, unidades: n, score,
          situacao: score == null ? null : score >= fOk ? 'Saudável' : score >= fAt ? 'Atenção' : 'Crítica',
          n_criticas: rs.filter((r) => r.situacao === 'Crítica').length,
          prejuizo: rs.reduce((a, r) => a + r.prejuizo, 0),
        });
      }
    }
    return saida;
  },
});

dash.calc('zonas', {
  title: 'Score por zona da cidade',
  description: 'No mês da posição, na coleta e na entrega, cada zona de cada cidade (uma rota por zona): score, situação, unidades e prejuízo com ocorrências. As zonas são uma divisão aproximada da cidade em cinco partes.',
  inputs: ['rota_mes', 'referencia'],
  fn: (rota_mes, referencia) => {
    const ref = referencia[0];
    return rota_mes.filter((r) => r.mes === ref.mes && r.perna !== 'transferencia').map((r) => ({
      perna: r.perna, uf: r.uf, cidade: r.cidade, zona: r.zona, regiao: r.regiao, rota_id: r.rota_id, score: r.score, situacao: r.situacao,
      unidades: r.unidades, ocorrencias: r.ocorrencias, prejuizo: r.prejuizo,
    }));
  },
});

