/* PAUTA CF — geração de PDF com texto nativo (jsPDF).
 *
 * A versão anterior embutia a pauta como imagem: texto não selecionável, sem
 * busca e dependente de resolução. Aqui o texto é desenhado como texto de
 * verdade — selecionável, pesquisável, com links reais e nitidez em qualquer
 * zoom. A paginação é calculada a partir da altura medida de cada elemento.
 */

import { CORES, ICONE_MODALIDADE, MARCA } from './formato.js';
import { carregarLogoDataURI } from './doc-html.js';

const CDN_JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';

/** pt para mm — jsPDF trabalha em mm, as fontes são especificadas em pt. */
const mm = (pt) => pt * 0.352778;

const hexRGB = (hex) => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

/* Tamanhos mínimos exigidos: 8,5 pt no completo, 11 pt no MOBILE, 12 pt em botões. */
const TIPO_COMPLETO = { corpo: 8.5, cabecalhoTabela: 8, grupo: 11, titulo: 16, meta: 8, resumo: 13 };
const TIPO_MOBILE = { corpo: 11, rotulo: 8.5, nome: 12, hora: 14, botao: 12, grupo: 12, titulo: 13, meta: 8.5, resumo: 14 };

export const PAGINAS_PDF = {
  'completo': { formato: 'a4', orientacao: 'landscape', margem: 12 },
  'completo-retrato': { formato: 'a4', orientacao: 'portrait', margem: 12 },
  // Página estreita: num celular a folha ocupa a largura da tela, então uma
  // página menor faz o mesmo texto aparecer maior. É o que dispensa o zoom.
  // A altura é generosa porque, mantidos os 11 pt mínimos, um card ocupa cerca
  // de 94 mm — preferimos página alta a fonte pequena. Em 260 mm cabem dois
  // cards mesmo quando a página abre com cabeçalho de dia.
  'mobile': { formato: [110, 260], orientacao: 'portrait', margem: 8 },
  'mobile-a4': { formato: 'a4', orientacao: 'portrait', margem: 14 },
};

let promessaJsPDF = null;

export function carregarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);

  if (!promessaJsPDF) {
    promessaJsPDF = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN_JSPDF;
      s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF indisponível.')));
      s.onerror = () => reject(new Error('Falha ao carregar o gerador de PDF.'));
      document.head.appendChild(s);
    }).catch((e) => { promessaJsPDF = null; throw e; });
  }

  return promessaJsPDF;
}

/* ---------------- utilidades de desenho ---------------- */

function fonte(pdf, tamanho, estilo = 'normal', cor = CORES.texto) {
  pdf.setFont('helvetica', estilo);
  pdf.setFontSize(tamanho);
  pdf.setTextColor(...hexRGB(cor));
}

/** Quebra o texto e devolve as linhas já ajustadas à largura. */
function quebrar(pdf, texto, largura, tamanho, estilo = 'normal') {
  fonte(pdf, tamanho, estilo);
  return pdf.splitTextToSize(String(texto ?? ''), largura);
}

/**
 * Escreve um bloco de texto a partir do topo informado.
 * @returns {number} altura consumida em mm
 */
function escrever(pdf, texto, x, yTopo, opcoes) {
  const { largura, tamanho, estilo = 'normal', cor = CORES.texto, entrelinha = 1.28, maxLinhas = 0 } = opcoes;

  let linhas = quebrar(pdf, texto, largura, tamanho, estilo);
  if (maxLinhas && linhas.length > maxLinhas) {
    linhas = linhas.slice(0, maxLinhas);
    linhas[maxLinhas - 1] = `${linhas[maxLinhas - 1].replace(/\s+\S*$/, '')}…`;
  }

  const alturaLinha = mm(tamanho) * entrelinha;
  fonte(pdf, tamanho, estilo, cor);

  linhas.forEach((linha, i) => {
    pdf.text(linha, x, yTopo + mm(tamanho) * 0.94 + i * alturaLinha);
  });

  return linhas.length * alturaLinha;
}

/** Só mede, sem desenhar — usado pelo motor de paginação. */
function medir(pdf, texto, opcoes) {
  const { largura, tamanho, estilo = 'normal', entrelinha = 1.28, maxLinhas = 0 } = opcoes;
  let n = quebrar(pdf, texto, largura, tamanho, estilo).length;
  if (maxLinhas) n = Math.min(n, maxLinhas);
  return n * mm(tamanho) * entrelinha;
}

function retangulo(pdf, x, y, w, h, { preenchimento, borda, raio = 1.5, larguraBorda = 0.2 } = {}) {
  if (preenchimento) pdf.setFillColor(...hexRGB(preenchimento));
  if (borda) { pdf.setDrawColor(...hexRGB(borda)); pdf.setLineWidth(larguraBorda); }

  const estilo = preenchimento && borda ? 'FD' : preenchimento ? 'F' : 'S';
  if (raio > 0) pdf.roundedRect(x, y, w, h, raio, raio, estilo);
  else pdf.rect(x, y, w, h, estilo);
}

const CORES_MODALIDADE = {
  Virtual: CORES.virtual,
  Presencial: CORES.presencial,
  Híbrida: CORES.hibrida,
};

function corDoItem(item) {
  if (item.subtipo !== 'audiencia') return CORES.ouro;
  return CORES_MODALIDADE[item.modalidade] || CORES.textoFraco;
}

/** Etiqueta de modalidade — texto e cor, para não depender só do tom. */
function etiqueta(pdf, item, xDireita, y, tamanho) {
  const rotulo = item.subtipo === 'prazo' ? 'PRAZO'
    : item.subtipo === 'tarefa' ? 'TAREFA'
      : (item.modalidade || '—').toUpperCase();

  const cor = corDoItem(item);
  fonte(pdf, tamanho, 'bold');
  const larguraTexto = pdf.getTextWidth(rotulo);
  const w = larguraTexto + 5;
  const h = mm(tamanho) + 2.2;
  const x = xDireita - w;

  retangulo(pdf, x, y, w, h, { borda: cor, raio: h / 2, larguraBorda: 0.25 });
  fonte(pdf, tamanho, 'bold', cor);
  pdf.text(rotulo, x + 2.5, y + h / 2 + mm(tamanho) * 0.35);

  return { largura: w, altura: h };
}

/* ---------------- cabeçalho e rodapé ---------------- */

function cabecalhoInstitucional(pdf, doc, logo, larguraPagina, margem, tipo) {
  const alturaCab = tipo === TIPO_MOBILE ? 20 : 24;

  retangulo(pdf, 0, 0, larguraPagina, alturaCab, { preenchimento: CORES.marinho, raio: 0 });
  retangulo(pdf, 0, alturaCab, larguraPagina, 1.1, { preenchimento: CORES.ouro, raio: 0 });

  let x = margem;

  if (logo) {
    const hLogo = tipo === TIPO_MOBILE ? 8 : 11;
    const wLogo = hLogo * 3.11; // proporção da logomarca
    try {
      pdf.addImage(logo, 'PNG', x, (alturaCab - hLogo) / 2, wLogo, hLogo);
      x += wLogo + 5;
    } catch { /* segue sem a marca se o formato não for aceito */ }
  }

  fonte(pdf, tipo.titulo, 'bold', CORES.ouro);
  pdf.text(doc.tituloLinha1, x, alturaCab / 2 - 0.4);

  fonte(pdf, tipo.meta + 1, 'normal', '#e8ecf3');
  pdf.text(doc.tituloLinha2, x, alturaCab / 2 + mm(tipo.titulo) * 0.75);

  // Metadados à direita; no MOBILE não há largura para isso, vão para o rodapé.
  if (tipo !== TIPO_MOBILE) {
    fonte(pdf, tipo.meta, 'bold', '#ffffff');
    pdf.text(doc.periodo.rotulo, larguraPagina - margem, 9, { align: 'right' });

    fonte(pdf, tipo.meta, 'normal', '#c3cbd8');
    pdf.text(`${doc.resumo.total} registro${doc.resumo.total === 1 ? '' : 's'}`, larguraPagina - margem, 14, { align: 'right' });
    pdf.text(`Emitido em ${doc.emitidoEm}`, larguraPagina - margem, 18.5, { align: 'right' });
  }

  return alturaCab + 1.1;
}

function rodape(pdf, doc, pagina, totalPaginas, larguraPagina, alturaPagina, margem, tipo) {
  const y = alturaPagina - margem + 1;

  pdf.setDrawColor(...hexRGB(CORES.ouro));
  pdf.setLineWidth(0.4);
  pdf.line(margem, y - 3, larguraPagina - margem, y - 3);

  fonte(pdf, tipo.meta - 0.5, 'normal', CORES.textoFraco);

  if (tipo === TIPO_MOBILE) {
    pdf.text(doc.periodo.rotulo, margem, y);
    pdf.text(`${pagina}/${totalPaginas}`, larguraPagina - margem, y, { align: 'right' });
  } else {
    pdf.text(MARCA.titulo, margem, y);
    pdf.text(`Página ${pagina} de ${totalPaginas}`, larguraPagina - margem, y, { align: 'right' });
  }
}

/* ---------------- resumo executivo ---------------- */

function medirResumo(colunas) {
  return colunas > 3 ? 16 : 30;
}

function desenharResumo(pdf, doc, x, y, largura, tipo) {
  const r = doc.resumo;
  const cartoes = [
    ['AUDIÊNCIAS', r.audiencias, false],
    ['PRAZOS', r.prazos + r.tarefas, false],
    ['COMARCAS', r.comarcas, false],
    ['SEM RESPONSÁVEL', r.semResponsavel, r.semResponsavel > 0],
    ['VIRTUAIS', r.virtuais, false],
    ['PRESENCIAIS', r.presenciais, false],
  ];

  const porLinha = tipo === TIPO_MOBILE ? 3 : 6;
  const gap = 2;
  const w = (largura - gap * (porLinha - 1)) / porLinha;
  const h = 14;
  const linhas = Math.ceil(cartoes.length / porLinha);

  cartoes.forEach(([rotulo, valor, alerta], i) => {
    const col = i % porLinha;
    const lin = Math.floor(i / porLinha);
    const cx = x + col * (w + gap);
    const cy = y + lin * (h + gap);

    retangulo(pdf, cx, cy, w, h, { preenchimento: '#ffffff', borda: CORES.borda, raio: 1.4 });
    retangulo(pdf, cx, cy, 1.1, h, { preenchimento: alerta ? CORES.alerta : CORES.ouro, raio: 0 });

    fonte(pdf, tipo.resumo, 'bold', CORES.texto);
    pdf.text(String(valor), cx + 3.4, cy + 6.6);

    fonte(pdf, 6.2, 'normal', CORES.textoFraco);
    const rot = pdf.splitTextToSize(rotulo, w - 5);
    pdf.text(rot[0], cx + 3.4, cy + 10.6);
    if (rot[1]) pdf.text(rot[1], cx + 3.4, cy + 13);
  });

  return linhas * h + (linhas - 1) * gap;
}

/* ---------------- cabeçalho de grupo ---------------- */

const ALTURA_GRUPO = 9;

function desenharGrupo(pdf, grupo, x, y, largura, tipo, continuacao) {
  retangulo(pdf, x, y, largura, ALTURA_GRUPO, { preenchimento: CORES.marinhoSecundario, raio: 1.4 });

  fonte(pdf, tipo.grupo, 'bold', CORES.ouro);
  const titulo = continuacao ? `${grupo.rotulo} (continuação)` : grupo.rotulo;
  pdf.text(titulo, x + 3.5, y + 5.9);

  const larguraTitulo = pdf.getTextWidth(titulo);

  if (grupo.subtitulo) {
    fonte(pdf, tipo.grupo - 2.5, 'normal', '#dbe2ec');
    pdf.text(grupo.subtitulo, x + 3.5 + larguraTitulo + 4, y + 5.9);
  }

  fonte(pdf, tipo.grupo - 3, 'bold', '#ffffff');
  pdf.text(grupo.resumo, x + largura - 3.5, y + 5.9, { align: 'right' });

  return ALTURA_GRUPO;
}

/* ================= MODELO COMPLETO (tabela) ================= */

const COLUNAS = [
  { chave: 'horario', titulo: 'HORÁRIO', peso: 20 },
  { chave: 'parteAutora', titulo: 'PARTE AUTORA', peso: 40 },
  { chave: 'parteRe', titulo: 'PARTE RÉ', peso: 40 },
  { chave: 'processo', titulo: 'PROCESSO', peso: 42 },
  { chave: 'foro', titulo: 'JUÍZO / VARA', peso: 43 },
  { chave: 'cidade', titulo: 'CIDADE', peso: 24 },
  { chave: 'responsavel', titulo: 'RESPONSÁVEL', peso: 26 },
  { chave: 'modalidade', titulo: 'MODALIDADE', peso: 22 },
  { chave: 'acesso', titulo: 'ACESSO', peso: 16 },
];

const PADDING_CEL = 1.6;
const ALTURA_CAB_TABELA = 7;

function colunasEm(largura) {
  const total = COLUNAS.reduce((s, c) => s + c.peso, 0);
  let x = 0;
  return COLUNAS.map((c) => {
    const w = (c.peso / total) * largura;
    const col = { ...c, x, largura: w };
    x += w;
    return col;
  });
}

function valorCelula(item, chave) {
  if (chave === 'acesso') return item.link ? 'Entrar' : '—';
  if (chave === 'modalidade') return '';
  if (chave === 'foro') return item.foro + (item.foroComplemento ? ` (${item.foroComplemento})` : '');
  return item[chave] ?? '';
}

function medirLinhaTabela(pdf, item, colunas) {
  let maior = mm(TIPO_COMPLETO.corpo) * 1.28;

  for (const col of colunas) {
    if (col.chave === 'modalidade') continue;
    const h = medir(pdf, valorCelula(item, col.chave), {
      largura: col.largura - PADDING_CEL * 2,
      tamanho: TIPO_COMPLETO.corpo,
    });
    maior = Math.max(maior, h);
  }

  return maior + PADDING_CEL * 2;
}

function desenharCabTabela(pdf, colunas, x, y, largura) {
  retangulo(pdf, x, y, largura, ALTURA_CAB_TABELA, { preenchimento: CORES.marinho, raio: 0 });
  fonte(pdf, TIPO_COMPLETO.cabecalhoTabela, 'bold', CORES.ouro);

  for (const col of colunas) {
    pdf.text(col.titulo, x + col.x + PADDING_CEL, y + ALTURA_CAB_TABELA / 2 + 1);
  }

  return ALTURA_CAB_TABELA;
}

function desenharLinhaTabela(pdf, item, colunas, x, y, largura, altura, par) {
  if (par) retangulo(pdf, x, y, largura, altura, { preenchimento: '#fafbfd', raio: 0 });

  for (const col of colunas) {
    const cx = x + col.x + PADDING_CEL;

    if (col.chave === 'modalidade') {
      etiqueta(pdf, item, cx + col.largura - PADDING_CEL * 2, y + PADDING_CEL, 6.2);
      continue;
    }

    if (col.chave === 'acesso' && item.link) {
      fonte(pdf, TIPO_COMPLETO.corpo, 'bold', CORES.virtual);
      pdf.text('Entrar', cx, y + PADDING_CEL + mm(TIPO_COMPLETO.corpo) * 0.94);
      pdf.link(cx, y, col.largura, altura, { url: item.link });
      continue;
    }

    const destaque = col.chave === 'horario' || col.chave === 'responsavel';
    const alerta = col.chave === 'responsavel' && !item.temResponsavel;

    escrever(pdf, valorCelula(item, col.chave), cx, y + PADDING_CEL, {
      largura: col.largura - PADDING_CEL * 2,
      tamanho: TIPO_COMPLETO.corpo,
      estilo: destaque ? 'bold' : 'normal',
      cor: alerta ? CORES.alerta : destaque ? CORES.marinho : CORES.texto,
    });
  }

  pdf.setDrawColor(...hexRGB(CORES.borda));
  pdf.setLineWidth(0.15);
  pdf.line(x, y + altura, x + largura, y + altura);
}

/* ================= MODELO MOBILE (cards) ================= */

const PAD_CARD = 4;

function medirCard(pdf, item, largura) {
  const wInterno = largura - PAD_CARD * 2;
  let h = PAD_CARD;

  h += mm(TIPO_MOBILE.hora) * 1.3 + 3;                                   // topo + divisor
  h += medir(pdf, item.parteAutora, { largura: wInterno, tamanho: TIPO_MOBILE.nome, estilo: 'bold' });
  h += mm(TIPO_MOBILE.rotulo) * 1.3 + 1.6;
  h += medir(pdf, item.parteRe, { largura: wInterno, tamanho: TIPO_MOBILE.corpo });
  h += mm(TIPO_MOBILE.rotulo) * 1.3 + 1.6;

  h += 3 + mm(TIPO_MOBILE.rotulo) * 1.3
    + medir(pdf, item.processo, { largura: wInterno - 4, tamanho: TIPO_MOBILE.corpo, estilo: 'bold' }) + 3;
  h += 2;

  if (item.subtipo !== 'audiencia' && item.detalhe) {
    h += 3 + mm(TIPO_MOBILE.rotulo) * 1.3
      + medir(pdf, item.detalhe, { largura: wInterno - 4, tamanho: TIPO_MOBILE.corpo, maxLinhas: 4 }) + 3 + 2;
  }

  // Juízo ocupa a largura toda; cidade e responsável dividem a linha seguinte,
  // o que encurta o card sem apertar nenhum dos dois.
  h += mm(TIPO_MOBILE.rotulo) * 1.25
    + medir(pdf, item.foro + (item.foroComplemento ? ` (${item.foroComplemento})` : ''),
      { largura: wInterno, tamanho: TIPO_MOBILE.corpo, maxLinhas: 3 }) + 1.4;

  const wMeia = (wInterno - 3) / 2;
  h += mm(TIPO_MOBILE.rotulo) * 1.25 + Math.max(
    medir(pdf, item.cidade, { largura: wMeia, tamanho: TIPO_MOBILE.corpo, maxLinhas: 2 }),
    medir(pdf, item.responsavel, { largura: wMeia, tamanho: TIPO_MOBILE.corpo, maxLinhas: 2 })
  ) + 1.4;

  h += 2 + 11;        // botão de acesso
  h += PAD_CARD;

  return h;
}

function desenharCard(pdf, item, x, y, largura, altura) {
  const cor = corDoItem(item);
  const wInterno = largura - PAD_CARD * 2;

  retangulo(pdf, x, y, largura, altura, {
    preenchimento: item.temResponsavel ? '#ffffff' : '#fffdf7',
    borda: CORES.borda,
    raio: 2,
  });
  retangulo(pdf, x, y + 1, 1.4, altura - 2, { preenchimento: cor, raio: 0.7 });

  const cx = x + PAD_CARD;
  let cy = y + PAD_CARD;

  // topo: horário + etiqueta
  fonte(pdf, TIPO_MOBILE.hora, 'bold', CORES.marinho);
  pdf.text(item.horario, cx, cy + mm(TIPO_MOBILE.hora) * 0.9);
  etiqueta(pdf, item, x + largura - PAD_CARD, cy, 6.4);
  cy += mm(TIPO_MOBILE.hora) * 1.3;

  pdf.setDrawColor(...hexRGB(CORES.borda));
  pdf.setLineWidth(0.15);
  pdf.line(cx, cy + 1, x + largura - PAD_CARD, cy + 1);
  cy += 3;

  // partes
  cy += escrever(pdf, item.parteAutora, cx, cy, {
    largura: wInterno, tamanho: TIPO_MOBILE.nome, estilo: 'bold',
  });
  cy += escrever(pdf, 'PARTE AUTORA', cx, cy, {
    largura: wInterno, tamanho: TIPO_MOBILE.rotulo, cor: CORES.textoFraco,
  }) + 1.6;

  cy += escrever(pdf, item.parteRe, cx, cy, { largura: wInterno, tamanho: TIPO_MOBILE.corpo });
  cy += escrever(pdf, 'PARTE RÉ', cx, cy, {
    largura: wInterno, tamanho: TIPO_MOBILE.rotulo, cor: CORES.textoFraco,
  }) + 1.6;

  // processo em bloco destacado
  const hProc = mm(TIPO_MOBILE.rotulo) * 1.3
    + medir(pdf, item.processo, { largura: wInterno - 4, tamanho: TIPO_MOBILE.corpo, estilo: 'bold' }) + 3;
  retangulo(pdf, cx, cy, wInterno, hProc + 3, { preenchimento: CORES.fundo, raio: 1.4 });
  let py = cy + 1.6;
  py += escrever(pdf, 'PROCESSO', cx + 2, py, {
    largura: wInterno - 4, tamanho: TIPO_MOBILE.rotulo, cor: CORES.textoFraco,
  });
  escrever(pdf, item.processo, cx + 2, py, {
    largura: wInterno - 4, tamanho: TIPO_MOBILE.corpo, estilo: 'bold', cor: CORES.marinho,
  });
  cy += hProc + 3 + 2;

  if (item.subtipo !== 'audiencia' && item.detalhe) {
    const hDet = mm(TIPO_MOBILE.rotulo) * 1.3
      + medir(pdf, item.detalhe, { largura: wInterno - 4, tamanho: TIPO_MOBILE.corpo, maxLinhas: 4 }) + 3;
    retangulo(pdf, cx, cy, wInterno, hDet + 3, { preenchimento: CORES.fundo, raio: 1.4 });
    let dy = cy + 1.6;
    dy += escrever(pdf, 'DESCRIÇÃO', cx + 2, dy, {
      largura: wInterno - 4, tamanho: TIPO_MOBILE.rotulo, cor: CORES.textoFraco,
    });
    escrever(pdf, item.detalhe, cx + 2, dy, {
      largura: wInterno - 4, tamanho: TIPO_MOBILE.corpo, maxLinhas: 4,
    });
    cy += hDet + 3 + 2;
  }

  // juízo em largura cheia
  cy += escrever(pdf, 'JUÍZO / VARA', cx, cy, {
    largura: wInterno, tamanho: TIPO_MOBILE.rotulo, cor: CORES.textoFraco, entrelinha: 1.25,
  });
  cy += escrever(pdf, item.foro + (item.foroComplemento ? ` (${item.foroComplemento})` : ''), cx, cy, {
    largura: wInterno, tamanho: TIPO_MOBILE.corpo, maxLinhas: 3,
  }) + 1.4;

  // cidade e responsável dividem a linha
  const wMeia = (wInterno - 3) / 2;
  const xDir = cx + wMeia + 3;

  const alturaRotulo = escrever(pdf, 'CIDADE', cx, cy, {
    largura: wMeia, tamanho: TIPO_MOBILE.rotulo, cor: CORES.textoFraco, entrelinha: 1.25,
  });
  escrever(pdf, 'RESPONSÁVEL', xDir, cy, {
    largura: wMeia, tamanho: TIPO_MOBILE.rotulo, cor: CORES.textoFraco, entrelinha: 1.25,
  });
  cy += alturaRotulo;

  const hCidade = escrever(pdf, item.cidade, cx, cy, {
    largura: wMeia, tamanho: TIPO_MOBILE.corpo, maxLinhas: 2,
  });
  const hResp = escrever(pdf, item.responsavel, xDir, cy, {
    largura: wMeia,
    tamanho: TIPO_MOBILE.corpo,
    estilo: item.temResponsavel ? 'normal' : 'bold',
    cor: item.temResponsavel ? CORES.texto : CORES.alerta,
    maxLinhas: 2,
  });
  cy += Math.max(hCidade, hResp) + 1.4;

  // botão de acesso — altura confortável para toque, link real no PDF
  cy += 2;
  const hBotao = 11;

  if (item.link) {
    retangulo(pdf, cx, cy, wInterno, hBotao, { preenchimento: CORES.marinho, raio: 2 });
    fonte(pdf, TIPO_MOBILE.botao, 'bold', '#ffffff');
    pdf.text('ENTRAR NA AUDIÊNCIA', cx + wInterno / 2, cy + hBotao / 2 + mm(TIPO_MOBILE.botao) * 0.35, { align: 'center' });
    pdf.link(cx, cy, wInterno, hBotao, { url: item.link });
  } else {
    retangulo(pdf, cx, cy, wInterno, hBotao, { preenchimento: CORES.fundo, borda: CORES.borda, raio: 2 });
    fonte(pdf, TIPO_MOBILE.botao - 1, 'normal', CORES.textoFraco);
    pdf.text('LINK NÃO INFORMADO', cx + wInterno / 2, cy + hBotao / 2 + mm(TIPO_MOBILE.botao) * 0.35, { align: 'center' });
  }
}

/* ================= motor de paginação ================= */

/**
 * Distribui os grupos em páginas sem partir elementos e sem deixar cabeçalho de
 * grupo órfão no pé da página.
 * @returns {Array<Array<{tipo, ...}>>} blocos por página
 */
function paginar(elementos, alturaUtilPrimeira, alturaUtilDemais) {
  const paginas = [];
  let atual = [];
  let usado = 0;
  let limite = alturaUtilPrimeira;

  const fechar = () => {
    if (atual.length) paginas.push(atual);
    atual = [];
    usado = 0;
    limite = alturaUtilDemais;
  };

  for (let i = 0; i < elementos.length; i++) {
    const el = elementos[i];

    // Cabeçalho de grupo só entra se o primeiro registro couber junto.
    const conjunto = el.tipo === 'grupo' && elementos[i + 1]
      ? el.altura + elementos[i + 1].altura
      : el.altura;

    if (usado > 0 && usado + conjunto > limite) fechar();

    // Elemento maior que a página inteira: entra sozinho para não sumir.
    if (el.altura > limite && atual.length) fechar();

    atual.push(el);
    usado += el.altura;
  }

  fechar();
  return paginas.length ? paginas : [[]];
}

/** Achata o documento numa lista linear de elementos mensuráveis. */
function montarElementos(pdf, doc, modo, largura) {
  const elementos = [];

  for (const grupo of doc.grupos) {
    elementos.push({ tipo: 'grupo', grupo, altura: ALTURA_GRUPO + 2.5 });

    if (modo === 'completo') {
      elementos.push({ tipo: 'cabtabela', altura: ALTURA_CAB_TABELA });
      const colunas = colunasEm(largura);
      grupo.itens.forEach((item, i) => {
        elementos.push({
          tipo: 'linha', item, colunas, par: i % 2 === 1,
          altura: medirLinhaTabela(pdf, item, colunas),
        });
      });
      elementos.push({ tipo: 'espaco', altura: 4 });
    } else {
      for (const item of grupo.itens) {
        elementos.push({ tipo: 'card', item, altura: medirCard(pdf, item, largura) + 3 });
      }
      elementos.push({ tipo: 'espaco', altura: 2 });
    }
  }

  return elementos;
}

/* ================= API ================= */

/**
 * Gera o PDF.
 * @param {object} doc documento de montarDocumento()
 * @param {'completo'|'mobile'} modo
 * @param {object} opcoes { pagina }
 * @returns {Promise<{blob: Blob, paginas: number}>}
 */
export async function gerarPDF(doc, modo, opcoes = {}) {
  const jsPDF = await carregarJsPDF();
  const logo = await carregarLogoDataURI();

  const chavePagina = opcoes.pagina || (modo === 'mobile' ? 'mobile' : 'completo');
  const cfg = PAGINAS_PDF[chavePagina] || PAGINAS_PDF.completo;
  const tipo = modo === 'mobile' ? TIPO_MOBILE : TIPO_COMPLETO;

  const pdf = new jsPDF({ orientation: cfg.orientacao, unit: 'mm', format: cfg.formato });

  pdf.setProperties({
    title: `${MARCA.titulo} — ${doc.periodo.rotulo}`,
    subject: `Pauta de audiências e prazos — ${doc.periodo.rotulo}`,
    author: 'Calmon e Freitas Advogados',
    creator: MARCA.titulo,
    keywords: 'pauta, audiências, prazos, Calmon e Freitas Advogados',
  });

  const larguraPagina = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();
  const margem = cfg.margem;
  const largura = larguraPagina - margem * 2;

  const alturaCab = tipo === TIPO_MOBILE ? 21.1 : 25.1;
  const alturaRodape = 7;

  const elementos = montarElementos(pdf, doc, modo, largura);

  // O resumo executivo ocupa espaço apenas na primeira página.
  const alturaResumo = medirResumo(modo === 'mobile' ? 3 : 6) + 4;
  const utilPrimeira = alturaPagina - alturaCab - alturaResumo - alturaRodape - margem;
  const utilDemais = alturaPagina - alturaCab - alturaRodape - margem;

  const paginas = paginar(elementos, utilPrimeira, utilDemais);
  const gruposVistos = new Set();

  paginas.forEach((blocos, indice) => {
    if (indice > 0) pdf.addPage();

    cabecalhoInstitucional(pdf, doc, logo, larguraPagina, margem, tipo);
    let y = alturaCab + 4;

    if (indice === 0) {
      y += desenharResumo(pdf, doc, margem, y, largura, tipo) + 4;
    }

    for (const el of blocos) {
      switch (el.tipo) {
        case 'grupo': {
          const repetido = gruposVistos.has(el.grupo.chave);
          gruposVistos.add(el.grupo.chave);
          y += desenharGrupo(pdf, el.grupo, margem, y, largura, tipo, repetido) + 2.5;
          break;
        }
        case 'cabtabela':
          y += desenharCabTabela(pdf, colunasEm(largura), margem, y, largura);
          break;
        case 'linha':
          desenharLinhaTabela(pdf, el.item, el.colunas, margem, y, largura, el.altura, el.par);
          y += el.altura;
          break;
        case 'card':
          desenharCard(pdf, el.item, margem, y, largura, el.altura - 3);
          y += el.altura;
          break;
        default:
          y += el.altura;
      }
    }

    rodape(pdf, doc, indice + 1, paginas.length, larguraPagina, alturaPagina, margem, tipo);
  });

  if (!doc.itens.length) {
    fonte(pdf, tipo.corpo || 11, 'normal', CORES.textoFraco);
    pdf.text('Nenhum registro no período selecionado.', larguraPagina / 2, alturaPagina / 2, { align: 'center' });
  }

  return { blob: pdf.output('blob'), paginas: paginas.length };
}
