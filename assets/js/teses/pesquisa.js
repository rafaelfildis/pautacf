/* PAUTA CF — Pesquisa nacional de teses (DJEN + DataJud).
 *
 * Roda no navegador de quem usa o painel. O DJEN (Comunica PJe) é consultado
 * por tribunal, palavra-chave e período de disponibilização; cada publicação
 * de sentença é lida (assets/js/teses/sentenca.js) para extrair resultado e
 * dano moral. O DataJud, que não aceita chamadas de páginas web, só é usado
 * pelo intermediário configurado no botão ⚙ (worker/proxy-tribunais.js).
 * Nada é gravado no servidor: os resultados ficam só nesta aba do navegador.
 */

import {
  RESULTADOS_SENTENCA, classificarSentenca, contemPalavras, normalizarTexto, pareceAcordao, pareceSentenca, textoLimpo,
} from './sentenca.js';

const $ = (sel) => document.querySelector(sel);
const fmtInt = new Intl.NumberFormat('pt-BR');
const fmtReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtRealExato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const DJEN_DIRETO = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const POR_PAGINA = 100;
const MAX_PAGINAS = 10; // até 1.000 publicações por tribunal e pesquisa
const PAUSA_MS = 600;
const DJ_POR_PAGINA = 100;
const DJ_MAX_PAGINAS = 10;
const ITENS_LISTA = 40;
const PERIODO_MAXIMO_DIAS = 62;
const CHAVE_CONFIG = 'pautacf.pesquisa.v1';

const GRUPOS = {
  nordeste: ['TJAL', 'TJBA', 'TJCE', 'TJMA', 'TJPB', 'TJPE', 'TJPI', 'TJRN', 'TJSE'],
  sul: ['TJPR', 'TJRS', 'TJSC'],
  sudeste: ['TJES', 'TJMG', 'TJRJ', 'TJSP'],
};

const SENT_DJ = { 219: 'procedente', 11795: 'procedente', 221: 'parcial', 220: 'improcedente', 471: 'improcedente', 466: 'acordo' };
const EXT_DJ = new Set([454, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 11374, 11375, 11376, 11377, 11378, 11379, 11380, 11381]);

const estado = {
  config: { proxy: '', proxyDjen: false },
  registros: new Map(),
  lidas: 0,
  filtro: 'todas',
  pagina: 1,
  controle: null,
  consulta: null,
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
const espera = (ms, sinal) => new Promise((ok, falha) => {
  const t = setTimeout(ok, ms);
  sinal?.addEventListener('abort', () => { clearTimeout(t); falha(new DOMException('Cancelada', 'AbortError')); }, { once: true });
});
const linkSeguro = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : null);
const dataBr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function lerConfig() {
  try { Object.assign(estado.config, JSON.parse(localStorage.getItem(CHAVE_CONFIG) || '{}')); } catch { /* sem armazenamento */ }
}
function gravarConfig() {
  try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(estado.config)); } catch { /* sem armazenamento */ }
}
const proxy = () => String(estado.config.proxy || '').trim().replace(/\/+$/, '');

function indiceDataJud(sigla) {
  if (sigla === 'TJDFT') return 'api_publica_tjdft';
  if (/^TJ[A-Z]{2}$/.test(sigla)) return `api_publica_${sigla.toLowerCase()}`;
  const trf = sigla.match(/^TRF(\d)$/);
  return trf ? `api_publica_trf${trf[1]}` : null;
}

/** Chave que junta publicações repetidas da mesma sentença (uma por destinatário). */
function chaveRegistro(item) {
  const proc = String(item.numeroprocessocommascara || item.numero_processo || '').replace(/\D/g, '');
  const n = normalizarTexto(item.texto).slice(0, 3000);
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0;
  return `${item.siglaTribunal || ''}|${proc}|${h}`;
}

// ------------------------------------------------------------------ DJEN

async function consultarDjen(params, sinal) {
  const viaProxy = proxy() && estado.config.proxyDjen;
  const base = viaProxy ? `${proxy()}/djen/comunicacao` : DJEN_DIRETO;
  const url = `${base}?${new URLSearchParams(params)}`;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let resp;
    try {
      resp = await fetch(url, { signal: sinal, headers: { Accept: 'application/json' } });
    } catch (erro) {
      if (erro.name === 'AbortError') throw erro;
      const e = new Error(viaProxy
        ? 'o intermediário não respondeu'
        : 'o DJEN recusou a chamada deste navegador (acesso fora do Brasil ou bloqueio do navegador). Configure o intermediário em ⚙ e marque "Usar o intermediário também para o DJEN".');
      e.bloqueio = true;
      throw e;
    }
    if (resp.status === 429 || resp.status >= 500) { await espera(2500 * (tentativa + 1), sinal); continue; }
    if (resp.status === 403) {
      const e = new Error('o DJEN respondeu 403: a API só aceita acessos feitos do Brasil.');
      e.bloqueio = true;
      throw e;
    }
    if (!resp.ok) throw new Error(`DJEN respondeu HTTP ${resp.status}`);
    const json = await resp.json();
    const itens = json.items || json.itens || json.data || json.result || [];
    return { itens: Array.isArray(itens) ? itens : [], total: Number(json.count ?? json.total ?? 0) || null };
  }
  throw new Error('DJEN sem resposta após novas tentativas');
}

function aceitar(item, consulta) {
  const texto = item.texto || '';
  if (!contemPalavras(texto, consulta.chave)) return false;
  if (consulta.parte) {
    const nomes = [...(item.destinatarios || []).map((d) => d.nome), texto].join(' ');
    if (!contemPalavras(nomes, `"${consulta.parte}"`)) return false;
  }
  if (consulta.tipo === 'sentenca') return pareceSentenca(item);
  if (consulta.tipo === 'sentenca_acordao') return pareceSentenca(item) || pareceAcordao(item);
  return true;
}

function registrar(item, tribunal) {
  const chave = chaveRegistro(item);
  if (estado.registros.has(chave)) return false;
  const acordao = pareceAcordao(item);
  const c = acordao ? { resultado: 'nao_classificado', danoMoral: null, valorDanoMoral: null, trecho: textoLimpo(item.texto).slice(0, 900) } : classificarSentenca(item.texto);
  const passivo = (item.destinatarios || []).filter((d) => /^p/i.test(String(d.polo || ''))).map((d) => d.nome).filter(Boolean);
  estado.registros.set(chave, {
    tribunal: item.siglaTribunal || tribunal,
    orgao: item.nomeOrgao || '—',
    processo: item.numeroprocessocommascara || item.numero_processo || '—',
    data: item.data_disponibilizacao || item.datadisponibilizacao || null,
    tipo: item.tipoDocumento || item.tipoComunicacao || '—',
    classe: item.nomeClasse || '',
    acordao,
    resultado: c.resultado,
    danoMoral: c.danoMoral,
    valor: c.valorDanoMoral,
    trecho: c.trecho,
    link: linkSeguro(item.link),
    certidao: item.hash ? `https://comunicaapi.pje.jus.br/api/v1/comunicacao/${encodeURIComponent(item.hash)}/certidao` : null,
    passivo: [...new Set(passivo)].slice(0, 3).join('; '),
  });
  return true;
}

async function pesquisarTribunal(tribunal, consulta, sinal, avisar) {
  let novas = 0;
  let lidasTribunal = 0;
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const params = {
      siglaTribunal: tribunal,
      texto: consulta.chave.replace(/"/g, ''),
      dataDisponibilizacaoInicio: consulta.inicio,
      dataDisponibilizacaoFim: consulta.fim,
      pagina: String(pagina),
      itensPorPagina: String(POR_PAGINA),
    };
    if (consulta.parte) params.nomeParte = consulta.parte;
    const { itens, total } = await consultarDjen(params, sinal);
    lidasTribunal += itens.length;
    estado.lidas += itens.length;
    for (const item of itens) if (aceitar(item, consulta) && registrar(item, tribunal)) novas += 1;
    avisar(`${tribunal}: ${fmtInt.format(lidasTribunal)}${total ? ` de ${fmtInt.format(total)}` : ''} publicações lidas, ${novas} sentenças`);
    renderizarResultados();
    if (itens.length < POR_PAGINA || (total && lidasTribunal >= total)) return { novas, lidasTribunal, total, completo: true };
    await espera(PAUSA_MS, sinal);
  }
  return { novas, lidasTribunal, total: null, completo: false };
}

// ------------------------------------------------------------------ DataJud

async function panoramaDataJud(tribunal, consulta, sinal) {
  const indice = indiceDataJud(tribunal);
  if (!indice) return { tribunal, erro: 'sem índice no DataJud' };
  const fimDia = `${consulta.fim}T23:59:59`;
  const corpoBase = {
    size: DJ_POR_PAGINA,
    track_total_hits: true,
    query: { bool: { filter: [
      { match_phrase: { 'assuntos.nome': consulta.assunto } },
      { range: { 'movimentos.dataHora': { gte: consulta.inicio, lte: fimDia } } },
      { terms: { 'movimentos.codigo': [...Object.keys(SENT_DJ).map(Number), ...EXT_DJ] } },
    ] } },
    _source: ['numeroProcesso', 'movimentos.codigo', 'movimentos.dataHora'],
    sort: [{ '@timestamp': 'asc' }],
  };
  const c = { tribunal, processos: 0, procedente: 0, parcial: 0, improcedente: 0, extinto: 0, acordo: 0, candidatos: null, lidos: 0 };
  let depois = null;
  for (let pagina = 0; pagina < DJ_MAX_PAGINAS; pagina++) {
    const corpo = depois ? { ...corpoBase, search_after: depois } : corpoBase;
    let resp;
    for (let t = 0; t < 4; t++) {
      resp = await fetch(`${proxy()}/datajud/${indice}/_search`, {
        method: 'POST', signal: sinal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      });
      if (resp.status !== 429 && resp.status < 500) break;
      await espera(3000 * (t + 1), sinal);
    }
    if (!resp.ok) return { ...c, erro: `HTTP ${resp.status}` };
    const json = await resp.json();
    const hits = json.hits?.hits || [];
    c.candidatos = json.hits?.total?.value ?? c.candidatos;
    for (const h of hits) {
      c.lidos += 1;
      // O índice não liga a data ao código do movimento: confere aqui se a
      // sentença em si caiu no período.
      const ev = (h._source?.movimentos || [])
        .filter((m) => (SENT_DJ[m.codigo] || EXT_DJ.has(m.codigo)) && m.dataHora >= consulta.inicio && m.dataHora <= fimDia)
        .sort((a, b) => String(a.dataHora).localeCompare(String(b.dataHora))).at(-1);
      if (!ev) continue;
      c.processos += 1;
      c[SENT_DJ[ev.codigo] || 'extinto'] += 1;
    }
    if (hits.length < DJ_POR_PAGINA) return { ...c, completo: true };
    depois = hits.at(-1).sort;
    await espera(PAUSA_MS, sinal);
  }
  return { ...c, completo: false };
}

// ------------------------------------------------------------------ agregação

function novoGrupo(chave) {
  return { chave, total: 0, procedente: 0, parcial: 0, improcedente: 0, extinto: 0, acordo: 0, nao_classificado: 0, dm: 0, valores: [] };
}
function somar(g, r) {
  g.total += 1;
  g[r.acordao ? 'nao_classificado' : r.resultado] += 1;
  if ((r.resultado === 'procedente' || r.resultado === 'parcial') && r.danoMoral === true) {
    g.dm += 1;
    if (r.valor) g.valores.push(r.valor);
  }
}
function fechar(g) {
  g.procedentes = g.procedente + g.parcial;
  g.merito = g.procedentes + g.improcedente;
  g.sdm = g.procedentes - g.dm;
  return g;
}
function agrupar(lista, chaveDe) {
  const m = new Map();
  for (const r of lista) {
    const k = chaveDe(r);
    if (!m.has(k)) m.set(k, novoGrupo(k));
    somar(m.get(k), r);
  }
  return [...m.values()].map(fechar);
}
function mediana(v) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ------------------------------------------------------------------ desenho

function mostrarDica(evento, titulo, linhas) {
  const d = $('#rDica');
  d.replaceChildren(el('div', { class: 'grafico__dica-titulo' }, titulo),
    ...linhas.map(([rotulo, valor]) => el('div', { class: 'grafico__dica-linha' }, `${rotulo}:`, el('strong', {}, valor))));
  d.hidden = false;
  const caixa = d.parentElement.getBoundingClientRect();
  d.style.left = `${Math.max(8, Math.min(evento.clientX - caixa.left + 14, caixa.width - d.offsetWidth - 8))}px`;
  d.style.top = `${evento.clientY - caixa.top + 14}px`;
}

function renderizarResultados() {
  const lista = [...estado.registros.values()];
  $('#pResultados').hidden = false;
  const t = fechar(lista.reduce((g, r) => { somar(g, r); return g; }, novoGrupo('total')));

  $('#rLidas').textContent = fmtInt.format(lista.length);
  $('#rLidasNota').textContent = `${fmtInt.format(estado.lidas)} publicações lidas no DJEN`;
  $('#rMerito').textContent = fmtInt.format(t.merito);
  $('#rMeritoNota').textContent = `${t.procedentes} procedentes · ${t.improcedente} improcedentes · ${t.extinto} extinções · ${t.acordo} acordos`;
  $('#rTaxa').textContent = pct(t.procedentes, t.merito);
  $('#rTaxaNota').textContent = t.merito ? `${t.procedente} procedentes e ${t.parcial} parciais` : 'sem sentenças de mérito';
  $('#rDm').textContent = pct(t.dm, t.merito);
  $('#rDmNota').textContent = t.merito ? `${t.dm} com dano moral · ${pct(t.dm, t.procedentes)} das procedências` : '—';
  const med = mediana(t.valores);
  $('#rValor').textContent = med ? fmtReal.format(med) : '—';
  $('#rValorNota').textContent = t.valores.length
    ? `mediana de ${t.valores.length} valor${t.valores.length === 1 ? '' : 'es'} · de ${fmtReal.format(Math.min(...t.valores))} a ${fmtReal.format(Math.max(...t.valores))}`
    : 'nenhum valor identificado';

  const porTribunal = agrupar(lista, (r) => r.tribunal).sort((a, b) => b.merito - a.merito || b.total - a.total);
  renderizarBarras(porTribunal);
  renderizarTabelaTribunais(porTribunal, t);
  renderizarOrgaos(lista);
  renderizarDecisoes(lista);
}

function renderizarBarras(grupos) {
  const caixa = $('#rBarras');
  caixa.replaceChildren();
  const comMerito = grupos.filter((g) => g.merito);
  if (!comMerito.length) { caixa.append(el('p', { class: 'vazio' }, 'Nenhuma sentença de mérito encontrada até agora.')); return; }
  for (const g of comMerito) {
    const trilho = el('span', { class: 'barra-tese__trilho' });
    for (const [classe, n, rotulo] of [['dm', g.dm, 'Procedente com dano moral'], ['sdm', g.sdm, 'Procedente sem dano moral ou não identificado'], ['imp', g.improcedente, 'Improcedente']]) {
      if (!n) continue;
      const seg = el('span', { class: `barra-tese__seg barra-tese__seg--${classe}`, style: `flex: ${n} 1 0` });
      seg.addEventListener('mousemove', (e) => mostrarDica(e, g.chave, [[rotulo, `${n} de ${g.merito} (${pct(n, g.merito)})`]]));
      seg.addEventListener('mouseleave', () => { $('#rDica').hidden = true; });
      trilho.append(seg);
    }
    caixa.append(el('div', { class: 'barra-tese', role: 'img', 'aria-label': `${g.chave}: ${g.merito} sentenças de mérito, ${g.procedentes} procedentes (${g.dm} com dano moral), ${g.improcedente} improcedentes` },
      el('span', { class: 'barra-tese__nome' }, g.chave, g.merito < 5 ? el('span', { class: 'selo-amostra' }, 'amostra pequena') : null,
        el('span', { class: 'barra-tese__n' }, `${g.merito} sentença${g.merito === 1 ? '' : 's'} de mérito`)),
      trilho,
      el('span', { class: 'barra-tese__taxa' }, `${pct(g.procedentes, g.merito)} procedência`, el('small', {}, `${pct(g.dm, g.merito)} com dano moral`))));
  }
}

function renderizarTabelaTribunais(grupos, total) {
  const cab = ['Tribunal', 'Sentenças', 'Sentenças de mérito', 'Procedentes', 'Improcedentes', 'Taxa de procedência', 'Com dano moral', 'Taxa com dano moral', 'Dano moral (mediana)', 'Extintos', 'Acordos', 'Não classificadas'];
  const linha = (g, rotulo, Tag = 'td') => el('tr', {},
    el(Tag, {}, rotulo), ...[g.total, g.merito, g.procedentes, g.improcedente].map((v) => el(Tag, { class: 'num' }, fmtInt.format(v))),
    el(Tag, { class: 'num destaque' }, pct(g.procedentes, g.merito)), el(Tag, { class: 'num' }, fmtInt.format(g.dm)),
    el(Tag, { class: 'num' }, pct(g.dm, g.merito)), el(Tag, { class: 'num' }, mediana(g.valores) ? fmtReal.format(mediana(g.valores)) : '—'),
    ...[g.extinto, g.acordo, g.nao_classificado].map((v) => el(Tag, { class: 'num' }, fmtInt.format(v))));
  $('#rTabelaTribunais').replaceChildren(
    el('thead', {}, el('tr', {}, cab.map((c, i) => el('th', { class: i ? 'num' : null, scope: 'col' }, c)))),
    el('tbody', {}, grupos.map((g) => linha(g, g.chave))),
    el('tfoot', {}, linha(total, 'Total')),
  );
}

function renderizarOrgaos(lista) {
  const orgaos = agrupar(lista, (r) => `${r.orgao}|${r.tribunal}`).filter((g) => g.merito)
    .sort((a, b) => b.merito - a.merito || b.procedentes - a.procedentes).slice(0, 60);
  $('#rTabelaOrgaos').replaceChildren(
    el('thead', {}, el('tr', {}, ['Vara / juizado', 'Tribunal', 'Mérito', 'Proc.', 'Improc.', 'Taxa', 'Dano moral'].map((c, i) => el('th', { class: i > 1 ? 'num' : null, scope: 'col' }, c)))),
    el('tbody', {}, orgaos.length ? orgaos.map((g) => {
      const [orgao, tribunal] = g.chave.split('|');
      return el('tr', {}, el('td', {}, orgao), el('td', {}, tribunal), el('td', { class: 'num' }, g.merito), el('td', { class: 'num' }, g.procedentes),
        el('td', { class: 'num' }, g.improcedente), el('td', { class: 'num' }, pct(g.procedentes, g.merito)), el('td', { class: 'num' }, g.dm || '—'));
    }) : el('tr', {}, el('td', { colspan: '7', class: 'vazio' }, 'Nenhuma sentença de mérito encontrada até agora.'))),
  );
}

const FILTROS = {
  todas: () => true,
  procedentes: (r) => r.resultado === 'procedente' || r.resultado === 'parcial',
  dm: (r) => r.danoMoral === true,
  improcedente: (r) => r.resultado === 'improcedente',
  outras: (r) => !['procedente', 'parcial', 'improcedente'].includes(r.resultado),
};
const ORDEM = { procedente: 0, parcial: 1, improcedente: 2, acordo: 3, extinto: 4, nao_classificado: 5 };

function textoDano(r) {
  if (!['procedente', 'parcial'].includes(r.resultado)) return '—';
  if (r.danoMoral === true) return r.valor ? `Sim · ${fmtRealExato.format(r.valor)}` : 'Sim (valor não identificado)';
  if (r.danoMoral === false) return 'Não';
  return 'Não identificado';
}

function renderizarDecisoes(lista) {
  const filtradas = lista.filter(FILTROS[estado.filtro])
    .sort((a, b) => (b.danoMoral === true) - (a.danoMoral === true) || ORDEM[a.resultado] - ORDEM[b.resultado] || String(b.data).localeCompare(String(a.data)));
  const paginas = Math.max(1, Math.ceil(filtradas.length / ITENS_LISTA));
  estado.pagina = Math.min(estado.pagina, paginas);
  const pagina = filtradas.slice((estado.pagina - 1) * ITENS_LISTA, estado.pagina * ITENS_LISTA);
  $('#rDecisoesSub').textContent = `${fmtInt.format(filtradas.length)} sentença${filtradas.length === 1 ? '' : 's'} · clique em "Ver dispositivo" para conferir o trecho lido`;

  const caixa = $('#rDecisoes');
  caixa.replaceChildren(el('div', { class: 'decisao decisao--cabecalho', 'aria-hidden': 'true' },
    el('span', {}, 'Publicação'), el('span', {}, 'Tribunal'), el('span', {}, 'Vara · processo'), el('span', {}, 'Resultado'), el('span', {}, 'Dano moral')));
  if (!pagina.length) caixa.append(el('p', { class: 'vazio' }, 'Nenhuma sentença neste filtro.'));
  for (const r of pagina) {
    const resultado = r.acordao ? 'Acórdão' : RESULTADOS_SENTENCA[r.resultado];
    const classeSelo = { procedente: 'procedente', parcial: 'parcial', improcedente: 'improcedente', extinto: 'sem_merito', acordo: 'acordo' }[r.resultado] || 'pendente';
    caixa.append(el('article', { class: 'decisao' },
      el('span', {}, dataBr(r.data)),
      el('span', {}, r.tribunal),
      el('span', {}, el('span', { class: 'decisao__orgao' }, r.orgao), el('span', { class: 'decisao__processo' }, r.processo),
        r.passivo ? el('span', { class: 'decisao__processo' }, `Polo passivo: ${r.passivo}`) : null),
      el('span', {}, el('span', { class: `selo-resultado selo-resultado--${classeSelo}` }, resultado)),
      el('span', { class: 'decisao__dm' }, textoDano(r)),
      el('details', { class: 'decisao__trecho' }, el('summary', {}, 'Ver dispositivo'), el('p', {}, r.trecho || '—'),
        el('span', { class: 'decisao__links' },
          r.link ? el('a', { class: 'link-discreto', href: r.link, target: '_blank', rel: 'noopener noreferrer' }, 'Inteiro teor no tribunal') : null,
          r.certidao ? el('a', { class: 'link-discreto', href: r.certidao, target: '_blank', rel: 'noopener noreferrer' }, 'Certidão do DJEN') : null))));
  }

  const nav = $('#rPaginacao');
  nav.replaceChildren();
  if (paginas > 1) {
    const ir = (p) => { estado.pagina = p; renderizarDecisoes([...estado.registros.values()]); };
    nav.append(el('button', { class: 'btn-nav', type: 'button', disabled: estado.pagina === 1, onclick: () => ir(estado.pagina - 1) }, '‹'),
      el('span', { class: 'paginacao__texto' }, `Página ${estado.pagina} de ${paginas}`),
      el('button', { class: 'btn-nav', type: 'button', disabled: estado.pagina === paginas, onclick: () => ir(estado.pagina + 1) }, '›'));
  }
}

function renderizarDataJud(linhas, consulta) {
  const secao = $('#rDatajud');
  secao.hidden = false;
  $('#rDatajudSub').textContent = `Processos com o assunto "${consulta.assunto}" e sentença registrada no CNJ entre ${dataBr(consulta.inicio)} e ${dataBr(consulta.fim)}. `
    + 'O DataJud não informa dano moral e recebe os dados com semanas de atraso.';
  const cab = ['Tribunal', 'Sentenças no período', 'Procedentes', 'Parciais', 'Improcedentes', 'Taxa de procedência', 'Extinções', 'Acordos', 'Cobertura'];
  $('#rTabelaDatajud').replaceChildren(
    el('thead', {}, el('tr', {}, cab.map((c, i) => el('th', { class: i ? 'num' : null, scope: 'col' }, c)))),
    el('tbody', {}, linhas.map((l) => (l.erro && !l.lidos
      ? el('tr', {}, el('td', {}, l.tribunal), el('td', { colspan: String(cab.length - 1), class: 'vazio' }, `Erro: ${l.erro}`))
      : el('tr', {}, el('td', {}, l.tribunal), ...[l.processos, l.procedente, l.parcial, l.improcedente].map((v) => el('td', { class: 'num' }, fmtInt.format(v))),
        el('td', { class: 'num destaque' }, pct(l.procedente + l.parcial, l.procedente + l.parcial + l.improcedente)),
        el('td', { class: 'num' }, fmtInt.format(l.extinto)), el('td', { class: 'num' }, fmtInt.format(l.acordo)),
        el('td', { class: 'num', title: 'Processos analisados de quantos o índice devolveu' }, l.completo ? 'completa' : `${fmtInt.format(l.lidos)} de ${fmtInt.format(l.candidatos || 0)}`))))),
  );
}

// ------------------------------------------------------------------ pesquisa

function lerConsulta() {
  return {
    chave: $('#pChave').value.trim(),
    parte: $('#pParte').value.trim(),
    inicio: $('#pInicio').value,
    fim: $('#pFim').value,
    tipo: $('#pTipo').value,
    tribunais: [...document.querySelectorAll('#pTribunais input:checked')].map((i) => i.value),
    datajud: $('#pDatajud').checked,
    assunto: $('#pAssunto').value.trim(),
  };
}

function validar(c) {
  if (c.chave.replace(/"/g, '').trim().length < 3) return 'Informe ao menos uma palavra-chave com 3 letras.';
  if (!c.tribunais.length) return 'Escolha ao menos um tribunal.';
  if (!c.inicio || !c.fim || c.inicio > c.fim) return 'Confira o período: a data inicial deve ser anterior à final.';
  const dias = (new Date(c.fim) - new Date(c.inicio)) / 86400000 + 1;
  if (dias > PERIODO_MAXIMO_DIAS) return `Período de até ${PERIODO_MAXIMO_DIAS} dias por pesquisa (escolhido: ${Math.round(dias)}).`;
  if (c.datajud && !proxy()) return 'O panorama do DataJud precisa do intermediário: configure em ⚙ ou desmarque a opção.';
  if (c.datajud && !c.assunto) return 'Informe o assunto do CNJ para o panorama do DataJud (ex.: Tarifas).';
  return null;
}

async function pesquisar(evento) {
  evento.preventDefault();
  const consulta = lerConsulta();
  const erro = validar(consulta);
  const status = $('#pStatus');
  $('#pProgresso').hidden = false;
  if (erro) { status.textContent = erro; return; }
  try { localStorage.setItem(`${CHAVE_CONFIG}.ultima`, JSON.stringify(consulta)); } catch { /* sem armazenamento */ }

  estado.controle?.abort();
  estado.controle = new AbortController();
  const { signal } = estado.controle;
  Object.assign(estado, { registros: new Map(), lidas: 0, pagina: 1, consulta });
  $('#rDatajud').hidden = true;
  $('#btnPesquisar').disabled = true;
  $('#btnCancelar').hidden = false;
  const log = $('#pLog');
  log.replaceChildren();
  const etapas = consulta.tribunais.length * (consulta.datajud ? 2 : 1);
  let feitas = 0;
  const avancar = () => { feitas += 1; $('#pBarra').style.width = `${Math.round((100 * feitas) / etapas)}%`; };
  $('#pBarra').style.width = '0';

  let bloqueio = null;
  try {
    for (const tribunal of consulta.tribunais) {
      const item = el('li', {}, `${tribunal}: consultando…`);
      log.append(item);
      status.textContent = `Consultando o DJEN: ${tribunal} (${feitas + 1} de ${etapas})`;
      try {
        const r = await pesquisarTribunal(tribunal, consulta, signal, (txt) => { item.textContent = txt; });
        item.className = 'ok';
        if (!r.completo) item.textContent += ` · limite de ${MAX_PAGINAS * POR_PAGINA} publicações: reduza o período para ver tudo`;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        item.className = 'erro';
        item.textContent = `${tribunal}: ${e.message}`;
        if (e.bloqueio) { bloqueio = e; break; }
      }
      avancar();
    }
    if (consulta.datajud && !bloqueio) {
      const linhas = [];
      for (const tribunal of consulta.tribunais) {
        status.textContent = `Consultando o DataJud: ${tribunal} (${feitas + 1} de ${etapas})`;
        try { linhas.push(await panoramaDataJud(tribunal, consulta, signal)); } catch (e) {
          if (e.name === 'AbortError') throw e;
          linhas.push({ tribunal, erro: e.message, lidos: 0 });
        }
        renderizarDataJud(linhas, consulta);
        avancar();
      }
    }
    renderizarResultados();
    status.textContent = bloqueio
      ? `Pesquisa interrompida: ${bloqueio.message}`
      : `Concluída: ${fmtInt.format(estado.registros.size)} sentenças encontradas em ${fmtInt.format(estado.lidas)} publicações lidas.`;
  } catch (e) {
    status.textContent = e.name === 'AbortError' ? 'Pesquisa cancelada. Os resultados abaixo são parciais.' : `Erro: ${e.message}`;
  } finally {
    $('#btnPesquisar').disabled = false;
    $('#btnCancelar').hidden = true;
  }
}

function exportarCsv() {
  const lista = [...estado.registros.values()].filter(FILTROS[estado.filtro]);
  const seguro = (v) => {
    const s = String(v ?? '');
    const t = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const linhas = [['Publicação', 'Tribunal', 'Vara/juizado', 'Processo', 'Tipo', 'Resultado', 'Dano moral', 'Valor do dano moral', 'Polo passivo', 'Inteiro teor', 'Dispositivo']];
  for (const r of lista) {
    linhas.push([dataBr(r.data), r.tribunal, r.orgao, r.processo, r.tipo, r.acordao ? 'Acórdão' : RESULTADOS_SENTENCA[r.resultado],
      r.danoMoral === true ? 'Sim' : r.danoMoral === false ? 'Não' : '', r.valor ? r.valor.toFixed(2).replace('.', ',') : '', r.passivo, r.link || '', r.trecho]);
  }
  const blob = new Blob([`﻿${linhas.map((l) => l.map(seguro).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const c = estado.consulta;
  const a = el('a', { href: URL.createObjectURL(blob), download: `pesquisa-teses-${c ? `${c.inicio}_${c.fim}` : 'resultado'}.csv` });
  document.body.append(a); a.click(); a.remove();
}

// ------------------------------------------------------------------ ligação

function atualizarModo() {
  const p = proxy();
  $('#pModo').textContent = p
    ? `DJEN ${estado.config.proxyDjen ? 'pelo intermediário' : 'direto do navegador'} · DataJud pelo intermediário`
    : 'DJEN direto do navegador · DataJud indisponível sem intermediário';
}

function ligar() {
  lerConfig();
  const hoje = new Date();
  const ini = new Date(hoje); ini.setDate(hoje.getDate() - 9);
  $('#pInicio').value = isoLocal(ini);
  $('#pFim').value = isoLocal(hoje);
  try {
    const u = JSON.parse(localStorage.getItem(`${CHAVE_CONFIG}.ultima`) || 'null');
    if (u) {
      $('#pChave').value = u.chave || '';
      $('#pParte').value = u.parte || '';
      $('#pTipo').value = u.tipo || 'sentenca';
      $('#pAssunto').value = u.assunto || '';
      if (u.tribunais?.length) document.querySelectorAll('#pTribunais input').forEach((i) => { i.checked = u.tribunais.includes(i.value); });
    }
  } catch { /* sem armazenamento */ }
  atualizarModo();

  // Abas da página
  document.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-aba]').forEach((x) => {
      const ativo = x === b;
      x.classList.toggle('aba--ativa', ativo);
      x.setAttribute('aria-selected', String(ativo));
    });
    $('#abaPesquisa').hidden = b.dataset.aba !== 'pesquisa';
    $('#abaCarteira').hidden = b.dataset.aba !== 'carteira';
    $('#notaAba').textContent = b.dataset.aba === 'pesquisa'
      ? 'Sentenças publicadas no Diário de Justiça Eletrônico Nacional (DJEN) em todo o país, com leitura do resultado e do dano moral.'
      : 'Processos do escritório por tese: procedência, improcedência e dano moral, por tribunal e comarca.';
  }));

  document.querySelectorAll('[data-grupo]').forEach((b) => b.addEventListener('click', () => {
    const g = b.dataset.grupo;
    document.querySelectorAll('#pTribunais input').forEach((i) => {
      i.checked = g === 'tjs' ? i.value.startsWith('TJ') : g === 'nenhum' ? false : GRUPOS[g].includes(i.value);
    });
  }));

  $('#pDatajud').addEventListener('change', (e) => { $('#campoAssunto').hidden = !e.target.checked; });
  $('#campoAssunto').hidden = !$('#pDatajud').checked;
  $('#formPesquisa').addEventListener('submit', pesquisar);
  $('#btnCancelar').addEventListener('click', () => estado.controle?.abort());
  $('#btnCsvPesquisa').addEventListener('click', exportarCsv);
  $('#rFiltroResultado').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    estado.filtro = b.dataset.filtro;
    estado.pagina = 1;
    document.querySelectorAll('#rFiltroResultado [data-filtro]').forEach((x) => x.classList.toggle('segmento__opcao--ativa', x === b));
    renderizarDecisoes([...estado.registros.values()]);
  });

  const modal = $('#modalProxy');
  $('#btnConfigPesquisa').addEventListener('click', () => {
    $('#proxyUrl').value = estado.config.proxy || '';
    $('#proxyDjen').checked = !!estado.config.proxyDjen;
    modal.showModal();
  });
  modal.addEventListener('close', () => {
    if (modal.returnValue !== 'ok') return;
    estado.config.proxy = $('#proxyUrl').value.trim();
    estado.config.proxyDjen = $('#proxyDjen').checked;
    gravarConfig();
    atualizarModo();
  });
}

ligar();
