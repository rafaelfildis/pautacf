/* PAUTA CF — Análise de teses.
 *
 * Lê a base publicada do Painel de Processos (assets/data/processos-base.json)
 * e mostra, por tese, como as sentenças de mérito estão saindo: procedentes,
 * improcedentes, taxa de procedência e taxa com dano moral, com o recorte por
 * tribunal e comarca. Taxas sobre as sentenças de mérito (procedentes +
 * improcedentes); acordos e extinções sem mérito ficam fora do cálculo.
 */

import { TESES, TESES_MASSA, RESULTADOS } from '../processos/classificar.js';
import { carregarBasePublicada } from '../processos/dados.js';

const $ = (sel) => document.querySelector(sel);
const fmtInt = new Intl.NumberFormat('pt-BR');
const AMOSTRA_PEQUENA = 5;

const estado = {
  registros: [],
  escopo: 'todas',
  adversa: '',
  tribunal: '',
  tese: null,
  ordem: { campo: 'merito', asc: false },
};

// ------------------------------------------------------------------ utilidades

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null) e.append(f instanceof Node ? f : String(f));
  return e;
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const nomeTese = (t) => TESES[t] || t || 'Sem tese';

function novoGrupo(chave) {
  return { chave, total: 0, procedente: 0, parcial: 0, improcedente: 0, acordo: 0, sem_merito: 0, pendente: 0, dm: 0 };
}

function somar(g, r) {
  g.total += 1;
  g[r.resultado in g ? r.resultado : 'pendente'] += 1;
  if ((r.resultado === 'procedente' || r.resultado === 'parcial') && r.danoMoral === true) g.dm += 1;
}

function fechar(g) {
  g.procedentes = g.procedente + g.parcial;
  g.merito = g.procedentes + g.improcedente;
  g.taxa = g.merito ? g.procedentes / g.merito : null;
  g.taxaDm = g.merito ? g.dm / g.merito : null;
  g.sdm = g.procedentes - g.dm;
  return g;
}

function agrupar(registros, chaveDe) {
  const m = new Map();
  for (const r of registros) {
    const k = chaveDe(r);
    if (!m.has(k)) m.set(k, novoGrupo(k));
    somar(m.get(k), r);
  }
  return [...m.values()].map(fechar);
}

function filtrados({ semTese = false } = {}) {
  return estado.registros.filter((r) => (estado.escopo === 'massa' ? TESES_MASSA.has(r.tese) : true)
    && (!estado.adversa || r.adversa === estado.adversa)
    && (!estado.tribunal || r.tribunal === estado.tribunal)
    && (semTese || !estado.tese || r.tese === estado.tese));
}

// ------------------------------------------------------------------ dica

const dica = () => $('#dica');
function mostrarDica(evento, titulo, linhas) {
  const d = dica();
  d.replaceChildren(el('div', { class: 'grafico__dica-titulo' }, titulo),
    ...linhas.map(([rotulo, valor]) => el('div', { class: 'grafico__dica-linha' }, `${rotulo}:`, el('strong', {}, valor))));
  d.hidden = false;
  const caixa = d.parentElement.getBoundingClientRect();
  const x = Math.min(evento.clientX - caixa.left + 14, caixa.width - d.offsetWidth - 8);
  d.style.left = `${Math.max(8, x)}px`;
  d.style.top = `${evento.clientY - caixa.top + 14}px`;
}
const esconderDica = () => { dica().hidden = true; };

// ------------------------------------------------------------------ filtros

function preencherSelect(sel, opcoes, valor, rotuloTodos) {
  sel.replaceChildren(el('option', { value: '' }, rotuloTodos),
    ...opcoes.map(([v, rotulo]) => el('option', { value: v, selected: v === valor }, rotulo)));
}

function montarFiltros() {
  const base = estado.registros.filter((r) => (estado.escopo === 'massa' ? TESES_MASSA.has(r.tese) : true));
  const contar = (campo, extra) => [...base.filter(extra).reduce((m, r) => m.set(r[campo], (m.get(r[campo]) || 0) + 1), new Map())]
    .filter(([v]) => v).sort((a, b) => b[1] - a[1]);
  preencherSelect($('#fAdversa'), contar('adversa', (r) => !estado.tribunal || r.tribunal === estado.tribunal)
    .map(([v, n]) => [v, `${v} (${n})`]), estado.adversa, 'Todas as partes adversas');
  preencherSelect($('#fTribunal'), contar('tribunal', (r) => !estado.adversa || r.adversa === estado.adversa)
    .map(([v, n]) => [v, `${v} (${n})`]), estado.tribunal, 'Todos os tribunais');
}

// ------------------------------------------------------------------ indicadores

function renderizarIndicadores(grupos, todos) {
  const t = fechar(todos.reduce((g, r) => { somar(g, r); return g; }, novoGrupo('total')));
  const comMerito = grupos.filter((g) => g.merito).length;
  $('#kTeses').textContent = fmtInt.format(grupos.length);
  $('#kTesesNota').textContent = `${fmtInt.format(t.total)} processos · ${comMerito} com sentença de mérito`;
  $('#kMerito').textContent = fmtInt.format(t.merito);
  $('#kMeritoNota').textContent = `${t.procedentes} procedentes · ${t.improcedente} improcedentes`;
  $('#kTaxa').textContent = pct(t.procedentes, t.merito);
  $('#kTaxaNota').textContent = t.merito ? `${t.procedente} procedentes e ${t.parcial} parciais` : 'sem sentenças de mérito';
  $('#kDm').textContent = pct(t.dm, t.merito);
  $('#kDmNota').textContent = t.merito ? `${t.dm} com dano moral · ${pct(t.dm, t.procedentes)} das procedências` : '—';
  $('#kAguardando').textContent = fmtInt.format(t.pendente);
  $('#kAguardandoNota').textContent = `${pct(t.pendente, t.total)} dos processos · ${t.sem_merito} extinções · ${t.acordo} acordos`;
}

// ------------------------------------------------------------------ barras

function renderizarBarras(grupos) {
  const caixa = $('#barras');
  caixa.replaceChildren();
  const lista = grupos.filter((g) => g.merito).sort((a, b) => b.merito - a.merito || b.taxa - a.taxa);
  if (!lista.length) {
    caixa.append(el('p', { class: 'cartao__sub' }, 'Nenhuma sentença de mérito no recorte.'));
    return;
  }
  for (const g of lista) {
    const segs = [['dm', g.dm, 'Procedente com dano moral'], ['sdm', g.sdm, 'Procedente sem dano moral'], ['imp', g.improcedente, 'Improcedente']]
      .filter(([, n]) => n > 0);
    const trilho = el('span', { class: 'barra-tese__trilho' });
    for (const [classe, n, rotulo] of segs) {
      const seg = el('span', { class: `barra-tese__seg barra-tese__seg--${classe}`, style: `flex: ${n} 1 0` });
      seg.addEventListener('mousemove', (e) => mostrarDica(e, nomeTese(g.chave), [
        [rotulo, `${n} de ${g.merito} (${pct(n, g.merito)})`],
        ['Taxa de procedência', pct(g.procedentes, g.merito)],
        ['Taxa com dano moral', pct(g.dm, g.merito)],
      ]));
      seg.addEventListener('mouseleave', esconderDica);
      trilho.append(seg);
    }
    const pequena = g.merito < AMOSTRA_PEQUENA ? el('span', { class: 'selo-amostra', title: `Menos de ${AMOSTRA_PEQUENA} sentenças de mérito: a taxa ainda oscila muito` }, 'amostra pequena') : null;
    const botao = el('button', {
      class: `barra-tese${estado.tese === g.chave ? ' barra-tese--sel' : ''}`,
      type: 'button',
      'aria-label': `${nomeTese(g.chave)}: ${g.merito} sentenças de mérito, ${g.procedentes} procedentes (${g.dm} com dano moral), ${g.improcedente} improcedentes`,
      onclick: () => selecionarTese(g.chave),
    },
    el('span', { class: 'barra-tese__nome' }, nomeTese(g.chave), pequena,
      el('span', { class: 'barra-tese__n' }, `${g.merito} sentença${g.merito === 1 ? '' : 's'} de mérito · ${g.total} processos`)),
    trilho,
    el('span', { class: 'barra-tese__taxa' }, `${pct(g.procedentes, g.merito)} procedência`,
      el('small', {}, `${pct(g.dm, g.merito)} com dano moral`)));
    caixa.append(botao);
  }
}

// ------------------------------------------------------------------ tabela

const COLUNAS = [
  ['tese', 'Tese'],
  ['total', 'Processos', true],
  ['merito', 'Sentenças de mérito', true],
  ['procedentes', 'Procedentes', true],
  ['improcedente', 'Improcedentes', true],
  ['taxa', 'Taxa de procedência', true],
  ['dm', 'Com dano moral', true],
  ['taxaDm', 'Taxa com dano moral', true],
  ['acordo', 'Acordos', true],
  ['sem_merito', 'Extintos', true],
  ['pendente', 'Aguardando', true],
];

function celulas(g) {
  return {
    tese: nomeTese(g.chave),
    total: fmtInt.format(g.total),
    merito: fmtInt.format(g.merito),
    procedentes: fmtInt.format(g.procedentes),
    improcedente: fmtInt.format(g.improcedente),
    taxa: pct(g.procedentes, g.merito),
    dm: fmtInt.format(g.dm),
    taxaDm: pct(g.dm, g.merito),
    acordo: fmtInt.format(g.acordo),
    sem_merito: fmtInt.format(g.sem_merito),
    pendente: fmtInt.format(g.pendente),
  };
}

function renderizarTabela(grupos, todos) {
  const cab = $('#cabecalhoTeses');
  cab.replaceChildren();
  for (const [campo, rotulo, num] of COLUNAS) {
    const th = el('th', { class: [num ? 'num' : '', estado.ordem.campo === campo ? 'ordenado' : ''].join(' ').trim() || null, scope: 'col' }, rotulo);
    if (estado.ordem.campo === campo) th.dataset.dir = estado.ordem.asc ? '↑' : '↓';
    th.addEventListener('click', () => {
      estado.ordem = estado.ordem.campo === campo ? { campo, asc: !estado.ordem.asc } : { campo, asc: campo === 'tese' };
      renderizar();
    });
    cab.append(th);
  }

  const { campo, asc } = estado.ordem;
  const valor = (g) => (campo === 'tese' ? nomeTese(g.chave) : g[campo] ?? -1);
  const ordenados = [...grupos].sort((a, b) => {
    const va = valor(a); const vb = valor(b);
    const base = typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb;
    return (asc ? base : -base) || b.total - a.total;
  });

  const corpo = $('#corpoTeses');
  corpo.replaceChildren();
  for (const g of ordenados) {
    const c = celulas(g);
    const tr = el('tr', { class: estado.tese === g.chave ? 'linha--sel' : null, tabindex: '0', title: 'Ver tribunais, comarcas e processos desta tese' });
    for (const [k, , num] of COLUNAS) {
      const td = el('td', { class: [num ? 'num' : '', k === 'taxa' || k === 'tese' ? 'destaque' : ''].join(' ').trim() || null }, c[k]);
      if (k === 'tese' && g.merito && g.merito < AMOSTRA_PEQUENA) td.append(el('span', { class: 'selo-amostra' }, 'amostra pequena'));
      if (k === 'procedentes' && g.procedentes) td.title = `${g.procedente} procedentes e ${g.parcial} parcialmente procedentes`;
      tr.append(td);
    }
    tr.addEventListener('click', () => selecionarTese(g.chave));
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') selecionarTese(g.chave); });
    corpo.append(tr);
  }

  const total = fechar(todos.reduce((g, r) => { somar(g, r); return g; }, novoGrupo('Total')));
  const c = celulas(total);
  c.tese = 'Total';
  $('#rodapeTeses').replaceChildren(el('tr', {}, COLUNAS.map(([k, , num]) => el('td', { class: num ? 'num' : null }, c[k]))));
}

// ------------------------------------------------------------------ matriz

function renderizarMatriz(grupos, todos) {
  const tribunais = agrupar(todos, (r) => r.tribunal || '—').sort((a, b) => b.total - a.total).map((g) => g.chave);
  const teses = [...grupos].sort((a, b) => b.merito - a.merito || b.total - a.total).map((g) => g.chave);
  const porPar = new Map(agrupar(todos, (r) => `${r.tese}|${r.tribunal || '—'}`).map((g) => [g.chave, g]));
  const tabela = $('#matriz');
  const cab = el('tr', {}, el('th', { scope: 'col' }, 'Tese'), tribunais.map((t) => el('th', { scope: 'col' }, t)));
  const linhas = teses.map((t) => el('tr', {}, el('th', { scope: 'row', class: 'matriz__tese' }, nomeTese(t)), tribunais.map((tr) => {
    const g = porPar.get(`${t}|${tr}`);
    if (!g || !g.merito) {
      return el('td', { class: 'celula celula--vazia', title: g ? `${g.total} processo(s), nenhuma sentença de mérito` : 'Sem processos' }, g ? '—' : '');
    }
    const alfa = 0.08 + 0.5 * g.taxa;
    const td = el('td', {
      class: `celula${g.merito < 3 ? ' celula--pouca' : ''}`,
      style: `background: rgba(31, 168, 116, ${alfa.toFixed(2)})`,
    }, pct(g.procedentes, g.merito), ' ', el('small', {}, `(${g.merito})`));
    td.addEventListener('mousemove', (e) => mostrarDica(e, `${nomeTese(t)} · ${tr}`, [
      ['Sentenças de mérito', String(g.merito)],
      ['Procedentes', `${g.procedentes} (${g.dm} com dano moral)`],
      ['Improcedentes', String(g.improcedente)],
      ['Aguardando', String(g.pendente)],
    ]));
    td.addEventListener('mouseleave', esconderDica);
    return td;
  })));
  tabela.replaceChildren(el('thead', {}, cab), el('tbody', {}, linhas));
}

// ------------------------------------------------------------------ detalhe

function selecionarTese(tese) {
  estado.tese = estado.tese === tese ? null : tese;
  renderizar();
  if (estado.tese) $('#detalhe').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderizarDetalhe() {
  const secao = $('#detalhe');
  if (!estado.tese) { secao.hidden = true; return; }
  const lista = filtrados();
  const g = fechar(lista.reduce((acc, r) => { somar(acc, r); return acc; }, novoGrupo(estado.tese)));
  secao.hidden = false;
  $('#tituloDetalhe').textContent = nomeTese(estado.tese);
  $('#detalheSub').textContent = `${g.total} processos · ${g.merito} sentenças de mérito · ${pct(g.procedentes, g.merito)} de procedência · ${g.dm} com dano moral · ${g.pendente} aguardando sentença`;

  const todasComarcas = agrupar(lista, (r) => (r.municipio ? `${r.municipio} — ${r.uf}` : `${r.unidade || 'Comarca não identificada'}${r.uf ? ` — ${r.uf}` : ''}`))
    .sort((a, b) => b.merito - a.merito || b.total - a.total);
  const comarcas = todasComarcas.filter((c) => c.merito);
  const semMerito = todasComarcas.filter((c) => !c.merito);
  $('#tabelaComarcas').replaceChildren(
    el('thead', {}, el('tr', {}, ['Comarca', 'Processos', 'Mérito', 'Proc.', 'Improc.', 'Taxa', 'Dano moral']
      .map((t, i) => el('th', { class: i ? 'num' : null, scope: 'col' }, t)))),
    el('tbody', {}, comarcas.map((c) => el('tr', {},
      el('td', {}, c.chave), el('td', { class: 'num' }, c.total), el('td', { class: 'num' }, c.merito),
      el('td', { class: 'num' }, c.procedentes), el('td', { class: 'num' }, c.improcedente),
      el('td', { class: 'num' }, pct(c.procedentes, c.merito)), el('td', { class: 'num' }, c.dm || '—')))),
  );
  const rodape = $('#rodapeComarcas');
  rodape.textContent = semMerito.length
    ? `Outras ${semMerito.length} comarca${semMerito.length === 1 ? '' : 's'} com ${semMerito.reduce((n, c) => n + c.total, 0)} processo(s) ainda sem sentença de mérito.`
    : '';

  const ORDEM = { procedente: 0, parcial: 1, improcedente: 2 };
  const processos = lista.filter((r) => r.resultado in ORDEM)
    .sort((a, b) => (b.danoMoral === true) - (a.danoMoral === true) || ORDEM[a.resultado] - ORDEM[b.resultado] || String(a.municipio).localeCompare(String(b.municipio), 'pt-BR'));
  $('#tabelaProcessos').replaceChildren(
    el('thead', {}, el('tr', {}, ['Nº do processo', 'Comarca', 'Parte adversa', 'Resultado', 'Dano moral'].map((t) => el('th', { scope: 'col' }, t)))),
    el('tbody', {}, processos.length ? processos.map((r) => el('tr', {},
      el('td', { class: 'col-processo' }, r.numero || '—'),
      el('td', {}, r.municipio ? `${r.municipio} — ${r.uf}` : (r.unidade || '—')),
      el('td', {}, r.adversa || '—'),
      el('td', {}, el('span', { class: `selo-resultado selo-resultado--${r.resultado}` }, RESULTADOS[r.resultado])),
      el('td', {}, r.resultado === 'improcedente' ? '—' : r.danoMoral === true ? 'Com dano moral' : r.danoMoral === false ? 'Sem dano moral' : 'A conferir')))
      : el('tr', {}, el('td', { colspan: '5', class: 'vazio' }, 'Nenhuma sentença de mérito nesta tese.'))),
  );
}

// ------------------------------------------------------------------ CSV

function exportarCsv() {
  const grupos = agrupar(filtrados({ semTese: true }), (r) => r.tese);
  const seguro = (v) => {
    const s = String(v ?? '');
    const t = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const linhas = [COLUNAS.map(([, r]) => r)];
  for (const g of grupos.sort((a, b) => b.merito - a.merito)) {
    linhas.push([nomeTese(g.chave), g.total, g.merito, g.procedentes, g.improcedente, pct(g.procedentes, g.merito), g.dm, pct(g.dm, g.merito), g.acordo, g.sem_merito, g.pendente]);
  }
  const blob = new Blob([`﻿${linhas.map((l) => l.map(seguro).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'analise-de-teses.csv' });
  document.body.append(a); a.click(); a.remove();
}

// ------------------------------------------------------------------ ciclo

function renderizar() {
  montarFiltros();
  const todos = filtrados({ semTese: true });
  const grupos = agrupar(todos, (r) => r.tese);
  if (estado.tese && !grupos.some((g) => g.chave === estado.tese)) estado.tese = null;
  renderizarIndicadores(grupos, todos);
  renderizarBarras(grupos);
  renderizarTabela(grupos, todos);
  renderizarMatriz(grupos, todos);
  renderizarDetalhe();
}

function ligar() {
  document.querySelectorAll('[data-escopo]').forEach((b) => b.addEventListener('click', () => {
    estado.escopo = b.dataset.escopo;
    document.querySelectorAll('[data-escopo]').forEach((x) => {
      const ativo = x === b;
      x.classList.toggle('aba--ativa', ativo);
      x.setAttribute('aria-checked', String(ativo));
    });
    renderizar();
  }));
  $('#fAdversa').addEventListener('change', (e) => { estado.adversa = e.target.value; renderizar(); });
  $('#fTribunal').addEventListener('change', (e) => { estado.tribunal = e.target.value; renderizar(); });
  $('#btnLimpar').addEventListener('click', () => {
    Object.assign(estado, { adversa: '', tribunal: '', tese: null });
    renderizar();
  });
  $('#btnFecharDetalhe').addEventListener('click', () => { estado.tese = null; renderizar(); });
  $('#btnCsv').addEventListener('click', exportarCsv);
}

async function iniciar() {
  ligar();
  try {
    const base = await carregarBasePublicada();
    estado.registros = (base.registros || []).filter((r) => r.tipo !== 'caso');
    const ref = base.referencia ? base.referencia.split('-').reverse().join('/') : '—';
    $('#basePonto').className = 'sinc__ponto sinc__ponto--ok';
    $('#baseTexto').textContent = `Base publicada · ${fmtInt.format(estado.registros.length)} processos · ${ref}`;
    $('#notaFonte').textContent = `Fonte: ${base.fonte || 'base publicada do Painel de Processos'}. Andamentos até ${ref}. `
      + 'Procedentes inclui as procedências parciais. Taxa de procedência = procedentes ÷ sentenças de mérito; '
      + 'taxa com dano moral = procedentes com dano moral ÷ sentenças de mérito. Teses com menos de '
      + `${AMOSTRA_PEQUENA} sentenças de mérito são marcadas como amostra pequena.`;
    renderizar();
  } catch (erro) {
    console.error(erro);
    $('#basePonto').className = 'sinc__ponto sinc__ponto--erro';
    $('#baseTexto').textContent = 'Base indisponível';
  }
}

iniciar();
