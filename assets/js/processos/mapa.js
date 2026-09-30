/* PAUTA CF — Mapa do Brasil do Painel de Processos (SVG puro).
 *
 * Duas camadas sobre os contornos das UFs:
 *   - coroplético por UF, colorido pela métrica escolhida (volume, êxito
 *     ajustado ou recomendação de tráfego);
 *   - bolhas por comarca, com área proporcional ao número de processos.
 *
 * Clicar numa UF aproxima o mapa e filtra o painel; clicar numa bolha filtra a
 * comarca. A projeção é a mesma usada para gerar assets/data/brasil-uf.json
 * (equiretangular com correção de latitude), então as bolhas caem no lugar.
 */

import { RECOMENDACOES } from './dados.js';

const SVG = 'http://www.w3.org/2000/svg';

// Volume: rampa sequencial de um só tom (dourado da marca), do quase-fundo ao claro.
export const CLASSES_VOLUME = [
  { min: 1, max: 2, cor: '#4a3f26', rotulo: '1–2' },
  { min: 3, max: 9, cor: '#6f5d31', rotulo: '3–9' },
  { min: 10, max: 29, cor: '#9a7f3e', rotulo: '10–29' },
  { min: 30, max: 99, cor: '#c9a961', rotulo: '30–99' },
  { min: 100, max: Infinity, cor: '#efdcae', rotulo: '100 ou mais' },
];

// Êxito ajustado: divergente vermelho ↔ cinza ↔ verde, centrado em 50%.
export const CLASSES_EXITO = [
  { min: 0, max: 0.35, cor: '#e8655f', rotulo: 'até 35%' },
  { min: 0.35, max: 0.45, cor: '#9c5a5a', rotulo: '35–45%' },
  { min: 0.45, max: 0.55, cor: '#646d82', rotulo: '45–55%' },
  { min: 0.55, max: 0.65, cor: '#2f7d62', rotulo: '55–65%' },
  { min: 0.65, max: 1.01, cor: '#1fa874', rotulo: 'acima de 65%' },
];

export const CORES_RECOMENDACAO = {
  escalar: '#1fa874',
  testar: '#c9a961',
  observar: '#646d82',
  cautela: '#e8655f',
};

const SEM_PROCESSOS = '#12284a';

function el(nome, attrs = {}, pai = null) {
  const n = document.createElementNS(SVG, nome);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (pai) pai.appendChild(n);
  return n;
}

function classeDe(classes, valor) {
  return classes.find((c) => valor >= c.min && valor <= c.max) || classes.at(-1);
}

export function corDoGrupo(g, metrica) {
  if (!g || !g.total) return SEM_PROCESSOS;
  if (metrica === 'volume') return classeDe(CLASSES_VOLUME, g.total).cor;
  if (metrica === 'exito') return g.decididos ? classeDe(CLASSES_EXITO, g.exitoAjustado).cor : 'url(#hachuraSemDecisao)';
  return CORES_RECOMENDACAO[g.recomendacao];
}

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export function criarMapa(container, geo, { aoClicarUf, aoClicarComarca } = {}) {
  const { projecao } = geo;
  const cosRef = Math.cos((projecao.latRef * Math.PI) / 180);
  const projetar = (lon, lat) => [
    (lon - projecao.lonMin) * cosRef * projecao.escala,
    (projecao.latMax - lat) * projecao.escala,
  ];

  const inteiro = { x: -10, y: -10, w: projecao.largura + 20, h: projecao.altura + 20 };
  let caixa = { ...inteiro };

  const svg = el('svg', {
    class: 'mapa__svg',
    viewBox: `${caixa.x} ${caixa.y} ${caixa.w} ${caixa.h}`,
    role: 'img',
    'aria-label': 'Mapa do Brasil com a distribuição dos processos por UF e comarca',
  });
  const defs = el('defs', {}, svg);
  const hachura = el('pattern', {
    id: 'hachuraSemDecisao', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
  }, defs);
  el('rect', { width: 8, height: 8, fill: '#1b3358' }, hachura);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: '#51678c', 'stroke-width': 2.2 }, hachura);

  // Ordem das camadas: UFs, áreas de toque das bolhas (abaixo das marcas, para a
  // bolha visível sempre ganhar o clique), marcas das bolhas e, por cima, rótulos.
  const camadaUfs = el('g', { class: 'mapa__ufs' }, svg);
  const camadaAlvos = el('g', { class: 'mapa__alvos' }, svg);
  const camadaBolhas = el('g', { class: 'mapa__bolhas' }, svg);
  const camadaRotulos = el('g', { class: 'mapa__rotulos', 'aria-hidden': 'true' }, svg);
  container.appendChild(svg);

  const dica = document.createElement('div');
  dica.className = 'mapa__dica';
  dica.hidden = true;
  container.appendChild(dica);

  const caminhos = new Map();
  const rotulos = new Map();
  for (const uf of geo.ufs) {
    const p = el('path', { d: uf.d, class: 'mapa__uf', 'data-uf': uf.uf, tabindex: '0', role: 'button' }, camadaUfs);
    p.setAttribute('aria-label', uf.nome);
    caminhos.set(uf.uf, p);
    const t = el('text', { x: uf.rotulo[0], y: uf.rotulo[1], class: 'mapa__rotulo' }, camadaRotulos);
    t.textContent = uf.uf;
    rotulos.set(uf.uf, t);
  }

  let estado = { ufs: new Map(), comarcas: [], metrica: 'volume', ufFoco: '', comarcaFoco: '', mostrarComarcas: true };

  // ------------------------------------------------------------ dica

  function linhaDica(rotulo, valor) {
    const linha = document.createElement('div');
    linha.className = 'mapa__dica-linha';
    const v = document.createElement('strong');
    v.textContent = valor;
    const r = document.createElement('span');
    r.textContent = rotulo;
    linha.append(v, r);
    return linha;
  }

  function mostrarDica(evento, titulo, g) {
    dica.replaceChildren();
    const h = document.createElement('div');
    h.className = 'mapa__dica-titulo';
    h.textContent = titulo;
    dica.appendChild(h);
    if (!g || !g.total) {
      dica.appendChild(linhaDica('processos', '0'));
    } else {
      dica.appendChild(linhaDica('processos', String(g.total)));
      dica.appendChild(linhaDica('decisões de mérito', g.decididos ? `${g.exitos} êxitos em ${g.decididos}` : 'nenhuma'));
      dica.appendChild(linhaDica('êxito ajustado', pct(g.exitoAjustado)));
      if (g.liminares) dica.appendChild(linhaDica('liminares deferidas', String(g.liminares)));
      const rec = RECOMENDACOES[g.recomendacao];
      const r = document.createElement('div');
      r.className = `mapa__dica-rec rec rec--${g.recomendacao}`;
      r.textContent = `${rec.icone} ${rec.rotulo} · índice ${g.indice}`;
      dica.appendChild(r);
    }
    dica.hidden = false;
    posicionarDica(evento);
  }

  function posicionarDica(evento) {
    const area = container.getBoundingClientRect();
    let x; let y;
    if (evento?.clientX != null && evento.type !== 'focus') {
      x = evento.clientX - area.left;
      y = evento.clientY - area.top;
    } else {
      const alvo = evento.target.getBoundingClientRect();
      x = alvo.left + alvo.width / 2 - area.left;
      y = alvo.top + alvo.height / 2 - area.top;
    }
    const largura = dica.offsetWidth;
    const altura = dica.offsetHeight;
    const esquerda = Math.min(Math.max(8, x + 14), area.width - largura - 8);
    const limite = Math.min(area.height, window.innerHeight - area.top);
    const topo = y + altura + 20 > limite ? y - altura - 14 : y + 14;
    dica.style.left = `${esquerda}px`;
    dica.style.top = `${Math.max(8, topo)}px`;
  }

  function esconderDica() { dica.hidden = true; }

  // ------------------------------------------------------------ zoom

  let animacao = null;
  function animarPara(destino) {
    cancelAnimationFrame(animacao);
    const inicio = { ...caixa };
    const t0 = performance.now();
    const duracao = 420;
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / duracao);
      const e = 1 - (1 - k) ** 3;
      caixa = {
        x: inicio.x + (destino.x - inicio.x) * e,
        y: inicio.y + (destino.y - inicio.y) * e,
        w: inicio.w + (destino.w - inicio.w) * e,
        h: inicio.h + (destino.h - inicio.h) * e,
      };
      svg.setAttribute('viewBox', `${caixa.x} ${caixa.y} ${caixa.w} ${caixa.h}`);
      desenharBolhas();
      if (k < 1) animacao = requestAnimationFrame(passo);
    };
    animacao = requestAnimationFrame(passo);
  }

  function caixaDaUf(uf) {
    const p = caminhos.get(uf);
    if (!p) return inteiro;
    const b = p.getBBox();
    if (!b.width) return null; // SVG ainda oculto (tela de login): tenta de novo ao aparecer
    const folga = Math.max(b.width, b.height) * 0.12 + 8;
    // Mantém a proporção do mapa inteiro para não distorcer.
    const proporcao = inteiro.w / inteiro.h;
    let w = b.width + folga * 2;
    let h = b.height + folga * 2;
    if (w / h > proporcao) h = w / proporcao; else w = h * proporcao;
    return { x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - h / 2, w, h };
  }

  // ------------------------------------------------------------ desenho

  function pintarUfs() {
    const { ufs, metrica, ufFoco } = estado;
    container.classList.toggle('mapa--volume', metrica === 'volume');
    container.classList.toggle('mapa--categorias', metrica !== 'volume');
    container.classList.toggle('mapa--com-bolhas', estado.mostrarComarcas);
    for (const [uf, p] of caminhos) {
      const g = ufs.get(uf);
      p.setAttribute('fill', corDoGrupo(g, metrica));
      p.classList.toggle('mapa__uf--vazia', !g?.total);
      p.classList.toggle('mapa__uf--foco', uf === ufFoco);
      p.classList.toggle('mapa__uf--esmaecida', Boolean(ufFoco) && uf !== ufFoco);
      const t = rotulos.get(uf);
      const icone = metrica === 'recomendacao' && g?.total ? `${RECOMENDACOES[g.recomendacao].icone} ` : '';
      t.textContent = `${icone}${uf}`;
      t.classList.toggle('mapa__rotulo--ativo', Boolean(g?.total));
    }
  }

  function desenharBolhas() {
    camadaBolhas.replaceChildren();
    camadaAlvos.replaceChildren();
    const tela = svg.getBoundingClientRect();
    // Unidades do viewBox por pixel de tela. Com max-height o SVG fica
    // "letterboxed": vale a maior das duas razões.
    const porPixel = Math.max(caixa.w / (tela.width || 800), caixa.h / (tela.height || 800));
    camadaRotulos.style.fontSize = `${12 * porPixel}px`;
    camadaRotulos.style.strokeWidth = `${3 * porPixel}px`;
    if (!estado.mostrarComarcas) return;
    const maior = Math.max(1, ...estado.comarcas.map((c) => c.total));
    const lista = estado.comarcas
      .filter((c) => c.lat != null && c.lon != null)
      .sort((a, b) => b.total - a.total); // maiores atrás, menores por cima

    for (const c of lista) {
      const [x, y] = projetar(c.lon, c.lat);
      const raioPx = 4 + 18 * Math.sqrt(c.total / maior);
      const r = raioPx * porPixel;
      const grupo = el('g', {
        class: `mapa__bolha${estado.comarcaFoco === c.chave ? ' mapa__bolha--foco' : ''}`,
        tabindex: '0',
        role: 'button',
        'aria-label': `${c.nome} (${c.uf}): ${c.total} processos`,
      }, camadaBolhas);
      // Área de toque maior que a marca (mínimo 24 px), numa camada abaixo das marcas.
      const alvo = el('circle', { cx: x, cy: y, r: Math.max(r, 12 * porPixel), class: 'mapa__bolha-alvo' }, camadaAlvos);
      // Sem decisões no modo Êxito: cinza sólido, para não sumir sobre a UF hachurada.
      const semDecisao = estado.metrica === 'exito' && !c.decididos;
      const cor = estado.metrica === 'volume' ? '#071022' : semDecisao ? '#3a4660' : corDoGrupo(c, estado.metrica);
      el('circle', {
        cx: x, cy: y, r, fill: cor, class: 'mapa__bolha-marca',
        'stroke-width': (estado.metrica === 'volume' ? 1.5 : 2) * porPixel,
      }, grupo);
      const abrir = (e) => mostrarDica(e, `${c.nome} — ${c.uf}`, c);
      grupo.addEventListener('pointerenter', abrir);
      grupo.addEventListener('pointermove', posicionarDica);
      grupo.addEventListener('pointerleave', esconderDica);
      grupo.addEventListener('focus', abrir);
      grupo.addEventListener('blur', esconderDica);
      const escolher = (e) => { e.stopPropagation(); aoClicarComarca?.(c); };
      grupo.addEventListener('click', escolher);
      alvo.addEventListener('pointerenter', abrir);
      alvo.addEventListener('pointermove', posicionarDica);
      alvo.addEventListener('pointerleave', esconderDica);
      alvo.addEventListener('click', escolher);
      grupo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(e); } });
    }
  }

  for (const [uf, p] of caminhos) {
    const nome = geo.ufs.find((u) => u.uf === uf).nome;
    const abrir = (e) => mostrarDica(e, nome, estado.ufs.get(uf));
    p.addEventListener('pointerenter', abrir);
    p.addEventListener('pointermove', posicionarDica);
    p.addEventListener('pointerleave', esconderDica);
    p.addEventListener('focus', abrir);
    p.addEventListener('blur', esconderDica);
    const escolher = () => aoClicarUf?.(uf);
    p.addEventListener('click', escolher);
    p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(); } });
  }

  let ultimaLargura = 0;
  const observador = new ResizeObserver(() => {
    const largura = svg.getBoundingClientRect().width;
    if (Math.abs(largura - ultimaLargura) > 1) {
      const estavaOculto = ultimaLargura === 0;
      ultimaLargura = largura;
      if (estavaOculto && estado.ufFoco) {
        const alvo = caixaDaUf(estado.ufFoco);
        if (alvo) { caixa = alvo; svg.setAttribute('viewBox', `${caixa.x} ${caixa.y} ${caixa.w} ${caixa.h}`); }
      }
      desenharBolhas();
    }
  });
  observador.observe(svg);

  return {
    atualizar(novo) {
      const focoMudou = novo.ufFoco !== undefined && novo.ufFoco !== estado.ufFoco;
      estado = { ...estado, ...novo };
      pintarUfs();
      if (focoMudou) {
        const alvo = estado.ufFoco ? caixaDaUf(estado.ufFoco) : inteiro;
        if (alvo) animarPara(alvo); else desenharBolhas();
      }
      else desenharBolhas();
    },
  };
}
