/* PAUTA CF — Aba "Demandas de massa" do Painel de Processos.
 *
 * Processos do Agibank nas duas teses de massa (Tarifa de Comunicação Digital
 * e Débito Seguro), conferidos no PJe/Projudi: onde estão, como foram
 * julgados e em quais comarcas já houve procedência com dano moral.
 * A base é assets/data/demandas-massa.json, gerada por
 * scripts/processos/gerar_demandas_massa.mjs a partir da planilha conferida.
 */

const CAT = {
  dm:  { nome: 'Procedente com dano moral', cor: 'var(--r-dm)' },
  sdm: { nome: 'Procedente sem dano moral', cor: 'var(--r-sdm)' },
  imp: { nome: 'Improcedente', cor: 'var(--r-imp)' },
  ext: { nome: 'Extinto sem mérito', cor: 'var(--r-ext)' },
  ag:  { nome: 'Aguardando sentença', cor: 'var(--r-ag)' },
};
const ORDEM = ['dm', 'sdm', 'imp', 'ext', 'ag'];
// Mesmas cores dos tokens --r-* de massa.css (o atributo stroke do SVG não lê var()).
const COR_ANEL = { dm: '#1fa874', sdm: '#c4b54c', imp: '#e8655f', ext: '#646d82', ag: '#3a5584' };
const TESE = { tcd: 'Tarifa de Comunicação Digital', seguro: 'Débito Seguro' };
const UF_NOME = { CE: 'Ceará · TJCE', BA: 'Bahia · TJBA' };

function categoria(p) {
  if (p.r === 'procedente' || p.r === 'parcial') return p.dm ? 'dm' : 'sdm';
  if (p.r === 'improcedente') return 'imp';
  if (p.r === 'extinto') return 'ext';
  return 'ag';
}
let DADOS = null;
let BASE = [];
let FORA = 0;

const estado = { tese: 'todas', uf: 'todas', comarca: null, tudo: false };
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, texto) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (texto != null) n.textContent = texto; return n; };
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–');
const chaveComarca = (p) => `${p.m}|${p.uf}`;

function recorte({ semComarca = false } = {}) {
  return BASE.filter((p) => (estado.tese === 'todas' || p.t === estado.tese)
    && (estado.uf === 'todas' || p.uf === estado.uf)
    && (semComarca || !estado.comarca || chaveComarca(p) === estado.comarca));
}
function contar(lista) {
  const c = { total: lista.length, dm: 0, sdm: 0, imp: 0, ext: 0, ag: 0 };
  for (const p of lista) c[p.c] += 1;
  c.merito = c.dm + c.sdm + c.imp;
  c.proc = c.dm + c.sdm;
  return c;
}

function pilha(c, alvo) {
  alvo.replaceChildren();
  for (const k of ORDEM) {
    if (!c[k]) continue;
    const s = el('span', { title: `${CAT[k].nome}: ${c[k]}` });
    s.style.flexGrow = c[k];
    s.style.background = CAT[k].cor;
    if (k === 'ag') s.style.background = 'var(--r-ag)';
    alvo.append(s);
  }
}

function renderKpis(c) {
  const comarcas = new Set(recorte().map((p) => chaveComarca(p))).size;
  $('#m_kTotal').textContent = c.total;
  $('#m_kTotalNota').textContent = `${comarcas} ${comarcas === 1 ? 'comarca' : 'comarcas'}`;
  $('#m_kMerito').textContent = c.merito;
  $('#m_kMeritoNota').textContent = `${c.ext} extinç${c.ext === 1 ? 'ão' : 'ões'} sem mérito à parte`;
  $('#m_kTaxa').textContent = pct(c.proc, c.merito);
  $('#m_kTaxaNota').textContent = `${c.proc} procedentes em ${c.merito}`;
  $('#m_kDm').textContent = c.dm;
  $('#m_kDmNota').textContent = c.proc ? `${pct(c.dm, c.proc)} das procedências` : 'nenhuma procedência ainda';
  $('#m_kAg').textContent = c.ag;
  $('#m_kAgNota').textContent = `${pct(c.ag, c.total)} do recorte`;
}

function renderFunil(c) {
  const etapas = [
    ['Processos ajuizados', c.total, c.total],
    ['Sentença de mérito', c.merito, c.total],
    ['Procedentes (total ou parcial)', c.proc, c.merito],
    ['Com dano moral', c.dm, c.proc],
  ];
  const alvo = $('#m_funil');
  alvo.replaceChildren();
  for (const [nome, n, base] of etapas) {
    const e = el('div', { class: 'funil__etapa' });
    const topo = el('div', { class: 'funil__topo' });
    topo.append(el('span', { class: 'funil__n' }, String(n)), el('span', { class: 'funil__pct' }, base === n && nome === 'Processos ajuizados' ? '' : pct(n, base)));
    const trilho = el('div', { class: 'funil__trilho' });
    const barra = el('div', { class: 'funil__barra' });
    barra.style.width = base ? `${(100 * n) / base}%` : '0%';
    trilho.append(barra);
    e.append(topo, el('span', { class: 'funil__nome' }, nome), trilho);
    alvo.append(e);
  }
}

function renderLegenda() {
  const alvo = $('#m_legenda');
  for (const k of ORDEM) {
    const s = el('span');
    const chip = el('i', { class: `chip${k === 'ag' ? ' chip--ag' : ''}` });
    if (k !== 'ag') chip.style.background = CAT[k].cor;
    s.append(chip, document.createTextNode(CAT[k].nome));
    alvo.append(s);
  }
  const est = el('span');
  est.append(el('b', { style: 'color: var(--ouro-claro)' }, '★'), document.createTextNode('Comarca com dano moral'));
  alvo.append(est);
}

/* ------------ mapas ------------ */
function projetar(lon, lat) {
  const P = DADOS.proj;
  const cos = Math.cos((P.latRef * Math.PI) / 180);
  return [(lon - P.lonMin) * cos * P.escala, (P.latMax - lat) * P.escala];
}
const dica = el('div', { class: 'dica', hidden: '' });

function mostrarDica(evento, nome, c, caixa) {
  dica.replaceChildren(el('b', {}, nome));
  for (const k of ORDEM) {
    if (!c[k]) continue;
    const l = el('div', { class: 'dica__linha' });
    const chip = el('i', { class: `chip${k === 'ag' ? ' chip--ag' : ''}` });
    if (k !== 'ag') chip.style.background = CAT[k].cor;
    l.append(chip, el('strong', {}, String(c[k])), document.createTextNode(CAT[k].nome.toLowerCase()));
    dica.append(l);
  }
  dica.hidden = false;
  const area = caixa.getBoundingClientRect();
  const x = (evento.clientX ?? area.left + area.width / 2) - area.left;
  const y = (evento.clientY ?? area.top + area.height / 2) - area.top;
  dica.style.left = `${Math.min(Math.max(6, x + 12), area.width - dica.offsetWidth - 6)}px`;
  dica.style.top = `${y + dica.offsetHeight + 16 > area.height ? y - dica.offsetHeight - 10 : y + 12}px`;
  caixa.append(dica);
}

function donut(g, cx, cy, R, c) {
  const w = Math.max(3, R * 0.42);
  const r = R - w / 2;
  const circ = 2 * Math.PI * r;
  g.append(svgEl('circle', { cx, cy, r: R + 1.5, class: 'fundo-donut' }));
  let feito = 0;
  for (const k of ORDEM) {
    if (!c[k]) continue;
    const frac = c[k] / c.total;
    const seg = svgEl('circle', {
      cx, cy, r, fill: 'none', 'stroke-width': w,
      stroke: COR_ANEL[k],
      'stroke-dasharray': `${Math.max(0, frac * circ - (c.total > 1 ? 1.2 : 0))} ${circ}`,
      'stroke-dashoffset': -feito * circ,
      transform: `rotate(-90 ${cx} ${cy})`,
    });
    g.append(seg);
    feito += frac;
  }
}

function renderMapas() {
  const alvo = $('#m_mapas');
  alvo.replaceChildren();
  const lista = recorte({ semComarca: true });
  const ufs = estado.uf === 'todas' ? ['CE', 'BA'] : [estado.uf];
  alvo.style.gridTemplateColumns = ufs.length === 1 ? 'minmax(0, 1fr)' : '';
  for (const uf of ufs) {
    const m = DADOS.mapas[uf];
    const [bx, by, bw, bh] = m.bbox;
    const pad = Math.max(bw, bh) * 0.06;
    const caixa = el('div', { class: 'm-mapa' });
    const doUf = lista.filter((p) => p.uf === uf);
    const cUf = contar(doUf);
    const titulo = el('div', { class: 'm-mapa__titulo' });
    titulo.append(el('strong', {}, UF_NOME[uf]), el('span', {}, `${cUf.total} processos · ${cUf.proc} procedentes · ${cUf.dm} com dano moral`));
    caixa.append(titulo);
    const svg = svgEl('svg', { viewBox: `${bx - pad} ${by - pad} ${bw + 2 * pad} ${bh + 2 * pad}`, role: 'img', 'aria-label': `Mapa de ${UF_NOME[uf]} com os processos por comarca` });
    svg.append(svgEl('path', { d: m.d, class: 'estado' }));
    const grupos = new Map();
    for (const p of doUf) { if (p.lat == null) continue; const k = chaveComarca(p); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); }
    const maior = Math.max(1, ...[...grupos.values()].map((g) => g.length));
    const escalaR = Math.max(bw, bh) / 26;
    const ordenados = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);
    const estrelas = []; // por cima de todos os anéis, para nunca ficarem cobertas
    for (const [k, ps] of ordenados) {
      const c = contar(ps);
      const [x, y] = projetar(ps[0].lon, ps[0].lat);
      const R = escalaR * (0.55 + 1.15 * Math.sqrt(c.total / maior));
      const g = svgEl('g', { class: `comarca${estado.comarca === k ? ' comarca--sel' : ''}${estado.comarca && estado.comarca !== k ? ' comarca--apagada' : ''}`, tabindex: '0', role: 'button', 'aria-label': `${ps[0].m}: ${c.total} processos, ${c.proc} procedentes, ${c.dm} com dano moral` });
      g.append(svgEl('circle', { cx: x, cy: y, r: Math.max(R, escalaR * 1.2), class: 'alvo' }));
      donut(g, x, y, R, c);
      if (c.dm) {
        const s = R * 0.62;
        const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? s * 0.45 : s; return `${x + rr * Math.cos(a)},${y + rr * Math.sin(a)}`; }).join(' ');
        estrelas.push(svgEl('polygon', { points: pts, class: 'estrela' }));
      }
      const nome = ps[0].m;
      g.addEventListener('pointermove', (e) => mostrarDica(e, `${nome} — ${uf}`, c, caixa));
      g.addEventListener('pointerleave', () => { dica.hidden = true; });
      g.addEventListener('focus', (e) => mostrarDica(e, `${nome} — ${uf}`, c, caixa));
      g.addEventListener('blur', () => { dica.hidden = true; });
      const escolher = () => { estado.comarca = estado.comarca === k ? null : k; estado.tudo = false; render(); };
      g.addEventListener('click', escolher);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(); } });
      svg.append(g);
    }
    estrelas.forEach((e) => svg.append(e));
    caixa.append(svg);
    const nucleo = doUf.filter((p) => p.lat == null);
    if (nucleo.length) {
      const c = contar(nucleo);
      const k = chaveComarca(nucleo[0]);
      const linha = el('div', { class: 'nucleo' });
      const b = el('button', { type: 'button', 'aria-pressed': String(estado.comarca === k) });
      b.append(document.createTextNode(`${c.total} processos no Núcleo de Justiça 4.0 · ${c.proc} procedentes`));
      linha.append(el('span', {}, 'Unidade virtual, sem comarca no mapa:'));
      b.addEventListener('click', () => { estado.comarca = estado.comarca === k ? null : k; render(); });
      linha.append(b);
      caixa.append(linha);
    }
    alvo.append(caixa);
  }
}

function renderRanking() {
  const lista = recorte({ semComarca: true });
  const grupos = new Map();
  for (const p of lista) { const k = chaveComarca(p); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); }
  const linhas = [...grupos.entries()].map(([k, ps]) => ({ k, nome: ps[0].m, uf: ps[0].uf, c: contar(ps) }))
    .sort((a, b) => b.c.dm - a.c.dm || b.c.proc - a.c.proc || (b.c.merito ? b.c.proc / b.c.merito : -1) - (a.c.merito ? a.c.proc / a.c.merito : -1) || b.c.total - a.c.total);
  const alvo = $('#m_ranking');
  alvo.replaceChildren();
  if (!linhas.length) { alvo.append(el('li', { class: 'm-vazio' }, 'Nenhum processo neste recorte.')); return; }
  for (const l of linhas.slice(0, 12)) {
    const li = el('li');
    const b = el('button', { type: 'button', 'aria-pressed': String(estado.comarca === l.k) });
    const topo = el('span', { class: 'ranking__topo' });
    const nome = el('span', { class: 'ranking__nome' }, l.nome);
    nome.append(el('small', {}, l.uf));
    const info = el('span', { class: 'ranking__info' }, `${l.c.merito ? `${l.c.proc} de ${l.c.merito} procedentes` : 'sem sentença de mérito'} · ${l.c.total} ${l.c.total === 1 ? 'processo' : 'processos'}`);
    topo.append(nome, info);
    const p = el('span', { class: 'pilha' });
    pilha(l.c, p);
    b.append(topo, p);
    if (l.c.dm) b.append(el('span', { class: 'dm-tag' }, `★ ${l.c.dm} com dano moral`));
    b.addEventListener('click', () => { estado.comarca = estado.comarca === l.k ? null : l.k; estado.tudo = false; render(); });
    li.append(b);
    alvo.append(li);
  }
  if (linhas.length > 12) alvo.append(el('li', { class: 'm-vazio' }, `+ ${linhas.length - 12} comarcas na tabela abaixo.`));
}

function renderTeses() {
  const alvo = $('#m_teses');
  alvo.replaceChildren();
  const base = BASE.filter((p) => !estado.comarca || chaveComarca(p) === estado.comarca);
  for (const t of ['tcd', 'seguro']) {
    const bloco = el('div', { class: 'm-cartao', style: `padding: 12px 14px; background: rgba(7,16,34,.4); ${estado.tese !== 'todas' && estado.tese !== t ? 'opacity:.45' : ''}` });
    bloco.append(el('h3', { style: 'font-size:13.5px;color:var(--texto)' }, TESE[t]));
    for (const uf of ['CE', 'BA']) {
      const c = contar(base.filter((p) => p.t === t && p.uf === uf));
      const linha = el('div', { class: 'tese__linha' });
      const p = el('span', { class: 'pilha' });
      pilha(c, p);
      const num = el('span', { class: 'tese__num' });
      num.append(el('b', {}, pct(c.proc, c.merito)), document.createTextNode(` · ${c.proc}/${c.merito} · ${c.total} proc.`));
      linha.append(el('span', { class: 'tese__uf' }, `TJ${uf}`), p, num);
      bloco.append(linha);
    }
    alvo.append(bloco);
  }
  const tcd = contar(base.filter((p) => p.t === 'tcd'));
  const seg = contar(base.filter((p) => p.t === 'seguro'));
  $('#m_notaTeses').textContent = `Tarifa de Comunicação Digital: ${tcd.proc} procedentes em ${tcd.merito} sentenças de mérito, ${tcd.dm} com dano moral. Débito Seguro: ${seg.proc} em ${seg.merito}, ${seg.dm} com dano moral, e ${seg.ag} dos ${seg.total} processos ainda sem sentença.`
    + (FORA ? ` Ficam fora desta aba ${FORA} processos do Agibank sem uma das duas teses na planilha (cartão RMC/RCC e tribunais ainda sem conferência).` : '');
}

const NOME_RES = { procedente: 'Procedente', parcial: 'Procedente em parte', improcedente: 'Improcedente', extinto: 'Extinto sem mérito', aguardando: 'Sem sentença' };
function renderTabela() {
  const lista = recorte().sort((a, b) => ORDEM.indexOf(a.c) - ORDEM.indexOf(b.c) || a.m.localeCompare(b.m, 'pt-BR'));
  const mostrar = estado.tudo ? lista : lista.slice(0, 15);
  const corpo = $('#m_corpo');
  corpo.replaceChildren();
  for (const p of mostrar) {
    const tr = el('tr');
    tr.append(el('td', { class: 'm-num' }, p.n), el('td', {}, `${p.m} — ${p.uf}`), el('td', {}, TESE[p.t]));
    const tdR = el('td');
    const r = el('span', { class: 'res' });
    const chip = el('i', { class: `chip${p.c === 'ag' ? ' chip--ag' : ''}` });
    if (p.c !== 'ag') chip.style.background = CAT[p.c].cor;
    r.append(chip, document.createTextNode(NOME_RES[p.r] + (p.ext ? ` (${p.ext})` : '')));
    tdR.append(r);
    tr.append(tdR, el('td', {}, p.r === 'procedente' || p.r === 'parcial' ? (p.dm ? 'Com dano moral' : 'Sem dano moral') : '—'), el('td', { class: 'm-num' }, p.u || '—'), el('td', { class: 'obs' }, p.o || '—'));
    corpo.append(tr);
  }
  $('#m_contagem').textContent = `${mostrar.length} de ${lista.length} processos`;
  $('#m_btnMais').hidden = lista.length <= 15 || estado.tudo;
  $('#m_subTabela').textContent = 'Ordenados do melhor resultado ao pendente. A nota é a da conferência no tribunal, sem o nome do cliente.';
}

function renderFiltros() {
  for (const [id, campo] of [['#m_fTese', 'tese'], ['#m_fUf', 'uf']]) {
    for (const b of document.querySelectorAll(`${id} button`)) b.setAttribute('aria-pressed', String(b.dataset.v === estado[campo]));
  }
  $('#m_filtroComarca').hidden = !estado.comarca;
  if (estado.comarca) { const [m, uf] = estado.comarca.split('|'); $('#m_filtroComarcaTexto').textContent = `Comarca: ${m} — ${uf}`; }
}

function render() {
  const c = contar(recorte());
  renderFiltros();
  renderKpis(c);
  renderFunil(c);
  renderMapas();
  renderRanking();
  renderTeses();
  renderTabela();
}


function bboxDoCaminho(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

let iniciado = false;

/** Carrega a base e desenha a aba. Chamado pelo painel na primeira vez em que a aba abre. */
export async function iniciarMassa() {
  if (iniciado) return;
  iniciado = true;
  try {
    const [base, geo] = await Promise.all([
      fetch('assets/data/demandas-massa.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      fetch('assets/data/brasil-uf.json').then((r) => r.json()),
    ]);
    const mapas = {};
    for (const u of geo.ufs) if (u.uf === 'CE' || u.uf === 'BA') mapas[u.uf] = { d: u.d, bbox: bboxDoCaminho(u.d) };
    DADOS = { proj: geo.projecao, mapas, processos: base.processos };
    BASE = DADOS.processos.map((p) => ({ ...p, c: categoria(p) }));
    const semTese = Object.values(base.semTese || {}).reduce((a, b) => a + b, 0);
    FORA = semTese;
    const ref = base.referencia ? base.referencia.split('-').reverse().join('/') : null;
    $('#m_fonte').textContent = `Tarifa de Comunicação Digital e Débito Seguro no TJCE e no TJBA, conferidos no PJe/Projudi${ref ? ` até ${ref}` : ''}.`;
  } catch (erro) {
    console.error(erro);
    $('#m_fonte').textContent = 'Não foi possível carregar a base de Demandas de massa.';
    return;
  }
  for (const [id, campo] of [['#m_fTese', 'tese'], ['#m_fUf', 'uf']]) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      estado[campo] = b.dataset.v;
      if (campo === 'uf' && estado.comarca && estado.uf !== 'todas' && !estado.comarca.endsWith(`|${estado.uf}`)) estado.comarca = null;
      estado.tudo = false;
      render();
    });
  }
  $('#m_btnLimpar').addEventListener('click', () => { estado.comarca = null; render(); });
  $('#m_btnMais').addEventListener('click', () => { estado.tudo = true; renderTabela(); });
  renderLegenda();
  render();
}
