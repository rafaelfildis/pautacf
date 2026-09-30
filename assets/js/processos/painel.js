/* PAUTA CF — Controlador do Painel de Processos.
 *
 * Fluxo: carrega a base (local, se o usuário importou a planilha neste
 * navegador; senão a publicada), aplica os filtros da barra superior e
 * redesenha tudo — indicadores, mapa, ranking, gráficos e tabela — sobre o
 * mesmo recorte.
 */

import {
  RESULTADOS, TESES, SITUACOES, NOMES_UF, classificarPlanilha, criarIndiceMunicipios,
} from './classificar.js';
import {
  carregarBasePublicada, lerBaseLocal, gravarBaseLocal, apagarBaseLocal, carregarMunicipios,
  carregarOrigens, FILTROS_PADRAO, filtrar, resumo, ranking, porMes, agrupar, valoresUnicos,
  chaveComarca, RECOMENDACOES, K_PRIOR,
} from './dados.js';
import { criarMapa, CLASSES_VOLUME, CLASSES_EXITO, CORES_RECOMENDACAO } from './mapa.js';
import {
  barrasResultado, matrizTeses, colunasMes, barrasSimples, legendaResultados, CORES_RESULTADO, ORDEM_RESULTADO,
} from './graficos.js';
import { lerXlsx, lerCsv } from './xlsx.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const CHAVE_FILTROS = 'pautacf.processos.filtros.v1';
const POR_PAGINA = 25;

const estado = {
  base: null,
  publicada: null,
  filtros: { ...FILTROS_PADRAO },
  metrica: 'volume',
  mostrarComarcas: true,
  nivelFoco: 'comarca',
  nivelRanking: 'comarca',
  ordemRanking: { campo: 'indice', asc: false },
  ordemProcessos: { campo: 'distribuicao', asc: false },
  pagina: 1,
  rankingCompleto: false,
  mapa: null,
};

const LINHAS_RANKING = 20;

const fmtInt = new Intl.NumberFormat('pt-BR');
/** AAAA-MM-DD → dd/mm/aaaa; AAAA-MM (base publicada) → mm/aaaa. */
const fmtData = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function criar(tag, classe, texto) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (texto != null) n.textContent = texto;
  return n;
}

/* ================= avisos ================= */

let temporizadorAviso = null;
function avisar(mensagem, erro = false) {
  const el = $('#aviso');
  el.textContent = mensagem;
  el.className = `aviso ${erro ? 'aviso--erro' : ''}`;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.hidden = true; }, erro ? 7000 : 4200);
}

/* ================= filtros ================= */

function lerFiltrosSalvos() {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE_FILTROS) || 'null');
    if (salvo) estado.filtros = { ...FILTROS_PADRAO, ...salvo, busca: '' };
  } catch { /* sem sessão */ }
}

function salvarFiltros() {
  try { sessionStorage.setItem(CHAVE_FILTROS, JSON.stringify(estado.filtros)); } catch { /* sem sessão */ }
}

function preencherSelect(sel, opcoes, valor, rotuloTodos) {
  sel.replaceChildren(new Option(rotuloTodos, ''));
  for (const [v, rotulo] of opcoes) sel.appendChild(new Option(rotulo, v));
  sel.value = opcoes.some(([v]) => v === valor) ? valor : '';
}

/**
 * As opções de cada filtro vêm do recorte que os OUTROS filtros produzem, para
 * nunca oferecer uma combinação vazia (ex.: comarcas de uma UF já escolhida).
 */
function atualizarOpcoes() {
  const { registros, referencia } = estado.base;
  const f = estado.filtros;
  const opcoesDe = (campo) => filtrar(registros, f, referencia, { ignorar: [campo] });

  const ufs = valoresUnicos(opcoesDe('uf'), 'uf');
  preencherSelect($('#fUf'), ufs.map((u) => [u, `${u} — ${NOMES_UF[u] || u}`]), f.uf, 'Todas as UFs');

  const comarcas = [...agrupar(opcoesDe('municipio'), chaveComarca).values()]
    .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
  preencherSelect($('#fMunicipio'), comarcas.map((g) => [g.chave, `${g.chave.replace('/', ' — ')} (${g.total})`]), f.municipio, 'Todas as comarcas');

  const adversas = [...agrupar(opcoesDe('adversa'), (r) => r.adversa).values()].sort((a, b) => b.total - a.total);
  preencherSelect($('#fAdversa'), adversas.map((g) => [g.chave, `${g.chave} (${g.total})`]), f.adversa, 'Todas as partes adversas');

  const teses = [...agrupar(opcoesDe('tese'), (r) => r.tese).values()].sort((a, b) => b.total - a.total);
  preencherSelect($('#fTese'), teses.map((g) => [g.chave, `${TESES[g.chave] || g.chave} (${g.total})`]), f.tese, 'Todas as teses');

  const resultados = agrupar(opcoesDe('resultado'), (r) => r.resultado);
  const opcoesResultado = [['decididos', 'Com decisão de mérito']];
  for (const chave of [...ORDEM_RESULTADO, 'pendente']) {
    if (resultados.has(chave)) opcoesResultado.push([chave, `${RESULTADOS[chave]} (${resultados.get(chave).total})`]);
  }
  preencherSelect($('#fResultado'), opcoesResultado, f.resultado, 'Todos os resultados');

  const anos = [...new Set(registros.map((r) => r.distribuicao?.slice(0, 4)).filter(Boolean))].sort().reverse();
  preencherSelect($('#fPeriodo'), [
    ['3m', 'Distribuídos nos últimos 3 meses'],
    ['6m', 'Distribuídos nos últimos 6 meses'],
    ['12m', 'Distribuídos nos últimos 12 meses'],
    ...anos.map((a) => [a, `Distribuídos em ${a}`]),
  ], f.periodo, 'Qualquer distribuição');

  const responsaveis = valoresUnicos(opcoesDe('responsavel'), 'responsavel');
  preencherSelect($('#fResponsavel'), responsaveis.map((r) => [r, r]), f.responsavel, 'Todos os responsáveis');

  $$('[data-escopo]').forEach((b) => {
    const ativo = b.dataset.escopo === f.escopo;
    b.classList.toggle('aba--ativa', ativo);
    b.setAttribute('aria-checked', String(ativo));
  });
  $('#busca').value = f.busca;
}

function definirFiltro(campo, valor, { redesenharOpcoes = true } = {}) {
  estado.filtros[campo] = valor;
  if (campo === 'uf' && valor && estado.filtros.municipio && !estado.filtros.municipio.endsWith(`/${valor}`)) {
    estado.filtros.municipio = '';
  }
  estado.pagina = 1;
  salvarFiltros();
  if (redesenharOpcoes) atualizarOpcoes();
  renderizar();
}

function ligarFiltros() {
  const mapa = {
    '#fUf': 'uf', '#fMunicipio': 'municipio', '#fAdversa': 'adversa', '#fTese': 'tese',
    '#fResultado': 'resultado', '#fPeriodo': 'periodo', '#fResponsavel': 'responsavel',
  };
  for (const [sel, campo] of Object.entries(mapa)) {
    $(sel).addEventListener('change', (e) => {
      if (campo === 'municipio' && e.target.value) estado.filtros.uf = e.target.value.split('/').pop();
      definirFiltro(campo, e.target.value);
    });
  }
  $$('[data-escopo]').forEach((b) => b.addEventListener('click', () => definirFiltro('escopo', b.dataset.escopo)));
  let espera = null;
  $('#busca').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => definirFiltro('busca', e.target.value, { redesenharOpcoes: false }), 180);
  });
  $('#btnLimpar').addEventListener('click', () => {
    estado.filtros = { ...FILTROS_PADRAO, escopo: estado.filtros.escopo };
    estado.pagina = 1;
    salvarFiltros();
    atualizarOpcoes();
    renderizar();
  });
}

/* ================= segmentos (métrica, nível) ================= */

function ligarSegmento(grupo, atributo, aoEscolher) {
  $$(`${grupo} [data-${atributo}]`).forEach((b) => b.addEventListener('click', () => {
    $$(`${grupo} [data-${atributo}]`).forEach((o) => {
      const ativo = o === b;
      o.classList.toggle('segmento__opcao--ativa', ativo);
      o.setAttribute('aria-checked', String(ativo));
    });
    aoEscolher(b.dataset[atributo]);
  }));
}

/* ================= indicadores ================= */

function renderizarIndicadores(recorte, g) {
  const total = estado.base.registros.length;
  $('#kpiProcessos').textContent = fmtInt.format(g.total);
  $('#kpiProcessosNota').textContent = g.total === total ? 'toda a base' : `de ${fmtInt.format(total)} na base`;
  $('#kpiUfs').textContent = fmtInt.format(g.ufs);
  $('#kpiComarcasNota').textContent = `${fmtInt.format(g.comarcas)} ${g.comarcas === 1 ? 'comarca identificada' : 'comarcas identificadas'}`;
  $('#kpiDecididos').textContent = fmtInt.format(g.decididos);
  $('#kpiDecididosNota').textContent = g.total ? `${pct(g.decididos / g.total)} dos processos${g.sem_merito ? ` · ${g.sem_merito} extinç${g.sem_merito === 1 ? 'ão' : 'ões'}` : ''}` : '';
  $('#kpiTaxa').textContent = pct(g.taxa);
  $('#kpiTaxaNota').textContent = g.decididos
    ? `${g.procedente} proc. · ${g.parcial} parc. · ${g.acordo} acordo${g.acordo === 1 ? '' : 's'} · ${g.improcedente} improc.`
    : 'sem decisões no recorte';
  $('#kpiLiminares').textContent = fmtInt.format(g.liminares);
  $('#kpiLiminaresNota').textContent = g.total ? `${pct(g.liminares / g.total)} dos processos` : '';

  const aviso = $('#avisoAmostra');
  if (g.total && g.decididos < 30) {
    aviso.hidden = false;
    aviso.textContent = `Amostra pequena: ${g.decididos} ${g.decididos === 1 ? 'decisão' : 'decisões'} de mérito conhecida${g.decididos === 1 ? '' : 's'} em ${fmtInt.format(g.total)} processos. `
      + 'As taxas por localidade são ajustadas pela média para não premiar acaso; etiquetar no Astrea os processos sentenciados aumenta a precisão.';
  } else aviso.hidden = true;
}

/* ================= mapa ================= */

function renderizarLegendaMapa() {
  const alvo = $('#mapaLegenda');
  alvo.replaceChildren();
  const item = (cor, rotulo, classe = '') => {
    const i = criar('span', `legenda__item ${classe}`);
    const chip = criar('span', 'legenda__chip');
    if (cor.startsWith('url')) chip.classList.add('legenda__chip--hachura');
    else chip.style.background = cor;
    i.append(chip, document.createTextNode(rotulo));
    alvo.appendChild(i);
  };
  if (estado.metrica === 'volume') {
    alvo.appendChild(criar('span', 'legenda__titulo', 'Processos por UF'));
    CLASSES_VOLUME.forEach((c) => item(c.cor, c.rotulo));
  } else if (estado.metrica === 'exito') {
    alvo.appendChild(criar('span', 'legenda__titulo', 'Êxito ajustado'));
    CLASSES_EXITO.forEach((c) => item(c.cor, c.rotulo));
    item('url(#h)', 'sem decisões');
  } else {
    alvo.appendChild(criar('span', 'legenda__titulo', 'Recomendação'));
    for (const [chave, rec] of Object.entries(RECOMENDACOES)) item(CORES_RECOMENDACAO[chave], `${rec.icone} ${rec.rotulo}`);
  }
  if (estado.mostrarComarcas) {
    const b = criar('span', 'legenda__item legenda__item--bolha');
    const bolha = criar('span', `legenda__bolha${estado.metrica === 'volume' ? '' : ' legenda__bolha--cor'}`);
    b.append(bolha, document.createTextNode('área da bolha = processos na comarca'));
    alvo.appendChild(b);
  }
}

function renderizarMapa(rankUf, rankComarca) {
  const ufs = new Map(rankUf.grupos.map((g) => [g.chave, g]));
  estado.mapa.atualizar({
    ufs,
    comarcas: rankComarca.grupos.filter((g) => g.identificada),
    metrica: estado.metrica,
    ufFoco: estado.filtros.uf,
    comarcaFoco: estado.filtros.municipio,
    mostrarComarcas: estado.mostrarComarcas,
  });
  $('#btnBrasil').hidden = !estado.filtros.uf;
  const semBolha = rankComarca.grupos.filter((g) => !g.identificada).reduce((s, g) => s + g.total, 0);
  $('#mapaSub').textContent = semBolha
    ? `Clique numa UF para aproximar e filtrar. ${semBolha} processo${semBolha === 1 ? '' : 's'} sem comarca identificável (ex.: Núcleo de Justiça 4.0) conta${semBolha === 1 ? '' : 'm'} só na UF.`
    : 'Clique numa UF para aproximar e filtrar; clique numa bolha para ver a comarca.';
  renderizarLegendaMapa();
}

/* ================= onde investir ================= */

function seloRecomendacao(chave) {
  const rec = RECOMENDACOES[chave];
  const s = criar('span', `rec rec--${chave}`, `${rec.icone} ${rec.rotulo}`);
  s.title = rec.descricao;
  return s;
}

function renderizarInvestir(rankUf, rankComarca) {
  const lista = $('#listaInvestir');
  lista.replaceChildren();
  const grupos = (estado.nivelFoco === 'uf' ? rankUf.grupos : rankComarca.grupos.filter((g) => g.identificada)).slice(0, 8);
  if (!grupos.length) {
    lista.appendChild(criar('li', 'investir__vazio', 'Nenhuma localidade no recorte atual.'));
    return;
  }
  grupos.forEach((g, i) => {
    const li = criar('li', 'investir__item');
    const botao = criar('button', 'investir__botao');
    botao.type = 'button';
    botao.title = `Filtrar ${g.nome}`;
    botao.addEventListener('click', () => {
      if (estado.nivelFoco === 'uf') definirFiltro('uf', g.chave);
      else { estado.filtros.uf = g.uf; definirFiltro('municipio', g.chave); }
    });
    const topo = criar('span', 'investir__topo');
    topo.append(
      criar('span', 'investir__pos', String(i + 1)),
      criar('span', 'investir__nome', estado.nivelFoco === 'uf' ? `${g.nome}` : `${g.nome} — ${g.uf}`),
      seloRecomendacao(g.recomendacao),
    );
    const medidor = criar('span', 'medidor');
    medidor.setAttribute('role', 'meter');
    medidor.setAttribute('aria-valuemin', '0');
    medidor.setAttribute('aria-valuemax', '100');
    medidor.setAttribute('aria-valuenow', String(g.indice));
    medidor.setAttribute('aria-label', `Índice ${g.indice}`);
    const preenchido = criar('span', 'medidor__valor');
    preenchido.style.width = `${g.indice}%`;
    medidor.appendChild(preenchido);
    const detalhe = criar('span', 'investir__detalhe');
    detalhe.append(
      criar('strong', null, `Índice ${g.indice}`),
      document.createTextNode(` · ${g.total} processo${g.total === 1 ? '' : 's'}`
        + ` · ${g.decididos ? `êxito ${g.exitos}/${g.decididos}` : 'sem decisões'}`
        + `${g.liminares ? ` · ${g.liminares} liminar${g.liminares === 1 ? '' : 'es'}` : ''}`),
    );
    botao.append(topo, medidor, detalhe);
    li.appendChild(botao);
    lista.appendChild(li);
  });
}

/* ================= ranking ================= */

const ORDEM_REC = { escalar: 0, testar: 1, cautela: 2, observar: 3 };

function ordenar(lista, { campo, asc }) {
  const fator = asc ? 1 : -1;
  return [...lista].sort((a, b) => {
    let va = a[campo];
    let vb = b[campo];
    if (campo === 'recomendacao') { va = ORDEM_REC[va]; vb = ORDEM_REC[vb]; }
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return fator * va.localeCompare(vb, 'pt-BR');
    return fator * (va - vb);
  });
}

function renderizarRanking(rankUf, rankComarca) {
  const rank = estado.nivelRanking === 'uf' ? rankUf : rankComarca;
  rank.grupos.forEach((g, i) => { g.posicao = i + 1; });
  const todas = ordenar(rank.grupos, estado.ordemRanking);
  const linhas = estado.rankingCompleto ? todas : todas.slice(0, LINHAS_RANKING);
  const corpo = $('#corpoRanking');
  corpo.replaceChildren();
  $('#rankingSub').textContent = `${rank.grupos.length} ${estado.nivelRanking === 'uf' ? 'UFs' : 'localidades'} · média de êxito do escopo: ${pct(rank.media)} (referência do ajuste)`;

  for (const g of linhas) {
    const tr = document.createElement('tr');
    tr.className = `linha-rec linha-rec--${g.recomendacao}`;
    const td = (texto, classe = '') => { const c = criar('td', classe, texto); tr.appendChild(c); return c; };
    td(String(g.posicao), 'num');
    const nome = td('', 'col-local');
    const link = criar('button', 'link-celula', estado.nivelRanking === 'uf' ? `${g.nome} (${g.uf})` : `${g.nome} — ${g.uf}`);
    link.type = 'button';
    link.addEventListener('click', () => {
      if (estado.nivelRanking === 'uf') definirFiltro('uf', g.chave);
      else { estado.filtros.uf = g.uf; definirFiltro('municipio', g.chave); }
      $('#mapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    nome.appendChild(link);
    td(fmtInt.format(g.total), 'num');
    td(pct(g.participacao), 'num');
    td(g.decididos ? String(g.decididos) : '—', 'num');
    const res = td('', 'resultados-col');
    const mini = criar('span', 'mini-pilha');
    for (const chave of ORDEM_RESULTADO) {
      if (!g[chave] || chave === 'sem_merito') continue;
      const s = criar('span', 'mini-pilha__seg');
      s.style.flexGrow = g[chave];
      s.style.background = CORES_RESULTADO[chave];
      s.title = `${RESULTADOS[chave]}: ${g[chave]}`;
      mini.appendChild(s);
    }
    res.append(mini, criar('span', 'mini-pilha__texto', g.decididos ? `${g.procedente} · ${g.parcial} · ${g.acordo} · ${g.improcedente}` : '—'));
    td(g.taxa == null ? '—' : pct(g.taxa), 'num');
    td(pct(g.exitoAjustado), 'num');
    td(g.liminares ? String(g.liminares) : '—', 'num');
    td(String(g.indice), 'num num--forte');
    const rec = td('', '');
    rec.appendChild(seloRecomendacao(g.recomendacao));
    rec.appendChild(criar('small', 'confianca', `confiança ${g.confianca}`));
    corpo.appendChild(tr);
  }
  const mais = $('#maisRanking');
  mais.replaceChildren();
  if (todas.length > LINHAS_RANKING) {
    const b = criar('button', 'btn btn--fantasma btn--mini', estado.rankingCompleto
      ? `Mostrar só as ${LINHAS_RANKING} primeiras`
      : `Mostrar todas as ${todas.length} ${estado.nivelRanking === 'uf' ? 'UFs' : 'localidades'}`);
    b.type = 'button';
    b.addEventListener('click', () => { estado.rankingCompleto = !estado.rankingCompleto; renderizar(); });
    mais.appendChild(b);
  }
  $$('#tabelaRanking th[data-ordenar]').forEach((th) => {
    th.classList.toggle('ordenado', th.dataset.ordenar === estado.ordemRanking.campo);
    th.dataset.dir = th.dataset.ordenar === estado.ordemRanking.campo ? (estado.ordemRanking.asc ? '↑' : '↓') : '';
  });
}

function ligarOrdenacaoRanking() {
  $$('#tabelaRanking th[data-ordenar]').forEach((th) => th.addEventListener('click', () => {
    const campo = th.dataset.ordenar;
    const texto = campo === 'nome' || campo === 'posicao';
    estado.ordemRanking = estado.ordemRanking.campo === campo
      ? { campo, asc: !estado.ordemRanking.asc }
      : { campo, asc: texto };
    renderizar();
  }));
}

/* ================= gráficos ================= */

function renderizarGraficos(recorte, rankUf) {
  const porUf = [...rankUf.grupos].sort((a, b) => (b.decididos + b.sem_merito) - (a.decididos + a.sem_merito) || b.total - a.total);
  porUf.forEach((g) => { g.rotuloCurto = g.uf; });
  barrasResultado($('#graficoResultados'), porUf, { aoClicar: (g) => definirFiltro('uf', g.chave) });

  const ufsTopo = [...rankUf.grupos].sort((a, b) => b.total - a.total).slice(0, 6).map((g) => g.chave).filter(Boolean);
  matrizTeses($('#graficoTeses'), recorte, {
    ufs: ufsTopo,
    aoClicar: (tese, uf) => {
      estado.filtros.tese = tese;
      if (uf) estado.filtros.uf = uf;
      definirFiltro('tese', tese);
    },
  });

  colunasMes($('#graficoMeses'), porMes(recorte));

  const adversas = [...agrupar(recorte, (r) => r.adversa || 'Não identificada').values()]
    .map((g) => ({ ...g, nome: g.chave, taxa: g.decididos ? g.exitos / g.decididos : null }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  barrasSimples($('#graficoAdversas'), adversas, {
    aoClicar: (item) => item.nome !== 'Não identificada' && definirFiltro('adversa', item.nome),
  });
}

/* ================= tabela de processos ================= */

function colunasProcessos() {
  const local = estado.base.origemBase === 'local';
  return [
    ['distribuicao', local ? 'Distribuição' : 'Distribuição (mês)'],
    ...(local ? [['cliente', 'Cliente'], ['numero', 'Processo']] : []),
    ['uf', 'UF'],
    ['municipio', 'Comarca'],
    ['unidade', 'Unidade'],
    ['adversa', 'Parte adversa'],
    ['tese', 'Tese'],
    ['situacao', 'Situação'],
    ['resultado', 'Resultado'],
    ['liminar', 'Liminar'],
  ];
}

function textoCelula(r, campo) {
  switch (campo) {
    case 'distribuicao': return fmtData(r.distribuicao);
    case 'municipio': return r.municipio || (r.unidade === 'Núcleo de Justiça 4.0' ? 'Núcleo 4.0 (estadual)' : '—');
    case 'tese': return TESES[r.tese] || r.tese;
    case 'situacao': return SITUACOES[r.situacao] || r.situacao;
    case 'resultado': return RESULTADOS[r.resultado];
    case 'liminar': return r.liminar === 'deferida' ? 'Deferida' : r.liminar === 'indeferida' ? 'Indeferida' : '—';
    default: return r[campo] ?? '—';
  }
}

function renderizarProcessos(recorte) {
  const colunas = colunasProcessos();
  const cab = $('#cabecalhoProcessos');
  cab.replaceChildren();
  for (const [campo, rotulo] of colunas) {
    const th = criar('th', campo === 'distribuicao' ? 'col-data' : '', rotulo);
    th.dataset.ordenar = campo;
    if (estado.ordemProcessos.campo === campo) { th.classList.add('ordenado'); th.dataset.dir = estado.ordemProcessos.asc ? '↑' : '↓'; }
    th.addEventListener('click', () => {
      estado.ordemProcessos = estado.ordemProcessos.campo === campo
        ? { campo, asc: !estado.ordemProcessos.asc } : { campo, asc: campo !== 'distribuicao' };
      renderizarProcessos(recorte);
    });
    cab.appendChild(th);
  }

  const { campo, asc } = estado.ordemProcessos;
  const ordenados = [...recorte].sort((a, b) => {
    const va = campo === 'resultado' ? [...ORDEM_RESULTADO, 'pendente'].indexOf(a.resultado) : textoCelula(a, campo);
    const vb = campo === 'resultado' ? [...ORDEM_RESULTADO, 'pendente'].indexOf(b.resultado) : textoCelula(b, campo);
    const base = campo === 'distribuicao' ? String(a.distribuicao || '').localeCompare(String(b.distribuicao || ''))
      : typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
    return asc ? base : -base;
  });
  const paginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA));
  estado.pagina = Math.min(estado.pagina, paginas);
  const inicio = (estado.pagina - 1) * POR_PAGINA;
  const pagina = ordenados.slice(inicio, inicio + POR_PAGINA);

  const corpo = $('#corpoProcessos');
  corpo.replaceChildren();
  for (const r of pagina) {
    const tr = document.createElement('tr');
    for (const [c] of colunas) {
      const td = criar('td', c === 'distribuicao' ? 'col-data' : c === 'numero' ? 'col-processo' : '');
      if (c === 'resultado') {
        const selo = criar('span', `selo-resultado selo-resultado--${r.resultado}`, RESULTADOS[r.resultado]);
        if (r.fonteResultado) selo.title = `Fonte: ${r.fonteResultado === 'etiqueta' ? 'etiqueta do escritório' : r.fonteResultado === 'cumprimento' ? 'cliente executando a sentença' : 'texto do último andamento'}`;
        td.appendChild(selo);
      } else td.textContent = textoCelula(r, c);
      tr.appendChild(td);
    }
    corpo.appendChild(tr);
  }
  if (!pagina.length) {
    const tr = document.createElement('tr');
    const td = criar('td', 'vazio', 'Nenhum processo para os filtros selecionados.');
    td.colSpan = colunas.length;
    tr.appendChild(td);
    corpo.appendChild(tr);
  }

  $('#processosSub').textContent = `${fmtInt.format(recorte.length)} processo${recorte.length === 1 ? '' : 's'}`
    + (estado.base.origemBase === 'local' ? ' · base local, com cliente e número' : ' · base publicada, anonimizada');

  const nav = $('#paginacao');
  nav.replaceChildren();
  if (paginas > 1) {
    const botao = (rotulo, alvo, desabilitado) => {
      const b = criar('button', 'btn-nav', rotulo);
      b.type = 'button';
      b.disabled = desabilitado;
      b.addEventListener('click', () => { estado.pagina = alvo; renderizarProcessos(recorte); });
      nav.appendChild(b);
    };
    botao('‹', estado.pagina - 1, estado.pagina === 1);
    nav.appendChild(criar('span', 'paginacao__texto', `Página ${estado.pagina} de ${paginas}`));
    botao('›', estado.pagina + 1, estado.pagina === paginas);
  }
}

/* ================= exportação ================= */

function baixarCsv(nome, cabecalho, linhas) {
  const escapar = (v) => {
    const t = String(v ?? '');
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // Ponto e vírgula e BOM: o Excel em português abre direto, com acentos.
  const csv = `﻿${[cabecalho, ...linhas].map((l) => l.map(escapar).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const decimal = (v) => (v == null ? '' : v.toFixed(3).replace('.', ','));

function exportarRanking() {
  const rank = estado.ultimo[estado.nivelRanking === 'uf' ? 'rankUf' : 'rankComarca'];
  baixarCsv(`ranking-${estado.nivelRanking}-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Posição', 'Localidade', 'UF', 'Processos', 'Decisões de mérito', 'Procedentes', 'Parciais', 'Acordos', 'Improcedentes',
      'Extintos sem mérito', 'Sem decisão', 'Êxito', 'Êxito ajustado', 'Liminares deferidas', 'Índice', 'Recomendação', 'Confiança'],
    rank.grupos.map((g, i) => [i + 1, g.nome, g.uf, g.total, g.decididos, g.procedente, g.parcial, g.acordo, g.improcedente,
      g.sem_merito, g.pendente, decimal(g.taxa), decimal(g.exitoAjustado), g.liminares, g.indice,
      RECOMENDACOES[g.recomendacao].rotulo, g.confianca]));
}

function exportarProcessos() {
  const colunas = colunasProcessos();
  baixarCsv(`processos-${new Date().toISOString().slice(0, 10)}.csv`,
    colunas.map(([, r]) => r),
    estado.ultimo.recorte.map((r) => colunas.map(([c]) => textoCelula(r, c))));
}

async function copiarCidades() {
  const cidades = estado.ultimo.rankComarca.grupos
    .filter((g) => g.identificada && (g.recomendacao === 'escalar' || g.recomendacao === 'testar'))
    .map((g) => `${g.nome}, ${g.uf}`);
  if (!cidades.length) {
    avisar('Nenhuma comarca com recomendação Escalar ou Testar no recorte atual.', true);
    return;
  }
  const texto = cidades.join('\n');
  try {
    await navigator.clipboard.writeText(texto);
    avisar(`${cidades.length} cidade${cidades.length === 1 ? '' : 's'} copiada${cidades.length === 1 ? '' : 's'} — cole na segmentação por local do gerenciador de anúncios.`);
  } catch {
    baixarCsv('cidades-anuncios.csv', ['Cidade, UF'], cidades.map((c) => [c]));
    avisar('A área de transferência está bloqueada; a lista foi baixada em CSV.');
  }
}

/* ================= renderização ================= */

function renderizar() {
  const { registros, referencia } = estado.base;
  const recorte = filtrar(registros, estado.filtros, referencia);
  const g = resumo(recorte);
  // Índice e recomendação saem do escopo inteiro, sem os filtros de UF e
  // comarca, e só depois são recortados: escolher uma UF não muda a nota de uma
  // comarca, e a média de referência do ajuste é sempre a do escopo. O mapa usa
  // o ranking completo — a UF escolhida fica em destaque e as demais seguem
  // visíveis para comparação.
  const f = estado.filtros;
  const semLocal = filtrar(registros, f, referencia, { ignorar: ['uf', 'municipio'] });
  const rankUfBase = ranking(semLocal, 'uf');
  const rankComarcaBase = ranking(semLocal, 'comarca');
  const noRecorte = (grupo, nivel) => (!f.uf || grupo.uf === f.uf) && (nivel === 'uf' || !f.municipio || grupo.chave === f.municipio);
  const rankUf = { ...rankUfBase, grupos: rankUfBase.grupos.filter((x) => noRecorte(x, 'uf')) };
  const rankComarca = { ...rankComarcaBase, grupos: rankComarcaBase.grupos.filter((x) => noRecorte(x, 'comarca')) };
  estado.ultimo = { recorte, rankUf, rankComarca };

  renderizarIndicadores(recorte, g);
  renderizarMapa(rankUfBase, rankComarcaBase);
  renderizarInvestir(rankUf, rankComarca);
  renderizarRanking(rankUf, rankComarca);
  renderizarGraficos(recorte, rankUf);
  renderizarProcessos(recorte);
}

function descreverBase() {
  const b = estado.base;
  const ponto = $('#basePonto');
  ponto.className = 'sinc__ponto sinc__ponto--ok';
  const ref = b.referencia ? ` · ${fmtData(b.referencia)}` : '';
  $('#baseTexto').textContent = `${b.origemBase === 'local' ? 'Base local' : 'Base publicada'} · ${fmtInt.format(b.registros.length)} processos${ref}`;
  $('#base').title = b.referencia ? `Último andamento registrado na base: ${fmtData(b.referencia)}` : '';
  $('#campoBusca').hidden = b.origemBase !== 'local';
  $('#blocoBaseLocal').hidden = !lerBaseLocal();
  $('#baseAtual').textContent = b.origemBase === 'local'
    ? `Em uso: base local importada de “${b.fonte}” em ${fmtData(b.geradoEm)}, com ${fmtInt.format(b.registros.length)} processos (inclui cliente e número do processo).`
    : `Em uso: base publicada, anonimizada, gerada em ${fmtData(b.geradoEm)} com ${fmtInt.format(b.registros.length)} processos.`;
}

function usarBase(base) {
  estado.base = base;
  if (base.origemBase !== 'local') estado.filtros.busca = '';
  descreverBase();
  atualizarOpcoes();
  renderizar();
}

/* ================= importação ================= */

async function importarArquivo(arquivo) {
  const progresso = $('#baseProgresso');
  progresso.hidden = false;
  progresso.className = 'base-progresso';
  progresso.textContent = `Lendo ${arquivo.name}…`;
  try {
    const linhas = arquivo.name.toLowerCase().endsWith('.csv')
      ? lerCsv(await arquivo.text())
      : await lerXlsx(await arquivo.arrayBuffer());
    if (!linhas.length || !('Número' in linhas[0])) {
      throw new Error('A planilha não tem a coluna "Número". Use a exportação de processos do Astrea.');
    }
    progresso.textContent = `Classificando ${linhas.length} linhas…`;
    const [municipios, origens] = await Promise.all([carregarMunicipios(), carregarOrigens()]);
    const registros = classificarPlanilha(linhas, criarIndiceMunicipios(municipios), origens);
    const datas = registros.map((r) => r.ultimoAndamento).filter(Boolean).sort();
    const base = {
      versao: 1,
      geradoEm: new Date().toISOString().slice(0, 10),
      referencia: datas.at(-1) || null,
      fonte: arquivo.name,
      total: registros.length,
      registros,
      origemBase: 'local',
    };
    const salvo = gravarBaseLocal(base);
    usarBase(base);
    const semComarca = registros.filter((r) => !r.municipio).length;
    const decididos = registros.filter((r) => r.resultado !== 'pendente').length;
    progresso.textContent = `${registros.length} processos importados · ${decididos} com resultado conhecido · ${semComarca} sem comarca identificável.`
      + (salvo ? '' : ' Atenção: o navegador não permitiu salvar a base; ela vale só até fechar esta aba.');
    avisar(`Base atualizada: ${registros.length} processos.`);
  } catch (erro) {
    console.error(erro);
    progresso.className = 'base-progresso base-progresso--erro';
    progresso.textContent = erro.message || 'Não foi possível ler a planilha.';
    avisar('Falha ao importar a planilha.', true);
  }
}

function ligarBase() {
  $('#btnBase').addEventListener('click', () => {
    $('#baseProgresso').hidden = true;
    $('#modalBase').showModal();
  });
  $('#arquivoBase').addEventListener('change', (e) => {
    const arquivo = e.target.files?.[0];
    if (arquivo) importarArquivo(arquivo);
    e.target.value = '';
  });
  const area = $('#areaSoltar');
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('soltar--ativo'); });
  area.addEventListener('dragleave', () => area.classList.remove('soltar--ativo'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('soltar--ativo');
    const arquivo = e.dataTransfer?.files?.[0];
    if (arquivo) importarArquivo(arquivo);
  });
  $('#btnUsarPublicada').addEventListener('click', () => {
    if (estado.publicada) usarBase(estado.publicada);
    avisar('Exibindo a base publicada. A base local continua salva.');
  });
  $('#btnApagarLocal').addEventListener('click', () => {
    apagarBaseLocal();
    if (estado.publicada) usarBase(estado.publicada);
    $('#blocoBaseLocal').hidden = true;
    avisar('Base local apagada deste navegador.');
  });
}

/* ================= metodologia ================= */

function renderizarMetodologia() {
  const lista = $('#listaRecomendacoes');
  lista.replaceChildren();
  const regras = {
    escalar: 'pelo menos 3 decisões de mérito, êxito bruto ≥ 60% e êxito ajustado acima da média.',
    cautela: 'pelo menos 2 decisões de mérito e êxito bruto abaixo de 40%.',
    testar: '3 ou mais processos, ou alguma liminar deferida, ou êxito de pelo menos 50% nas decisões existentes.',
    observar: 'demais casos — pouco volume e nenhum sinal de resultado.',
  };
  for (const [chave, rec] of Object.entries(RECOMENDACOES)) {
    const li = document.createElement('li');
    li.append(seloRecomendacao(chave), document.createTextNode(` ${rec.descricao} Critério: ${regras[chave]}`));
    lista.appendChild(li);
  }
  // Mantém o texto da fórmula em sincronia com a constante do código.
  $$('.formula')[0].textContent = `êxito ajustado = (êxitos + ${K_PRIOR} × média) ÷ (decisões + ${K_PRIOR})`;
}

/* ================= início ================= */

async function iniciar() {
  lerFiltrosSalvos();
  ligarFiltros();
  ligarBase();
  ligarOrdenacaoRanking();
  legendaResultados($('#legendaResultados'));
  renderizarMetodologia();

  ligarSegmento('#grupoMetrica', 'metrica', (v) => { estado.metrica = v; renderizar(); });
  ligarSegmento('#grupoNivelFoco', 'nivel', (v) => { estado.nivelFoco = v; renderizar(); });
  ligarSegmento('#grupoNivelRanking', 'nivel', (v) => { estado.nivelRanking = v; renderizar(); });
  $('#mostrarComarcas').addEventListener('change', (e) => { estado.mostrarComarcas = e.target.checked; renderizar(); });
  $('#btnBrasil').addEventListener('click', () => {
    estado.filtros.municipio = '';
    definirFiltro('uf', '');
  });
  $('#btnCsvRanking').addEventListener('click', exportarRanking);
  $('#btnCsvProcessos').addEventListener('click', exportarProcessos);
  $('#btnCopiarCidades').addEventListener('click', copiarCidades);

  try {
    const geo = await (await fetch('assets/data/brasil-uf.json')).json();
    estado.mapa = criarMapa($('#mapa'), geo, {
      aoClicarUf: (uf) => {
        estado.filtros.municipio = '';
        definirFiltro('uf', estado.filtros.uf === uf ? '' : uf);
      },
      aoClicarComarca: (c) => {
        estado.filtros.uf = c.uf;
        definirFiltro('municipio', estado.filtros.municipio === c.chave ? '' : c.chave);
      },
    });
  } catch (erro) {
    console.error(erro);
    $('#mapa').textContent = 'Não foi possível carregar o mapa.';
  }

  try {
    estado.publicada = await carregarBasePublicada();
  } catch (erro) {
    console.error(erro);
  }
  const local = lerBaseLocal();
  const base = local || estado.publicada;
  if (!base) {
    $('#basePonto').className = 'sinc__ponto sinc__ponto--erro';
    $('#baseTexto').textContent = 'Base indisponível — importe a planilha do Astrea';
    return;
  }
  usarBase(base);
}

iniciar();
