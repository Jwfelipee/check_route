// ===== Saúde das rotas: desenhos, por perna =====
(function () {
  const nf = new Intl.NumberFormat('pt-BR');
  const n1f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brlk = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const UNID = { coleta: ['coleta', 'coletas'], transferencia: ['viagem', 'viagens'], entrega: ['entrega', 'entregas'] };
  const PRAZO = { coleta: 'na janela', transferencia: 'chegada no prazo', entrega: 'no prazo' };
  const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const F = {
    int: (v) => nf.format(Math.round(v)),
    pct: (v) => Math.round(v * 100) + '%',
    pct1: (v) => n1f.format(v * 100) + '%',
    n1: (v) => n1f.format(v),
    horas: (v) => n1f.format(v) + ' h',
    dias: (v) => n1f.format(v) + ' dias',
    brl: (v) => brl0.format(v),
    brl2: (v) => brl2.format(v),
    brlk: (v) => brlk.format(v),
    sint: (v) => { const r = Math.round(v); return sinal(r) + nf.format(Math.abs(r)); },
    spp: (v) => { const p = Math.round(v * 1000) / 10; return sinal(p) + n1f.format(Math.abs(p)) + ' p.p.'; },
    data: (v) => v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4),
    txt: (v) => String(v),
  };
  const mk = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const txt = (x) => document.createTextNode(x);
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' ? d.data : null; };
  const falhou = (id) => ['error', 'missing'].includes(dash.data(id).status);
  const carregando = (ids) => ids.some((id) => dash.data(id).status === 'loading');
  const skel = (el, on) => el.classList.toggle('dash-skeleton', !!on);
  const pick = (rs, el) => {
    if (!rs) return null;
    if (el.dataset.row != null) return rs[Number(el.dataset.row)];
    if (el.dataset.where) {
      const pares = el.dataset.where.split('&').map((p) => p.split('=').map(decodeURIComponent));
      return rs.find((r) => pares.every(([k, v]) => String(r[k]) === v));
    }
    return rs[0];
  };
  const faixas = () => {
    const P = rows('premissas') || [];
    const g = (k, d) => { const p = P.find((x) => x.chave === k); return p ? Number(p.valor) : d; };
    return { ok: g('faixa_saudavel', 85), at: g('faixa_atencao', 65) };
  };
  const tomScore = (s) => { if (s == null) return ''; const f = faixas(); return s >= f.ok ? 'ok' : s >= f.at ? 'warn' : 'bad'; };
  const corTom = (c) => (c === 'ok' ? 'var(--color-ok)' : c === 'warn' ? 'var(--color-warn)' : 'var(--color-bad)');
  const TOM_SIT = { 'Saudável': 'ok', 'Atenção': 'warn', 'Crítica': 'bad' };
  const marca = (el, source, field, rotaId) => { el.dataset.source = source; el.dataset.field = field; if (rotaId) el.dataset.where = 'rota_id=' + rotaId; return el; };
  const tom = (el, t) => { if (t) el.dataset.c = t; else delete el.dataset.c; return el; };
  const pilares = (P, perna) => P.filter((p) => p.tipo === 'pilar' && p.perna === perna);
  // Filtros: coleta e entrega por estado e zona; transferência por região do Brasil.
  const passa = (r) => { const P = dash.params(); return r.perna === 'transferencia' ? !P.regiao || r.regiao === P.regiao : r.uf === (P['uf_' + r.perna] || 'SP') && (!P['zona_' + r.perna] || r.zona === P['zona_' + r.perna]); };
  const valorPilar = (p, v) => {
    if (v == null) return '—';
    if (p.chave === 'ocorr_100') return n1f.format(v) + '/100';
    if (p.chave === 'custo_vs_orcado') return Math.round(v * 100) + '% do orç.';
    if (p.formato === 'horas') return n1f.format(v) + ' h';
    if (p.formato === 'dias') return n1f.format(v) + ' dias';
    return n1f.format(v * 100) + '%';
  };
  const reguaPilar = (p, v) => (p.formato === 'pct' ? Math.round(v * 100) + '%' : p.formato === 'horas' ? nf.format(v) + ' h' : p.formato === 'dias' ? nf.format(v) + ' dias' : n1f.format(v));

  // ---------- números e textos soltos ----------
  dash.draw('num', (el) => {
    const d = dash.data(el.dataset.source);
    if (d.status === 'loading') { el.textContent = '—'; return; }
    skel(el, false);
    const r = d.status === 'ok' ? pick(d.data, el) : null;
    const v = r ? r[el.dataset.field] : null;
    el.textContent = v == null ? '—' : (F[el.dataset.fmt] || F.int)(v);
    const t = el.dataset.tone;
    let c = '';
    if (v != null && t === 'score') c = tomScore(v);
    else if (v != null && t === 'up') c = v > 1e-6 ? 'ok' : v < -1e-6 ? 'bad' : '';
    else if (v != null && t === 'down') c = v < -1e-6 ? 'ok' : v > 1e-6 ? 'bad' : '';
    else if (v != null && t === 'good') c = 'ok';
    else if (v != null && t === 'sit') c = TOM_SIT[v] || '';
    tom(el, c);
  });
  dash.draw('mesnome', (el) => {
    const R = rows('referencia');
    if (!R) { el.textContent = '—'; return; }
    const r = R[0];
    el.textContent = MESES[Number(r.mes.slice(5, 7)) - 1] + ' (até ' + r.data.slice(8, 10) + '/' + r.data.slice(5, 7) + ')';
  });

  // ---------- meio contagiro do score ----------
  function meiaLua(score, rotulo) {
    const w = 220, h = 118, cx = 110, cy = 98, R = 88, r = 66;
    const A = d3.scaleLinear().domain([0, 100]).range([-Math.PI / 2, Math.PI / 2]).clamp(true);
    const arc = d3.arc().innerRadius(r).outerRadius(R).cornerRadius(5);
    const f = faixas();
    const svg = d3.create('svg').attr('viewBox', '0 0 ' + w + ' ' + h).attr('role', 'img').attr('aria-label', rotulo);
    const g = svg.append('g').attr('transform', 'translate(' + cx + ',' + cy + ')');
    g.append('path').attr('d', arc({ startAngle: -Math.PI / 2, endAngle: Math.PI / 2 })).style('fill', 'color-mix(in srgb, var(--color-fg) 9%, transparent)');
    g.append('path').attr('d', d3.arc().innerRadius(R + 2).outerRadius(R + 6)({ startAngle: A(f.ok), endAngle: A(100) })).style('fill', 'var(--color-ok)').style('opacity', 0.5);
    if (score != null && score > 0) g.append('path').attr('d', arc({ startAngle: -Math.PI / 2, endAngle: A(score) })).style('fill', corTom(tomScore(score)));
    const a = A(f.ok), sx = Math.sin(a), sy = -Math.cos(a);
    g.append('line').attr('x1', sx * (r - 6)).attr('y1', sy * (r - 6)).attr('x2', sx * (R + 6)).attr('y2', sy * (R + 6)).attr('stroke-width', 2.5).style('stroke', 'var(--color-fg)');
    g.append('text').attr('class', 'sr-tick').attr('x', -(R + r) / 2).attr('y', 16).attr('text-anchor', 'middle').text('0');
    g.append('text').attr('class', 'sr-tick').attr('x', (R + r) / 2).attr('y', 16).attr('text-anchor', 'middle').text('100');
    if (score != null) {
      g.append('path').attr('d', 'M -3.5 0 L 0 -' + (r + 6) + ' L 3.5 0 Z').attr('transform', 'rotate(' + (A(score) * 180) / Math.PI + ')').style('fill', 'var(--color-fg)');
      g.append('circle').attr('r', 8).style('fill', 'var(--color-fg)');
      g.append('circle').attr('r', 3).style('fill', 'var(--color-bg)');
    }
    return svg.node();
  }
  dash.draw('gperna', (el) => {
    const K = rows('kpis_total');
    if (!K) { if (falhou('kpis_total')) el.replaceChildren(); return; }
    skel(el, false);
    const k = K.find((x) => x.perna === el.dataset.perna);
    el.replaceChildren(k ? meiaLua(k.score, 'Score médio da perna ' + k.nome + ': ' + Math.round(k.score) + ' de 100') : mk('span'));
  });

  // ---------- mini gráfico do score da rota ----------
  function miniScore(box, serie) {
    box.replaceChildren();
    const W = box.clientWidth;
    if (!W || !serie.length) return;
    const H = 150, m = { t: 18, r: 10, b: 22, l: 28 };
    const f = faixas();
    const x = d3.scalePoint().domain(serie.map((s) => s.mes)).range([m.l + 8, W - m.r - 8]);
    const y = d3.scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('height', H).attr('role', 'img').attr('aria-label', 'Score da rota nos últimos meses');
    for (const t of [0, 50, 100]) {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(t)).attr('y2', y(t)).style('stroke', 'var(--cds-chart-grid, var(--color-border-line))');
      svg.append('text').attr('class', 'sr-tick').attr('x', m.l - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(t);
    }
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(f.ok)).attr('y2', y(f.ok)).attr('stroke-dasharray', '4 4').style('stroke', 'var(--color-fg-muted)');
    const pts = serie.filter((s) => s.score != null);
    svg.append('path').datum(pts).attr('fill', 'none').attr('stroke-width', 2).style('stroke', 'var(--color-fg)').attr('d', d3.line().x((s) => x(s.mes)).y((s) => y(s.score)));
    for (const s of pts) {
      svg.append('circle').attr('cx', x(s.mes)).attr('cy', y(s.score)).attr('r', 4).style('fill', corTom(tomScore(s.score))).style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
      svg.append('text').attr('class', 'sr-lb').attr('x', x(s.mes)).attr('y', y(s.score) - 8).attr('text-anchor', 'middle').text(Math.round(s.score));
    }
    for (const s of serie) svg.append('text').attr('class', 'sr-tick').attr('x', x(s.mes)).attr('y', H - 6).attr('text-anchor', 'middle').text(MES3[Number(s.mes.slice(5, 7)) - 1] + (s.parcial ? '*' : ''));
    box.append(svg.node());
  }

  function barras(box, lista, opt) {
    box.replaceChildren();
    if (!lista.length) { box.append(mk('div', 'sr-cs', opt.vazio || 'Nenhuma ocorrência no mês.')); return; }
    const max = Math.max(...lista.map((x) => x.custo)) || 1;
    for (const x of lista) {
      const br = mk('div', 'sr-br');
      const nm = mk('span', null, opt.rotulo ? opt.rotulo(x) : x.valor); nm.title = nm.textContent;
      const bt = mk('div', 'sr-bt'); const i = mk('i'); i.style.width = Math.max(2, (x.custo / max) * 100) + '%'; tom(i, opt.tom ? opt.tom(x) : ''); bt.append(i);
      const em = mk('em', null, F.brlk(x.custo));
      em.dataset.source = 'padroes'; em.dataset.field = 'custo';
      em.dataset.where = 'perna=' + encodeURIComponent(x.perna) + '&dim=' + encodeURIComponent(x.dim) + '&valor=' + encodeURIComponent(x.valor);
      em.append(mk('small', null, x.ocorrencias + ' ocorr. · ' + F.pct(x.share_custo)));
      br.append(nm, bt, em);
      box.append(br);
    }
  }

  // ---------- cartões das rotas ----------
  const st = { filtro: {}, abertas: new Set(), acoes: [] };

  // ---------- ações: de sugestão para acompanhamento ----------
  const CAMINHO_ACOES = 'data/time/acoes/';
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dataBR = (v) => (v ? String(v).slice(8, 10) + '/' + String(v).slice(5, 7) + '/' + String(v).slice(0, 4) : '—');
  const recentes = (a, b) => (String(a.validada_em || '') < String(b.validada_em || '') ? 1 : -1);
  const acaoAtiva = (rotaId) => st.acoes.filter((a) => a.rota_id === rotaId && a.status === 'Em acompanhamento').sort(recentes)[0];
  const botao = (texto, cls, fn) => { const b = mk('button', cls, texto); b.type = 'button'; b.addEventListener('click', (ev) => { ev.preventDefault(); fn(b); }); return b; };
  const marcaAcao = (el, id, campo) => { el.dataset.source = 'acoes'; el.dataset.field = campo; el.dataset.where = 'id=' + encodeURIComponent(id); return el; };
  function abreValidacao(r) {
    const m = document.getElementById('validar-acao'), f = document.getElementById('validar-form');
    if (!m || !f) return;
    const e = f.elements, d = new Date(); d.setDate(d.getDate() + 14);
    e.rota.value = r.rota; e.acao.value = r.acao; e.responsavel.value = '';
    e.prazo.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    e.rota_id.value = r.rota_id; e.perna.value = r.perna; e.score.value = r.score == null ? '' : String(r.score); e.foco.value = r.foco || ''; e.sugerida.value = r.acao;
    if (e.pratica) e.pratica.value = r.pratica_id || '';
    for (const p of m.querySelectorAll('.sr-err')) p.hidden = true;
    m.hidden = false;
    e.responsavel.focus();
  }
  async function mudaStatus(a, status, box, b) {
    b.disabled = true;
    try {
      const db = await claude.use('db');
      if (!db) throw new Error('sem db');
      await db.doc(CAMINHO_ACOES + a.id).update(status === 'Concluída' ? { status, concluida_em: hoje() } : { status, cancelada_em: hoje() });
    } catch (e) {
      b.disabled = false;
      if (!box.querySelector('.sr-err')) box.append(mk('p', 'sr-err', 'Não foi salvo. Só quem pode editar o dashboard muda a situação das ações.'));
    }
  }
  function blocoAcao(r) {
    const ativa = acaoAtiva(r.rota_id);
    const ac = mk('div', 'sr-acao' + (ativa ? ' sr-acao-on' : ''));
    if (ativa) {
      const atrasada = ativa.prazo && String(ativa.prazo) < hoje();
      ac.append(mk('b', null, 'Ação em acompanhamento'), marcaAcao(mk('span', null, ativa.acao), ativa.id, 'acao'));
      const m1 = mk('div', 'sr-acao-meta');
      m1.append(txt('Responsável: '), marcaAcao(mk('b', null, ativa.responsavel || '—'), ativa.id, 'responsavel'), txt(' · prazo '),
        tom(marcaAcao(mk('b', null, dataBR(ativa.prazo)), ativa.id, 'prazo'), atrasada ? 'bad' : ''), txt(atrasada ? ' (atrasada)' : ''), txt(' · validada em ' + dataBR(ativa.validada_em)));
      ac.append(m1);
      if (ativa.pratica_id) { const mp = mk('div', 'sr-acao-meta'); mp.append(txt('Boa prática ' + ativa.pratica_id + ' · '), linkGuia(ativa.pratica_id)); ac.append(mp); }
      if (ativa.score_inicial != null && r.score != null) {
        const d = r.score - Number(ativa.score_inicial);
        const m2 = mk('div', 'sr-acao-meta');
        m2.append(txt('Score na validação '), marcaAcao(mk('b', null, F.int(ativa.score_inicial)), ativa.id, 'score_inicial'), txt(' → hoje '), mk('b', null, F.int(r.score)), txt(' '), tom(mk('b', null, '(' + F.sint(d) + ' pts)'), d > 0.5 ? 'ok' : d < -0.5 ? 'bad' : ''));
        ac.append(m2);
      }
      const bts = mk('div', 'sr-acao-bt');
      bts.append(botao('Marcar como concluída', 'sr-bt1', (b) => mudaStatus(ativa, 'Concluída', ac, b)), botao('Cancelar acompanhamento', 'sr-bt2', (b) => mudaStatus(ativa, 'Cancelada', ac, b)));
      ac.append(bts);
      return ac;
    }
    ac.append(mk('b', null, 'Ação sugerida'), marca(mk('span', null, r.acao), 'saude_rotas', 'acao', r.rota_id));
    if (r.pratica_id) { const mp = mk('div', 'sr-acao-meta'); mp.append(txt('Boa prática ' + r.pratica_id + ': '), mk('b', null, r.pratica || ''), txt(' · '), linkGuia(r.pratica_id)); ac.append(mp); }
    if (r.situacao !== 'Saudável') {
      const bts = mk('div', 'sr-acao-bt');
      bts.append(botao('Validar e acompanhar', 'sr-bt1', () => abreValidacao(r)));
      ac.append(bts);
    }
    const ult = st.acoes.filter((a) => a.rota_id === r.rota_id && a.status === 'Concluída').sort(recentes)[0];
    if (ult) ac.append(mk('div', 'sr-acao-meta', 'Última ação concluída em ' + dataBR(ult.concluida_em) + ': ' + ult.acao));
    return ac;
  }
  const formV = document.getElementById('validar-form');
  if (formV) {
    formV.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const e = formV.elements, m = document.getElementById('validar-acao');
      const falta = document.getElementById('validar-faltando'), erro = document.getElementById('validar-erro');
      const acao = e.acao.value.trim(), resp = e.responsavel.value.trim(), prazo = e.prazo.value;
      if (!acao || !resp || !prazo) { if (falta) falta.hidden = false; return; }
      if (falta) falta.hidden = true;
      let ok = true;
      try {
        const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
        if (!db) throw new Error('sem db');
        let uid = null;
        try { uid = user ? await user.id() : null; } catch (x) { uid = null; }
        await db.doc(CAMINHO_ACOES + e.rota_id.value + '-' + Date.now()).set({
          rota_id: e.rota_id.value, perna: e.perna.value, rota: e.rota.value, acao, acao_sugerida: e.sugerida.value, foco: e.foco.value,
          responsavel: resp, prazo, status: 'Em acompanhamento', score_inicial: e.score.value === '' ? null : Number(e.score.value),
          validada_em: hoje(), validada_por: uid, pratica_id: e.pratica && e.pratica.value ? e.pratica.value : null,
        });
      } catch (x) { ok = false; }
      if (erro) erro.hidden = ok;
      if (ok && m) m.hidden = true;
    });
  }
  for (const b of document.querySelectorAll('#validar-cancelar')) b.addEventListener('click', () => { for (const m of document.querySelectorAll('#validar-acao')) m.hidden = true; });
  for (const m of document.querySelectorAll('#validar-acao')) m.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') m.hidden = true; });

  dash.draw('acoes', (tb) => {
    const A = rows('acoes'), S = rows('saude_rotas') || [];
    const campos = Array.from(tb.closest('table') ? tb.closest('table').querySelectorAll('th') : []);
    tb.replaceChildren();
    const vazio = (t) => { const tr = mk('tr'); const td = mk('td', 'sr-vazio', t); td.colSpan = campos.length || 1; tr.append(td); tb.append(tr); };
    if (!A) { if (falhou('acoes')) vazio('Não foi possível carregar as ações.'); return; }
    const ordem = { 'Em acompanhamento': 0, 'Concluída': 1, 'Cancelada': 2 };
    const lista = A.filter((a) => a.perna === tb.dataset.perna).sort((a, b) => (ordem[a.status] ?? 3) - (ordem[b.status] ?? 3) || String(a.prazo || '').localeCompare(String(b.prazo || '')));
    if (!lista.length) { vazio('Nenhuma ação validada ainda. Abra uma rota e clique em "Validar e acompanhar" na ação sugerida.'); return; }
    for (const a of lista) {
      const tr = mk('tr'); tr.dataset.key = a.id;
      const atual = (S.find((x) => x.rota_id === a.rota_id) || {}).score;
      const atrasada = a.status === 'Em acompanhamento' && a.prazo && String(a.prazo) < hoje();
      const tdSc = mk('td', 'num');
      if (atual != null) { const d = atual - Number(a.score_inicial); tdSc.append(txt(F.int(atual) + ' '), tom(mk('small', null, a.score_inicial == null ? '' : '(' + F.sint(d) + ')'), d > 0.5 ? 'ok' : d < -0.5 ? 'bad' : '')); } else tdSc.textContent = '—';
      const tdSt = mk('td');
      const sit = atrasada ? 'Atrasada' : a.status === 'Em acompanhamento' ? 'Em andamento' : a.status;
      tdSt.append(tom(mk('span', 'sr-chip', sit), atrasada ? 'bad' : a.status === 'Concluída' ? 'ok' : a.status === 'Em acompanhamento' ? 'warn' : ''));
      tr.append(mk('td', null, a.rota || a.rota_id), mk('td', 'sr-td-txt', a.acao || '—'), mk('td', null, a.responsavel || '—'), tom(mk('td', 'num', dataBR(a.prazo)), atrasada ? 'bad' : ''),
        mk('td', 'num', dataBR(a.validada_em)), mk('td', 'num', a.score_inicial == null ? '—' : F.int(a.score_inicial)), tdSc, tdSt);
      tb.append(tr);
    }
  });
  function cartao(r, pil, RM, PD, REF) {
    const u = UNID[r.perna] || ['unidade', 'unidades'];
    const dt = mk('details', 'sr-rc');
    dt.dataset.sit = r.situacao || '';
    dt.id = 'rota-' + r.rota_id;
    dt.open = st.abertas.has(r.rota_id);
    const sm = mk('summary');
    const top = mk('div', 'sr-rt');
    const sub = (r.perna === 'entrega' ? 'Saída: ' + r.origem + ' · ' : r.perna === 'coleta' ? 'Destino: ' + r.destino + ' · ' : '') + r.transportadora + (r.km != null ? ' · ' + nf.format(r.km) + ' km' : '') + ' · ' + nf.format(r.unidades) + ' ' + u[1] + ' no mês';
    top.append(mk('span', 'sr-chev', '▶'), mk('b', null, r.rota), mk('span', 'sr-cg', sub));
    top.append(tom(mk('span', 'sr-chip', r.situacao || '—'), TOM_SIT[r.situacao]));
    if (acaoAtiva(r.rota_id)) top.append(mk('span', 'sr-chip sr-chip-ac', 'Em acompanhamento'));
    const pre = mk('span', 'sr-rpre');
    pre.append(txt('Prejuízo '), marca(mk('span', null, F.brlk(r.prejuizo)), 'saude_rotas', 'prejuizo', r.rota_id));
    top.append(pre);
    sm.append(top);

    const hero = mk('div', 'sr-hero');
    const zg = mk('div', 'sr-z sr-zg');
    const gs = mk('div', 'sr-gsv');
    gs.append(meiaLua(r.score, 'Score da rota ' + r.rota + ': ' + Math.round(r.score) + ' de 100'));
    const col = mk('div', 'sr-gcol');
    const gv = tom(marca(mk('div', 'sr-gv', F.int(r.score)), 'saude_rotas', 'score', r.rota_id), tomScore(r.score));
    gv.append(mk('small', null, 'de 100'));
    const g3 = mk('div', 'sr-g3');
    const lin = (rot, val, campo, c) => { const d = mk('div'); const b = tom(mk('b', null, val), c); if (campo) marca(b, 'saude_rotas', campo, r.rota_id); d.append(mk('span', null, rot), b); return d; };
    g3.append(
      lin('Mês anterior', r.score_ant == null ? '—' : F.int(r.score_ant), 'score_ant'),
      lin('Variação', r.delta_score == null ? '—' : F.sint(r.delta_score) + ' pts', 'delta_score', r.delta_score == null ? '' : r.delta_score > 0.5 ? 'ok' : r.delta_score < -0.5 ? 'bad' : ''),
      lin('Mais tira pontos', r.foco || '—', 'foco')
    );
    col.append(mk('div', 'sr-hl', 'Score da rota'), gv, g3);
    zg.append(gs, col);
    const zp = mk('div', 'sr-z sr-zp');
    zp.append(mk('div', 'sr-hl', 'Nota de cada premissa (0 a 100)'));
    for (const p of pil) {
      const nt = r['nota_' + p.chave];
      const pr = mk('div', 'sr-pr');
      const nm = mk('span', null, p.premissa); nm.title = p.descricao;
      nm.append(mk('small', null, Math.round(p.peso * 100) + '%'));
      const bt = mk('div', 'sr-bt'); const i = mk('i'); i.style.width = Math.max(2, nt || 0) + '%'; tom(i, tomScore(nt)); bt.append(i);
      bt.title = 'Nota ' + (nt == null ? '—' : Math.round(nt)) + ' de 100';
      const em = tom(marca(mk('em', null, valorPilar(p, r[p.chave])), 'saude_rotas', p.chave, r.rota_id), tomScore(nt));
      pr.append(nm, bt, em);
      zp.append(pr);
    }
    const zr = mk('div', 'sr-zr');
    const c1 = mk('div', 'sr-c');
    const desvio = r.custo_vs_orcado != null ? r.custo_vs_orcado - 1 : null;
    const tDesv = desvio == null ? '' : desvio <= 0.005 ? 'ok' : desvio <= 0.08 ? 'warn' : 'bad';
    tom(c1, tDesv);
    const v1 = mk('div', 'sr-cv'); v1.append(marca(mk('span', null, F.brl2(r.frete_unidade)), 'saude_rotas', 'frete_unidade', r.rota_id), mk('small', null, '/' + u[0]));
    const p1 = tom(mk('span', 'sr-pill', desvio == null ? '—' : sinal(Math.round(desvio * 100)) + Math.abs(Math.round(desvio * 100)) + '% do orçado'), tDesv);
    const l1 = mk('div', 'sr-cs'); l1.append(txt('Orçado '), mk('b', null, F.brl2(r.frete_orcado)), txt(' por ' + u[0]));
    c1.append(mk('div', 'sr-hl', 'Frete por ' + u[0]), v1, p1, l1);
    const c2 = tom(mk('div', 'sr-c'), r.economia > 0.5 ? (r.situacao === 'Crítica' ? 'bad' : 'warn') : 'ok');
    const v2 = mk('div', 'sr-cv'); v2.append(marca(mk('span', null, F.brlk(r.economia)), 'saude_rotas', 'economia', r.rota_id), mk('small', null, 'no mês'));
    const l2 = mk('div', 'sr-cs');
    if (r.tipo_top) l2.append(txt('Maior causa de prejuízo: '), mk('b', null, r.tipo_top), txt(' (' + F.brlk(r.tipo_top_custo) + ')'));
    else l2.textContent = 'Sem ocorrências no mês';
    const l3 = mk('div', 'sr-cs'); l3.append(mk('b', null, nf.format(r.ocorrencias)), txt(' ocorrências · '), mk('b', null, nf.format(r.abertas)), txt(' em aberto'));
    c2.append(mk('div', 'sr-hl', 'Economia possível'), v2, l2);
    if (r.perna === 'transferencia' && r.economia_vazio > 0.5) {
      const l4 = mk('div', 'sr-cs'); l4.append(txt('Espaço vazio no caminhão: '), marca(mk('b', null, F.brlk(r.economia_vazio)), 'saude_rotas', 'economia_vazio', r.rota_id));
      c2.append(l4);
    }
    c2.append(l3);
    zr.append(c1, c2);
    hero.append(zg, zp, zr);
    sm.append(hero);
    dt.append(sm);

    const body = mk('div', 'sr-body');
    const b1 = mk('div', 'sr-sub2');
    b1.append(mk('div', 'sr-hl', 'Ocorrências do mês por tipo'));
    const bb = mk('div', 'sr-bars');
    barras(bb, PD.filter((x) => x.dim === 'rota_tipo' && x.rota_id === r.rota_id), { rotulo: (x) => x.tipo });
    b1.append(bb);
    const b2 = mk('div', 'sr-sub2');
    b2.append(mk('div', 'sr-hl', 'Score nos últimos meses'));
    const mini = mk('div', 'sr-mini');
    b2.append(mini);
    const ac = blocoAcao(r);
    body.append(b1, b2, ac);
    dt.append(body);
    const serie = RM.filter((x) => x.rota_id === r.rota_id).sort((a, b) => (a.mes < b.mes ? -1 : 1)).map((x) => ({ mes: x.mes, score: x.score, parcial: x.mes === REF.mes }));
    const desenhaMini = () => requestAnimationFrame(() => miniScore(mini, serie));
    dt.addEventListener('toggle', () => {
      if (dt.open) { st.abertas.add(r.rota_id); desenhaMini(); } else st.abertas.delete(r.rota_id);
    });
    if (dt.open) desenhaMini();
    return dt;
  }

  dash.draw('rotas', (el) => {
    const ids = ['saude_rotas', 'rota_mes', 'padroes', 'premissas', 'referencia'];
    const S = rows('saude_rotas'), RM = rows('rota_mes'), PD = rows('padroes'), P = rows('premissas'), RF = rows('referencia');
    if (!S || !RM || !PD || !P || !RF) {
      if (ids.some(falhou)) { skel(el, false); el.replaceChildren(mk('p', 'sr-err', 'Não foi possível carregar as rotas.')); }
      else if (carregando(ids)) skel(el, true);
      return;
    }
    skel(el, false);
    const perna = el.dataset.perna;
    const pil = pilares(P, perna);
    const filtro = st.filtro[perna] || '';
    const lista = S.filter((r) => r.perna === perna && passa(r) && (!filtro || r.situacao === filtro));
    st.acoes = rows('acoes') || [];
    el.replaceChildren(...lista.map((r) => cartao(r, pil, RM, PD, RF[0])));
    if (!lista.length) el.append(mk('p', 'sr-note', 'Nenhuma rota nessa situação neste mês.'));
  });

  for (const b of document.querySelectorAll('.sr-seg[data-perna] button')) {
    b.addEventListener('click', () => {
      const grupo = b.closest('.sr-seg');
      st.filtro[grupo.dataset.perna] = b.dataset.v || '';
      for (const x of grupo.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      dash.draw('rotas');
    });
  }

  // ---------- escolha da perna ----------
  function abrePerna(perna, link) {
    const alvo = document.getElementById('perna-' + perna);
    if (!alvo) return;
    for (const s of document.querySelectorAll('.sr-perna')) s.hidden = s !== alvo;
    for (const b of document.querySelectorAll('.sr-pb[data-perna]')) b.setAttribute('aria-pressed', String(b.dataset.perna === perna));
    if (link) dash.setLink('perna-' + perna);
  }
  for (const b of document.querySelectorAll('.sr-pb[data-perna]')) b.addEventListener('click', () => abrePerna(b.dataset.perna, true));
  const inicio = (location.hash || '').replace('#perna-', '');
  if (inicio && inicio !== (location.hash || '')) abrePerna(inicio, false);

  // ---------- padrões ----------
  dash.draw('padrao', (el) => {
    const PD = rows('padroes');
    if (!PD) { if (falhou('padroes')) el.replaceChildren(mk('p', 'sr-err', 'Não foi possível carregar.')); return; }
    barras(el, PD.filter((x) => x.perna === el.dataset.perna && x.dim === el.dataset.dim), { tom: (x) => (x.share_custo >= 0.3 ? 'bad' : x.share_custo >= 0.15 ? 'warn' : '') });
  });

  // ---------- ranking: as colunas seguem os cabeçalhos da tabela ----------
  dash.draw('ranking', (tb) => {
    const S = rows('saude_rotas'), P = rows('premissas');
    tb.replaceChildren();
    const campos = Array.from(tb.closest('table') ? tb.closest('table').querySelectorAll('th') : []).map((th) => th.dataset.field);
    if (!S || !P) { if (falhou('saude_rotas')) { const tr = mk('tr'); const td = mk('td', 'sr-err', 'Não foi possível carregar o ranking.'); td.colSpan = campos.length || 1; tr.append(td); tb.append(tr); } return; }
    const perna = tb.dataset.perna;
    const pil = pilares(P, perna);
    for (const r of S.filter((x) => x.perna === perna && passa(x))) {
      const tr = mk('tr'); tr.dataset.key = r.rota_id;
      for (const c of campos) {
        const p = pil.find((x) => x.chave === c);
        let td;
        if (p) {
          const nt = r['nota_' + c];
          td = tom(mk('td', 'num', valorPilar(p, r[c])), tomScore(nt) === 'bad' ? 'bad' : '');
          td.title = 'Nota ' + Math.round(nt || 0) + ' de 100';
        } else if (c === 'score') { td = mk('td', 'num'); td.append(tom(mk('span', 'sr-pill', F.int(r.score)), tomScore(r.score))); }
        else if (c === 'prejuizo' || c === 'economia') td = mk('td', 'num', F.brl(r[c]));
        else if (c === 'situacao') { td = mk('td'); td.append(tom(mk('span', 'sr-chip', r.situacao || '—'), TOM_SIT[r.situacao])); }
        else td = mk('td', null, r[c] == null ? '—' : String(r[c]));
        tr.append(td);
      }
      tb.append(tr);
    }
  });

  // ---------- perna mês a mês ----------
  dash.draw('rede', (el) => {
    const fonte = (el.dataset.source || 'rede_mes').split(' ')[0];
    const T = rows(fonte);
    if (!T) { if (falhou(fonte)) { skel(el, false); el.replaceChildren(mk('p', 'sr-err', 'Não foi possível carregar o gráfico.')); } return; }
    skel(el, false);
    el.replaceChildren();
    const perna = el.dataset.perna;
    const D = T.filter((d) => d.perna === perna);
    const W = el.clientWidth;
    if (!W || !D.length) return;
    const H = 250, m = { t: 22, r: 40, b: 26, l: 62 };
    const f = faixas();
    const x = d3.scaleBand().domain(D.map((d) => d.mes)).range([m.l, W - m.r]).padding(0.32);
    const y = d3.scaleLinear().domain([0, (d3.max(D, (d) => d.prejuizo) || 1) * 1.15]).nice().range([H - m.b, m.t]);
    const y2 = d3.scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('height', H).attr('role', 'img').attr('aria-label', 'Prejuízo com ocorrências e score médio da perna por mês');
    for (const t of y.ticks(4)) {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(t)).attr('y2', y(t)).style('stroke', 'var(--cds-chart-grid, var(--color-border-line))');
      svg.append('text').attr('class', 'sr-tick').attr('x', m.l - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(F.brlk(t));
    }
    for (const t of [0, 50, 100]) svg.append('text').attr('class', 'sr-tick').attr('x', W - m.r + 6).attr('y', y2(t)).attr('dy', '0.32em').text(t);
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y2(f.ok)).attr('y2', y2(f.ok)).attr('stroke-dasharray', '4 4').style('stroke', 'var(--color-fg-muted)');
    for (const d of D) {
      svg.append('rect').attr('x', x(d.mes)).attr('width', x.bandwidth()).attr('y', y(d.prejuizo)).attr('height', y(0) - y(d.prejuizo)).attr('rx', 3).style('fill', 'var(--color-fg-muted)').style('opacity', d.parcial ? 0.3 : 0.55);
      svg.append('text').attr('class', 'sr-tick').attr('x', x(d.mes) + x.bandwidth() / 2).attr('y', H - 7).attr('text-anchor', 'middle').text(MES3[Number(d.mes.slice(5, 7)) - 1] + (d.parcial ? '*' : ''));
    }
    const cx = (d) => x(d.mes) + x.bandwidth() / 2;
    const pts = D.filter((d) => d.score != null);
    svg.append('path').datum(pts).attr('fill', 'none').attr('stroke-width', 2.25).style('stroke', 'var(--color-fg)').attr('d', d3.line().x(cx).y((d) => y2(d.score)));
    for (const d of pts) {
      svg.append('circle').attr('cx', cx(d)).attr('cy', y2(d.score)).attr('r', 4.5).style('fill', corTom(tomScore(d.score))).style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
      svg.append('text').attr('class', 'sr-lb').attr('x', cx(d)).attr('y', y2(d.score) - 9).attr('text-anchor', 'middle').text(Math.round(d.score));
    }
    const u = UNID[perna] || ['unidade', 'unidades'];
    const tip = mk('div', 'sr-tip'); tip.hidden = true;
    for (const d of D) {
      svg.append('rect').attr('x', x(d.mes) - (x.step() - x.bandwidth()) / 2).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'transparent')
        .on('mouseenter', () => {
          const nome = MESES[Number(d.mes.slice(5, 7)) - 1];
          tip.replaceChildren(mk('b', null, nome.charAt(0).toUpperCase() + nome.slice(1) + (d.parcial ? ' (parcial)' : '')),
            mk('div', null, 'Score médio ' + F.int(d.score) + ' · ' + PRAZO[perna] + ' ' + F.pct1(d.pct_prazo)),
            mk('div', null, nf.format(d.unidades) + ' ' + u[1] + ' · prejuízo ' + F.brl(d.prejuizo) + ' em ' + nf.format(d.ocorrencias) + ' ocorrências'),
            mk('div', null, 'Rotas: ' + d.criticas + ' críticas, ' + d.atencao + ' em atenção, ' + d.saudaveis + ' saudáveis'));
          tip.hidden = false;
          tip.style.left = Math.max(0, Math.min(W - 236, cx(d) - 115)) + 'px';
        })
        .on('mouseleave', () => { tip.hidden = true; });
    }
    el.append(svg.node(), tip);
  });

  // ---------- mapa da transferência por região ----------
  const NOME_REG = { N: 'Norte', NE: 'Nordeste', CO: 'Centro-Oeste', SE: 'Sudeste', S: 'Sul' };
  const escolheRegiao = (reg) => dash.setParams({ regiao: (dash.params().regiao || '') === reg ? '' : reg });
  dash.draw('mapa', (el) => {
    const G = window.SR_MAPA, RG = rows('regioes');
    if (!G || !RG) { if (falhou('regioes')) { skel(el, false); el.replaceChildren(mk('p', 'sr-err', 'Não foi possível carregar o mapa.')); } return; }
    skel(el, false);
    el.replaceChildren();
    const sel = dash.params().regiao || '';
    const svg = d3.create('svg').attr('viewBox', '0 0 ' + G.w + ' ' + G.h).attr('role', 'group').attr('aria-label', 'Mapa do Brasil por região com o score da perna');
    const tip = mk('div', 'sr-tip'); tip.hidden = true;
    const perna = el.dataset.perna, u = UNID[perna] || ['unidade', 'unidades'];
    const info = (reg) => RG.find((x) => x.perna === perna && x.regiao === reg) || { regiao: reg, nome: NOME_REG[reg], n_rotas: 0, score: null };
    for (const reg of Object.keys(G.regioes)) {
      const r = info(reg);
      const tem = r.n_rotas > 0 && r.score != null;
      const cor = tem ? 'color-mix(in srgb, ' + corTom(tomScore(r.score)) + ' 55%, var(--color-panel))' : 'color-mix(in srgb, var(--color-fg) 8%, var(--color-panel))';
      const p = svg.append('path').attr('d', G.regioes[reg].d).attr('class', 'sr-reg' + (tem ? ' sr-reg-on' : ''))
        .style('fill', cor).style('stroke', reg === sel ? 'var(--color-fg)' : 'var(--color-panel)').attr('stroke-width', reg === sel ? 4 : 2)
        .style('opacity', sel && reg !== sel ? 0.4 : 1);
      if (!tem) { p.attr('aria-label', r.nome + ': sem rota nesta perna'); continue; }
      p.attr('tabindex', 0).attr('role', 'button').attr('aria-pressed', String(reg === sel))
        .attr('aria-label', r.nome + ': score ' + Math.round(r.score) + ', ' + r.n_rotas + (r.n_rotas > 1 ? ' rotas' : ' rota') + '. Filtrar a página por esta região.')
        .on('click', () => escolheRegiao(reg))
        .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); escolheRegiao(reg); } })
        .on('mouseenter mousemove', (ev) => {
          const [mx, my] = d3.pointer(ev, el);
          tip.replaceChildren(mk('b', null, r.nome + ' · ' + r.situacao),
            mk('div', null, 'Score ' + F.int(r.score) + ' · ' + r.n_rotas + (r.n_rotas > 1 ? ' rotas' : ' rota') + ', ' + r.n_criticas + (r.n_criticas === 1 ? ' crítica' : ' críticas')),
            mk('div', null, nf.format(r.unidades) + ' ' + u[1] + ' · prejuízo ' + F.brl(r.prejuizo)),
            mk('div', null, reg === sel ? 'Clique para ver todas as regiões' : 'Clique para filtrar'));
          tip.hidden = false;
          tip.style.left = Math.max(0, Math.min(el.clientWidth - 230, mx + 12)) + 'px';
          tip.style.top = Math.max(0, my - 70) + 'px';
        })
        .on('mouseleave', () => { tip.hidden = true; });
    }
    for (const reg of Object.keys(G.regioes)) {
      const g = G.regioes[reg], r = info(reg);
      const tem = r.n_rotas > 0 && r.score != null;
      const tx = svg.append('text').attr('class', 'sr-reg-t').attr('text-anchor', 'middle').style('opacity', sel && reg !== sel ? 0.45 : 1);
      tx.append('tspan').attr('class', 'sr-reg-n').attr('x', g.x).attr('y', g.y - 6).text(r.nome);
      tx.append('tspan').attr('class', tem ? 'sr-reg-v' : 'sr-reg-nd').attr('x', g.x).attr('y', g.y + (tem ? 22 : 16)).text(tem ? Math.round(r.score) : 'sem rotas');
    }
    el.append(svg.node(), tip);
  });
  dash.draw('regiaosel', (el) => {
    const P = dash.params();
    const sec = el.closest('.sr-perna');
    const perna = sec ? sec.id.replace('perna-', '') : 'transferencia';
    el.replaceChildren();
    if (perna === 'transferencia') {
      const sel = P.regiao || '';
      if (!sel) { el.append(mk('span', null, 'Todas as regiões · clique numa região do mapa para filtrar')); return; }
      const t = mk('span'); t.append(txt('Região: '), mk('b', null, NOME_REG[sel] || sel));
      const b = mk('button', 'sr-fil-x', 'Ver todas as regiões'); b.type = 'button';
      b.addEventListener('click', () => dash.setParams({ regiao: '' }));
      el.append(t, b);
      return;
    }
    const uf = P['uf_' + perna] || 'SP', z = P['zona_' + perna] || '';
    const Z = rows('zonas') || [];
    const cid = (Z.find((x) => x.uf === uf) || {}).cidade || uf;
    const t = mk('span'); t.append(mk('b', null, cid + ' (' + uf + ')'));
    if (!z) { t.append(txt(' · todas as zonas · clique numa zona do mapa para filtrar')); el.append(t); return; }
    t.append(txt(' · zona '), mk('b', null, z));
    const b = mk('button', 'sr-fil-x', 'Ver a cidade toda'); b.type = 'button';
    b.addEventListener('click', () => dash.setParams({ ['zona_' + perna]: '' }));
    el.append(t, b);
  });

  // ---------- mapa da cidade por zona (coleta e entrega) ----------
  dash.draw('mapacidade', (el) => {
    const G = window.SR_MAPA, Z = rows('zonas');
    if (!G || !G.cidades || !Z) { if (falhou('zonas')) { skel(el, false); el.replaceChildren(mk('p', 'sr-err', 'Não foi possível carregar o mapa.')); } return; }
    skel(el, false);
    el.replaceChildren();
    const perna = el.dataset.perna, u = UNID[perna] || ['unidade', 'unidades'];
    const P = dash.params(), uf = P['uf_' + perna] || 'SP', sel = P['zona_' + perna] || '';
    const geo = G.cidades[uf];
    const ZC = Z.filter((x) => x.perna === perna && x.uf === uf);
    const cid = (ZC[0] || {}).cidade || uf;
    if (!geo || !ZC.length) { el.append(mk('p', 'sr-note', 'Sem rotas de ' + (perna === 'coleta' ? 'coleta' : 'entrega') + ' neste estado.')); return; }
    const svg = d3.create('svg').attr('viewBox', '0 0 400 400').attr('role', 'group').attr('aria-label', 'Mapa de ' + cid + ' por zona com o score de cada zona');
    const tip = mk('div', 'sr-tip'); tip.hidden = true;
    const escolhe = (z) => dash.setParams({ ['zona_' + perna]: sel === z ? '' : z });
    for (const z of Object.keys(geo.zonas)) {
      const r = ZC.find((x) => x.zona === z);
      const tem = r && r.score != null;
      const cor = tem ? 'color-mix(in srgb, ' + corTom(tomScore(r.score)) + ' 55%, var(--color-panel))' : 'color-mix(in srgb, var(--color-fg) 8%, var(--color-panel))';
      const p = svg.append('path').attr('d', geo.zonas[z].d).attr('class', 'sr-reg' + (tem ? ' sr-reg-on' : ''))
        .style('fill', cor).style('stroke', z === sel ? 'var(--color-fg)' : 'var(--color-panel)').attr('stroke-width', z === sel ? 4 : 2)
        .style('opacity', sel && z !== sel ? 0.4 : 1);
      if (!tem) { p.attr('aria-label', 'Zona ' + z + ': sem rota'); continue; }
      p.attr('tabindex', 0).attr('role', 'button').attr('aria-pressed', String(z === sel))
        .attr('aria-label', 'Zona ' + z + ': score ' + Math.round(r.score) + '. Filtrar por esta zona.')
        .on('click', () => escolhe(z))
        .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); escolhe(z); } })
        .on('mouseenter mousemove', (ev) => {
          const [mx, my] = d3.pointer(ev, el);
          tip.replaceChildren(mk('b', null, cid + ' · zona ' + z + ' · ' + r.situacao),
            mk('div', null, 'Score ' + F.int(r.score) + ' · ' + nf.format(r.unidades) + ' ' + u[1] + ' no mês'),
            mk('div', null, nf.format(r.ocorrencias) + ' ocorrências · prejuízo ' + F.brl(r.prejuizo)),
            mk('div', null, z === sel ? 'Clique para ver a cidade toda' : 'Clique para filtrar'));
          tip.hidden = false;
          tip.style.left = Math.max(0, Math.min(el.clientWidth - 230, mx + 12)) + 'px';
          tip.style.top = Math.max(0, my - 70) + 'px';
        })
        .on('mouseleave', () => { tip.hidden = true; });
    }
    for (const z of Object.keys(geo.zonas)) {
      const g = geo.zonas[z], r = ZC.find((x) => x.zona === z);
      const tem = r && r.score != null;
      const tx = svg.append('text').attr('class', 'sr-reg-t').attr('text-anchor', 'middle').style('opacity', sel && z !== sel ? 0.45 : 1);
      tx.append('tspan').attr('class', 'sr-reg-n').attr('x', g.x).attr('y', g.y - 6).text(z);
      tx.append('tspan').attr('class', tem ? 'sr-reg-v' : 'sr-reg-nd').attr('x', g.x).attr('y', g.y + (tem ? 22 : 16)).text(tem ? Math.round(r.score) : 'sem rota');
    }
    el.append(svg.node(), tip);
  });

  // ---------- filtros de região e estado (coleta e entrega) ----------
  dash.draw('ufsel', (sel) => {
    const R = rows('rotas');
    const perna = sel.dataset.perna, P = dash.params();
    const reg = P['reg_' + perna] || '';
    const ufs = [];
    for (const r of R || []) if (r.perna === perna && (!reg || r.regiao === reg) && !ufs.some((x) => x.uf === r.uf)) ufs.push({ uf: r.uf, cidade: r.cidade });
    ufs.sort((a, b) => a.cidade.localeCompare(b.cidade));
    sel.replaceChildren(...ufs.map((x) => new Option(x.cidade + ' (' + x.uf + ')', x.uf)));
    sel.value = P['uf_' + perna] || 'SP';
    sel.onchange = () => dash.setParams({ ['uf_' + perna]: sel.value, ['zona_' + perna]: '' });
  });
  for (const sel of document.querySelectorAll('select.sr-sel-reg')) {
    sel.addEventListener('change', () => {
      const perna = sel.dataset.perna, reg = sel.value, P = dash.params();
      const d = dash.data('rotas');
      const ufs = (d.status === 'ok' ? d.data : []).filter((r) => r.perna === perna && (!reg || r.regiao === reg)).map((r) => r.uf);
      const novo = { ['reg_' + perna]: reg };
      if (ufs.length && !ufs.includes(P['uf_' + perna] || 'SP')) { novo['uf_' + perna] = ufs.sort()[0]; novo['zona_' + perna] = ''; }
      dash.setParams(novo);
    });
  }
  dash.onData(() => {
    const P = dash.params();
    for (const sel of document.querySelectorAll('select.sr-sel-reg')) if (document.activeElement !== sel) sel.value = P['reg_' + sel.dataset.perna] || '';
  });

  // ---------- abas: painel e guia de boas práticas ----------
  const NOME_PERNA = { coleta: 'Coleta · first mile', transferencia: 'Transferência · middle mile', entrega: 'Entrega · last mile' };
  function mostraAba(aba, link) {
    for (const s of document.querySelectorAll('#painel, #guia')) s.hidden = s.id !== aba;
    for (const b of document.querySelectorAll('.sr-aba[data-aba]')) b.setAttribute('aria-pressed', String(b.dataset.aba === aba));
    if (link) dash.setLink(aba);
  }
  function linkGuia(id) {
    const l = mk('button', 'sr-link', 'Ver no guia'); l.type = 'button';
    l.addEventListener('click', (ev) => {
      ev.preventDefault();
      st.guia = ''; st.guiaFoco = id;
      for (const b of document.querySelectorAll('#guia-filtro button')) b.setAttribute('aria-pressed', String(!b.dataset.v));
      mostraAba('guia', true);
      dash.draw('guia');
    });
    return l;
  }
  for (const b of document.querySelectorAll('.sr-aba[data-aba]')) b.addEventListener('click', () => mostraAba(b.dataset.aba, true));
  if ((location.hash || '') === '#guia') mostraAba('guia', false);
  for (const b of document.querySelectorAll('#guia-filtro button')) b.addEventListener('click', () => {
    st.guia = b.dataset.v || ''; st.guiaFoco = '';
    for (const x of document.querySelectorAll('#guia-filtro button')) x.setAttribute('aria-pressed', String(x === b));
    dash.draw('guia');
  });
  dash.draw('guia', (el) => {
    const PR = rows('praticas'), S = rows('saude_rotas') || [];
    if (!PR) { if (falhou('praticas')) { skel(el, false); el.replaceChildren(mk('p', 'sr-err', 'Não foi possível carregar o guia.')); } return; }
    skel(el, false);
    el.replaceChildren();
    for (const perna of ['coleta', 'transferencia', 'entrega']) {
      if (st.guia && st.guia !== perna) continue;
      const lista = PR.filter((p) => p.perna === perna);
      if (!lista.length) continue;
      const bloco = mk('div', 'sr-guia-perna');
      bloco.append(mk('h3', null, NOME_PERNA[perna] + ' · ' + lista.length + (lista.length > 1 ? ' práticas' : ' prática')));
      const grid = mk('div', 'sr-guia-grid');
      for (const p of lista) {
        const usando = S.filter((r) => r.pratica_id === p.id);
        const c = mk('article', 'sr-prat' + (st.guiaFoco === p.id ? ' sr-destaque' : ''));
        c.id = 'pratica-' + p.id;
        const t = mk('div', 'sr-prat-t'); t.append(mk('span', 'sr-chip', p.id), mk('b', null, p.titulo || ''));
        const ul = mk('ul');
        for (const passo of String(p.como_fazer || '').split(';').map((x) => x.trim()).filter(Boolean)) ul.append(mk('li', null, passo));
        const uso = mk('div', 'sr-prat-pe');
        if (usando.length) uso.append(mk('b', null, usando.length + (usando.length > 1 ? ' rotas pedem' : ' rota pede') + ' esta prática agora: '), txt(usando.slice(0, 4).map((r) => r.rota).join(', ') + (usando.length > 4 ? ' e mais ' + (usando.length - 4) : '')));
        else uso.textContent = 'Nenhuma rota pede esta prática agora.';
        c.append(t, mk('div', 'sr-hl', 'Quando usar'), mk('p', null, p.quando_usar || ''), mk('div', 'sr-hl', 'Como fazer'), ul,
          mk('div', 'sr-hl', 'Ação sugerida no painel'), mk('p', 'sr-prat-modelo', String(p.acao || '').replace(/\{\w+\}/g, '…')),
          mk('div', 'sr-prat-pe', 'Melhora: ' + (p.melhora || '—') + ' · esforço ' + String(p.esforco || '—').toLowerCase() + ' · prazo típico de ' + (p.prazo_dias || '—') + ' dias'),
          uso, mk('div', 'sr-prat-or', p.origem || ''));
        grid.append(c);
      }
      bloco.append(grid);
      el.append(bloco);
    }
    if (st.guiaFoco) requestAnimationFrame(() => { const x = document.getElementById('pratica-' + st.guiaFoco); if (x) x.scrollIntoView({ block: 'center' }); });
  });

  // ---------- premissas ----------
  dash.draw('premissas', (tb) => {
    const P = rows('premissas');
    tb.replaceChildren();
    if (!P) return;
    for (const p of pilares(P, tb.dataset.perna)) {
      const tr = mk('tr'); tr.dataset.key = p.perna + ',' + p.chave;
      tr.append(mk('td', null, p.premissa), mk('td', null, p.descricao), mk('td', 'num', Math.round(p.peso * 100) + '%'), mk('td', 'num', reguaPilar(p, p.nota_zero)), mk('td', 'num', reguaPilar(p, p.nota_cem)));
      tb.append(tr);
    }
  });
})();

