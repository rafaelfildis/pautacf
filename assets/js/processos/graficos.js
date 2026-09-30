/* PAUTA CF — Gráficos do Painel de Processos.
 *
 * Construídos com HTML/SVG a partir dos agregados de dados.js, sem biblioteca.
 * Regras de leitura: marcas finas, uma escala por gráfico, legenda sempre que há
 * mais de uma série, rótulos seletivos e dica (hover/foco) em toda marca — a
 * dica complementa, nunca substitui: os mesmos números estão nas tabelas.
 */

import { RESULTADOS, TESES } from './classificar.js';

export const CORES_RESULTADO = {
  procedente: '#1fa874',
  parcial: '#c4b54c',
  acordo: '#3f8ae6',
  sem_merito: '#646d82',
  improcedente: '#e8655f',
};

/** Ordem de leitura: do mais favorável ao desfavorável. */
export const ORDEM_RESULTADO = ['procedente', 'parcial', 'acordo', 'sem_merito', 'improcedente'];

const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function criar(tag, classe, texto) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (texto != null) n.textContent = texto;
  return n;
}

// ---------------------------------------------------------------- dica

function ligarDica(container) {
  let dica = container.querySelector(':scope > .grafico__dica');
  if (!dica) {
    dica = criar('div', 'grafico__dica');
    dica.hidden = true;
    container.appendChild(dica);
  }
  const mostrar = (evento, titulo, linhas) => {
    dica.replaceChildren(criar('div', 'grafico__dica-titulo', titulo));
    for (const [valor, rotulo, cor] of linhas) {
      const l = criar('div', 'grafico__dica-linha');
      if (cor) {
        const chave = criar('span', 'grafico__chave');
        chave.style.background = cor;
        l.appendChild(chave);
      }
      l.append(criar('strong', null, valor), criar('span', null, rotulo));
      dica.appendChild(l);
    }
    dica.hidden = false;
    const area = container.getBoundingClientRect();
    const alvo = evento.clientX != null && evento.type !== 'focus'
      ? { x: evento.clientX, y: evento.clientY }
      : (() => { const b = evento.currentTarget.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top }; })();
    const x = Math.min(Math.max(6, alvo.x - area.left + 12), area.width - dica.offsetWidth - 6);
    const y = alvo.y - area.top - dica.offsetHeight - 10;
    dica.style.left = `${x}px`;
    dica.style.top = `${y < 4 ? alvo.y - area.top + 16 : y}px`;
  };
  const esconder = () => { dica.hidden = true; };
  return { mostrar, esconder };
}

function comDica(no, dica, titulo, linhas) {
  no.tabIndex = 0;
  const abrir = (e) => dica.mostrar(e, titulo, linhas);
  no.addEventListener('pointerenter', abrir);
  no.addEventListener('pointermove', abrir);
  no.addEventListener('pointerleave', dica.esconder);
  no.addEventListener('focus', abrir);
  no.addEventListener('blur', dica.esconder);
}

export function legendaResultados(container) {
  container.replaceChildren();
  for (const chave of ORDEM_RESULTADO) {
    const item = criar('span', 'legenda__item');
    const chip = criar('span', 'legenda__chip');
    chip.style.background = CORES_RESULTADO[chave];
    item.append(chip, document.createTextNode(RESULTADOS[chave]));
    container.appendChild(item);
  }
}

// ---------------------------------------------------------------- resultados por local

/**
 * Barras horizontais empilhadas com as decisões conhecidas por local. O
 * comprimento é absoluto (não 100%) para que o volume de decisões também seja
 * lido; os processos ainda sem decisão aparecem como texto ao lado.
 */
export function barrasResultado(container, grupos, { aoClicar } = {}) {
  const corpo = container.querySelector('.grafico__corpo') || container;
  corpo.replaceChildren();
  const dica = ligarDica(container);
  const comDecisao = grupos.filter((g) => g.decididos + g.sem_merito > 0);
  if (!comDecisao.length) {
    corpo.appendChild(criar('p', 'grafico__vazio', 'Nenhuma decisão de mérito no recorte atual.'));
    return;
  }
  const maior = Math.max(...comDecisao.map((g) => g.decididos + g.sem_merito));
  for (const g of comDecisao) {
    const linha = criar('div', 'barra');
    const rotulo = criar('button', 'barra__rotulo', g.rotuloCurto || g.nome);
    rotulo.type = 'button';
    rotulo.title = `Filtrar ${g.nome}`;
    if (aoClicar) rotulo.addEventListener('click', () => aoClicar(g));
    else rotulo.disabled = true;

    const trilho = criar('div', 'barra__trilho');
    const pilha = criar('div', 'barra__pilha');
    pilha.style.width = `${(100 * (g.decididos + g.sem_merito)) / maior}%`;
    for (const chave of ORDEM_RESULTADO) {
      if (!g[chave]) continue;
      const seg = criar('span', 'barra__segmento');
      seg.style.flexGrow = g[chave];
      seg.style.background = CORES_RESULTADO[chave];
      comDica(seg, dica, `${g.nome} — ${RESULTADOS[chave]}`, [
        [String(g[chave]), g[chave] === 1 ? 'processo' : 'processos', CORES_RESULTADO[chave]],
        [pct(g.taxa), `êxito (${g.exitos} de ${g.decididos} decisões de mérito)`],
      ]);
      pilha.appendChild(seg);
    }
    trilho.appendChild(pilha);
    const valor = criar('span', 'barra__valor', g.decididos ? `${g.exitos}/${g.decididos} · ${pct(g.taxa)}` : 'só extinções');
    trilho.appendChild(valor);
    const pendentes = criar('span', 'barra__extra', g.pendente ? `+${g.pendente} sem decisão` : '');
    linha.append(rotulo, trilho, pendentes);
    corpo.appendChild(linha);
  }
}

// ---------------------------------------------------------------- tese × UF

/** Matriz de calor: linhas = teses, colunas = UFs de maior volume. */
export function matrizTeses(container, registros, { ufs, aoClicar } = {}) {
  const corpo = container.querySelector('.grafico__corpo') || container;
  corpo.replaceChildren();
  const dica = ligarDica(container);
  if (!registros.length) {
    corpo.appendChild(criar('p', 'grafico__vazio', 'Sem processos no recorte atual.'));
    return;
  }

  const contar = new Map();
  for (const r of registros) {
    const coluna = ufs.includes(r.uf) ? r.uf : 'Outras';
    const chave = `${r.tese}|${coluna}`;
    if (!contar.has(chave)) contar.set(chave, { total: 0, decididos: 0, exitos: 0 });
    const c = contar.get(chave);
    c.total += 1;
    if (['procedente', 'parcial', 'acordo', 'improcedente'].includes(r.resultado)) c.decididos += 1;
    if (['procedente', 'parcial', 'acordo'].includes(r.resultado)) c.exitos += 1;
  }
  const colunas = [...ufs];
  if (registros.some((r) => !ufs.includes(r.uf))) colunas.push('Outras');
  const totaisTese = new Map();
  for (const r of registros) totaisTese.set(r.tese, (totaisTese.get(r.tese) || 0) + 1);
  const teses = [...totaisTese.keys()].sort((a, b) => totaisTese.get(b) - totaisTese.get(a));
  const maior = Math.max(...[...contar.values()].map((c) => c.total));

  const grade = criar('div', 'calor');
  grade.style.gridTemplateColumns = `minmax(150px, 1.4fr) repeat(${colunas.length}, minmax(44px, 1fr))`;
  grade.appendChild(criar('span', 'calor__canto', 'Tese'));
  for (const uf of colunas) grade.appendChild(criar('span', 'calor__coluna', uf));

  for (const tese of teses) {
    grade.appendChild(criar('span', 'calor__linha', TESES[tese] || tese));
    for (const uf of colunas) {
      const c = contar.get(`${tese}|${uf}`);
      const cel = criar('button', 'calor__celula');
      cel.type = 'button';
      if (!c) {
        cel.classList.add('calor__celula--vazia');
        cel.disabled = true;
        cel.setAttribute('aria-label', `${TESES[tese]} em ${uf}: nenhum processo`);
      } else {
        // Sequencial dourado: opacidade proporcional à raiz do volume.
        const k = Math.sqrt(c.total / maior);
        cel.style.setProperty('--intensidade', (0.18 + 0.82 * k).toFixed(3));
        cel.classList.toggle('calor__celula--clara', k > 0.55);
        cel.appendChild(criar('strong', null, String(c.total)));
        if (c.decididos) cel.appendChild(criar('small', null, `${c.exitos}/${c.decididos}`));
        comDica(cel, dica, `${TESES[tese]} — ${uf}`, [
          [String(c.total), c.total === 1 ? 'processo' : 'processos'],
          [c.decididos ? `${c.exitos} de ${c.decididos}` : '—', 'êxitos nas decisões de mérito'],
        ]);
        if (aoClicar) cel.addEventListener('click', () => aoClicar(tese, uf === 'Outras' ? '' : uf));
      }
      grade.appendChild(cel);
    }
  }
  corpo.appendChild(grade);
}

// ---------------------------------------------------------------- distribuições por mês

export function colunasMes(container, serie) {
  const corpo = container.querySelector('.grafico__corpo') || container;
  corpo.replaceChildren();
  const dica = ligarDica(container);
  if (!serie.length) {
    corpo.appendChild(criar('p', 'grafico__vazio', 'Sem datas de distribuição no recorte atual.'));
    return;
  }
  const largura = 640;
  const altura = 210;
  const m = { topo: 18, dir: 8, base: 28, esq: 30 };
  const maxBruto = Math.max(...serie.map((s) => s.total));
  const passo = maxBruto <= 5 ? 1 : maxBruto <= 20 ? 5 : maxBruto <= 50 ? 10 : 25;
  const teto = Math.max(passo, Math.ceil(maxBruto / passo) * passo);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${largura} ${altura}`);
  svg.setAttribute('class', 'colunas');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Processos distribuídos por mês');
  const add = (tag, attrs, pai = svg) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    pai.appendChild(n);
    return n;
  };
  const alturaUtil = altura - m.topo - m.base;
  const y = (v) => m.topo + alturaUtil * (1 - v / teto);
  for (let v = 0; v <= teto; v += passo) {
    add('line', { x1: m.esq, x2: largura - m.dir, y1: y(v), y2: y(v), class: v === 0 ? 'colunas__base' : 'colunas__grade' });
    const t = add('text', { x: m.esq - 6, y: y(v) + 4, class: 'colunas__eixo', 'text-anchor': 'end' });
    t.textContent = String(v);
  }
  const faixa = (largura - m.esq - m.dir) / serie.length;
  const barra = Math.min(24, faixa * 0.7);
  // Rótulo de eixo a cada N meses, alinhado a janeiro/julho quando possível.
  const cada = serie.length <= 12 ? 1 : serie.length <= 24 ? 3 : serie.length <= 48 ? 6 : 12;
  const iMax = serie.findIndex((s) => s.total === maxBruto);
  serie.forEach((s, i) => {
    const cx = m.esq + faixa * i + faixa / 2;
    const alvo = add('g', { class: 'colunas__item', tabindex: '0' });
    add('rect', { x: m.esq + faixa * i, y: m.topo, width: faixa, height: alturaUtil, class: 'colunas__alvo' }, alvo);
    if (s.total) {
      const h = alturaUtil * (s.total / teto);
      const topo = y(s.total);
      const r = Math.min(4, barra / 2, h);
      add('path', {
        d: `M${cx - barra / 2},${y(0)}V${topo + r}Q${cx - barra / 2},${topo} ${cx - barra / 2 + r},${topo}H${cx + barra / 2 - r}Q${cx + barra / 2},${topo} ${cx + barra / 2},${topo + r}V${y(0)}Z`,
        class: 'colunas__barra',
      }, alvo);
    }
    const [ano, mes] = s.mes.split('-').map(Number);
    const nome = fmtMes.format(new Date(ano, mes - 1, 1)).replace('.', '');
    if ((mes - 1) % cada === 0) {
      const t = add('text', { x: cx, y: altura - 9, class: 'colunas__eixo', 'text-anchor': 'middle' });
      t.textContent = `${MESES[mes - 1]}/${String(ano).slice(2)}`;
    }
    if (i === iMax || i === serie.length - 1) {
      const t = add('text', { x: cx, y: y(s.total) - 6, class: 'colunas__valor', 'text-anchor': 'middle' });
      t.textContent = String(s.total);
    }
    const abrir = (e) => dica.mostrar(e, nome, [[String(s.total), s.total === 1 ? 'processo distribuído' : 'processos distribuídos']]);
    alvo.addEventListener('pointerenter', abrir);
    alvo.addEventListener('pointermove', abrir);
    alvo.addEventListener('pointerleave', dica.esconder);
    alvo.addEventListener('focus', abrir);
    alvo.addEventListener('blur', dica.esconder);
  });
  corpo.appendChild(svg);
}

// ---------------------------------------------------------------- parte adversa

export function barrasSimples(container, itens, { aoClicar, vazio = 'Sem dados no recorte atual.' } = {}) {
  const corpo = container.querySelector('.grafico__corpo') || container;
  corpo.replaceChildren();
  const dica = ligarDica(container);
  if (!itens.length) {
    corpo.appendChild(criar('p', 'grafico__vazio', vazio));
    return;
  }
  const maior = Math.max(...itens.map((i) => i.total));
  for (const item of itens) {
    const linha = criar('div', 'barra barra--simples');
    const rotulo = criar('button', 'barra__rotulo', item.nome);
    rotulo.type = 'button';
    if (aoClicar) rotulo.addEventListener('click', () => aoClicar(item));
    else rotulo.disabled = true;
    const trilho = criar('div', 'barra__trilho');
    const marca = criar('span', 'barra__unica');
    marca.style.width = `${(100 * item.total) / maior}%`;
    comDica(marca, dica, item.nome, [
      [String(item.total), item.total === 1 ? 'processo' : 'processos'],
      [item.decididos ? `${item.exitos} de ${item.decididos}` : '—', 'êxitos nas decisões de mérito'],
    ]);
    trilho.append(marca, criar('span', 'barra__valor', String(item.total)));
    linha.append(rotulo, trilho, criar('span', 'barra__extra', item.decididos ? `êxito ${pct(item.taxa)}` : ''));
    corpo.appendChild(linha);
  }
}
