/* PAUTA CF — Exportação em PDF, JPEG e texto.
 *
 * Um único motor de layout desenha a pauta em <canvas>: o JPEG sai da imagem
 * contínua e o PDF sai das mesmas páginas embutidas via jsPDF. Assim a pauta
 * impressa e a compartilhada são visualmente idênticas.
 */

const CDN_JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';

const CORES = {
  marinho: '#0d1b34',
  marinhoClaro: '#16294a',
  ouro: '#c9a961',
  ouroClaro: '#dfc489',
  papel: '#ffffff',
  zebra: '#f5f7fa',
  texto: '#1c2433',
  textoFraco: '#5b6577',
  linha: '#dde2ea',
};

/* Proporções das colunas (normalizadas em tempo de execução). */
const COLUNAS = [
  { chave: 'data', titulo: 'DATA', peso: 7 },
  { chave: 'horario', titulo: 'HORÁRIO', peso: 8 },
  { chave: 'parteAutora', titulo: 'PARTE AUTORA', peso: 11.5 },
  { chave: 'parteRe', titulo: 'PARTE RÉ', peso: 11.5 },
  /* Peso suficiente para o número CNJ completo caber numa linha só. */
  { chave: 'processo', titulo: 'PROCESSO', peso: 14 },
  { chave: 'foro', titulo: 'JUÍZO / VARA', peso: 13 },
  { chave: 'cidade', titulo: 'CIDADE', peso: 7 },
  { chave: 'responsavel', titulo: 'RESPONSÁVEL', peso: 8.5 },
  { chave: 'modalidade', titulo: 'MODALIDADE', peso: 6.5 },
  { chave: 'link', titulo: 'LINK DA AUDIÊNCIA', peso: 13 },
];

const LARGURA = 2200;          // largura de renderização (proporção A4 paisagem)
const ALTURA_PAGINA = 1556;    // 2200 / 1.414
const MARGEM = 56;
const ALTURA_CABECALHO = 132;
const ALTURA_RODAPE = 46;
const ALTURA_LINHA_TEXTO = 30;
const PADDING_CELULA = 12;

/* Alguns prazos do Astrea trazem o despacho inteiro no título; sem um teto, uma
   única linha ocuparia a página toda. */
const MAX_LINHAS_CELULA = 5;

/* ---------------- utilidades de texto ---------------- */

function quebrarTexto(ctx, texto, larguraMax) {
  if (!texto) return [''];

  const linhas = [];
  for (const paragrafo of String(texto).split('\n')) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    if (!palavras.length) { linhas.push(''); continue; }

    let atual = palavras[0];
    for (let i = 1; i < palavras.length; i++) {
      const teste = `${atual} ${palavras[i]}`;
      if (ctx.measureText(teste).width <= larguraMax) {
        atual = teste;
      } else {
        linhas.push(atual);
        atual = palavras[i];
      }
    }
    linhas.push(atual);
  }

  // Palavras muito longas (números de processo) são fatiadas para não vazar.
  const saida = [];
  for (const linha of linhas) {
    if (ctx.measureText(linha).width <= larguraMax) { saida.push(linha); continue; }

    let resto = linha;
    while (ctx.measureText(resto).width > larguraMax && resto.length > 1) {
      let corte = resto.length;
      while (corte > 1 && ctx.measureText(resto.slice(0, corte)).width > larguraMax) corte--;
      saida.push(resto.slice(0, corte));
      resto = resto.slice(corte);
    }
    if (resto) saida.push(resto);
  }

  return saida.length ? saida : [''];
}

/* ---------------- marca ---------------- */

const CAMINHO_LOGO = 'assets/img/logo.png';

let logoImagem = null;
let promessaLogo = null;

/** Pré-carrega a logomarca oficial. Resolve com null se o arquivo não abrir. */
export function carregarLogo() {
  if (logoImagem) return Promise.resolve(logoImagem);

  if (!promessaLogo) {
    promessaLogo = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { logoImagem = img; resolve(img); };
      img.onerror = () => resolve(null);
      img.src = CAMINHO_LOGO;
    });
  }

  return promessaLogo;
}

/** Traçado vetorial da marca — reserva para quando o PNG não carrega. */
function desenharMarcaVetorial(ctx, x, y, tamanho, cor) {
  const escala = tamanho / 132;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(escala, escala);
  ctx.strokeStyle = cor;
  ctx.lineWidth = 10;
  ctx.lineCap = 'butt';

  ctx.stroke(new Path2D('M 40 24 A 46 46 0 1 1 30 92'));
  ctx.stroke(new Path2D('M 50 40 H 86 M 50 40 V 100 M 50 68 H 76 M 22 100 H 50'));

  ctx.restore();
}

/* ---------------- layout ---------------- */

function medirLayout(ctx, dados) {
  const larguraConteudo = LARGURA - MARGEM * 2;
  const pesoTotal = COLUNAS.reduce((s, c) => s + c.peso, 0);

  let x = MARGEM;
  const colunas = COLUNAS.map((c) => {
    const largura = (c.peso / pesoTotal) * larguraConteudo;
    const col = { ...c, x, largura };
    x += largura;
    return col;
  });

  ctx.font = '400 21px "Segoe UI", system-ui, Arial, sans-serif';

  const linhas = dados.map((item) => {
    const celulas = {};
    let maxLinhas = 1;

    for (const col of colunas) {
      const disponivel = col.largura - PADDING_CELULA * 2;
      let partes = quebrarTexto(ctx, item[col.chave] ?? '', disponivel);

      if (partes.length > MAX_LINHAS_CELULA) {
        partes = partes.slice(0, MAX_LINHAS_CELULA);
        partes[MAX_LINHAS_CELULA - 1] = `${partes[MAX_LINHAS_CELULA - 1]}…`;
      }

      celulas[col.chave] = partes;
      maxLinhas = Math.max(maxLinhas, partes.length);
    }

    return {
      item,
      celulas,
      altura: maxLinhas * ALTURA_LINHA_TEXTO + PADDING_CELULA * 2,
    };
  });

  return { colunas, linhas };
}

/** Distribui as linhas em páginas respeitando a altura útil. */
function paginar(linhas, alturaUtil) {
  const paginas = [];
  let atual = [];
  let acumulado = 0;

  for (const linha of linhas) {
    if (acumulado + linha.altura > alturaUtil && atual.length) {
      paginas.push(atual);
      atual = [];
      acumulado = 0;
    }
    atual.push(linha);
    acumulado += linha.altura;
  }

  if (atual.length || !paginas.length) paginas.push(atual);
  return paginas;
}

/* ---------------- desenho ---------------- */

function desenharCabecalho(ctx, meta, pagina, totalPaginas) {
  ctx.fillStyle = CORES.marinho;
  ctx.fillRect(0, 0, LARGURA, ALTURA_CABECALHO);

  ctx.textBaseline = 'alphabetic';

  if (logoImagem) {
    const alturaLogo = 72;
    const larguraLogo = (logoImagem.width / logoImagem.height) * alturaLogo;
    ctx.drawImage(logoImagem, MARGEM, (ALTURA_CABECALHO - alturaLogo) / 2 - 4, larguraLogo, alturaLogo);

    ctx.fillStyle = 'rgba(201, 169, 97, 0.45)';
    ctx.fillRect(MARGEM + larguraLogo + 28, 40, 2, 50);

    ctx.fillStyle = CORES.ouroClaro;
    ctx.font = '400 30px "Segoe UI", system-ui, Arial, sans-serif';
    ctx.fillText('PAUTA CF', MARGEM + larguraLogo + 52, 74);
  } else {
    desenharMarcaVetorial(ctx, MARGEM, 26, 80, CORES.ouro);

    ctx.fillStyle = CORES.ouroClaro;
    ctx.font = '400 34px "Segoe UI", system-ui, Arial, sans-serif';
    ctx.fillText('PAUTA CF', MARGEM + 108, 62);

    ctx.fillStyle = '#a8b0bd';
    ctx.font = '400 17px "Segoe UI", system-ui, Arial, sans-serif';
    ctx.fillText('CALMON & FREITAS ADVOGADOS', MARGEM + 108, 92);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = CORES.ouroClaro;
  ctx.font = '600 24px "Segoe UI", system-ui, Arial, sans-serif';
  ctx.fillText(meta.titulo, LARGURA - MARGEM, 58);

  ctx.fillStyle = '#a8b0bd';
  ctx.font = '400 17px "Segoe UI", system-ui, Arial, sans-serif';
  ctx.fillText(meta.subtitulo, LARGURA - MARGEM, 88);

  if (totalPaginas > 1) {
    ctx.font = '400 15px "Segoe UI", system-ui, Arial, sans-serif';
    ctx.fillText(`Página ${pagina} de ${totalPaginas}`, LARGURA - MARGEM, 112);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = CORES.ouro;
  ctx.fillRect(0, ALTURA_CABECALHO - 4, LARGURA, 4);
}

function desenharCabecalhoTabela(ctx, colunas, y) {
  const altura = 46;

  ctx.fillStyle = CORES.marinhoClaro;
  ctx.fillRect(MARGEM, y, LARGURA - MARGEM * 2, altura);

  ctx.fillStyle = CORES.ouroClaro;
  ctx.font = '700 15px "Segoe UI", system-ui, Arial, sans-serif';
  ctx.textBaseline = 'middle';

  for (const col of colunas) {
    ctx.fillText(col.titulo, col.x + PADDING_CELULA, y + altura / 2 + 1);
  }

  ctx.textBaseline = 'alphabetic';
  return y + altura;
}

function desenharLinha(ctx, colunas, linha, y, indice) {
  const largura = LARGURA - MARGEM * 2;

  if (indice % 2 === 1) {
    ctx.fillStyle = CORES.zebra;
    ctx.fillRect(MARGEM, y, largura, linha.altura);
  }

  if (linha.item.tipo === 'tarefa') {
    ctx.fillStyle = 'rgba(201, 169, 97, 0.13)';
    ctx.fillRect(MARGEM, y, largura, linha.altura);
  }

  ctx.textBaseline = 'top';

  for (const col of colunas) {
    const destaque = col.chave === 'data' || col.chave === 'responsavel';
    ctx.fillStyle = destaque ? CORES.texto : CORES.textoFraco;
    ctx.font = `${destaque ? 600 : 400} 21px "Segoe UI", system-ui, Arial, sans-serif`;

    const partes = linha.celulas[col.chave];
    partes.forEach((parte, i) => {
      ctx.fillText(
        parte,
        col.x + PADDING_CELULA,
        y + PADDING_CELULA + i * ALTURA_LINHA_TEXTO + 3
      );
    });
  }

  ctx.textBaseline = 'alphabetic';

  ctx.strokeStyle = CORES.linha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGEM, y + linha.altura + 0.5);
  ctx.lineTo(LARGURA - MARGEM, y + linha.altura + 0.5);
  ctx.stroke();

  return y + linha.altura;
}

function desenharRodape(ctx, alturaTotal, meta) {
  const y = alturaTotal - ALTURA_RODAPE;

  ctx.strokeStyle = CORES.ouro;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGEM, y);
  ctx.lineTo(LARGURA - MARGEM, y);
  ctx.stroke();

  ctx.fillStyle = CORES.textoFraco;
  ctx.font = '400 15px "Segoe UI", system-ui, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Emitido em ${meta.emitidoEm}`, MARGEM, y + ALTURA_RODAPE / 2);

  ctx.textAlign = 'right';
  ctx.fillText(meta.contagem, LARGURA - MARGEM, y + ALTURA_RODAPE / 2);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function novoCanvas(largura, altura) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = CORES.papel;
  ctx.fillRect(0, 0, largura, altura);
  return { canvas, ctx };
}

/**
 * Renderiza a pauta.
 * @param {Array<object>} dados linhas já formatadas para exibição
 * @param {object} meta { titulo, subtitulo, emitidoEm, contagem }
 * @param {boolean} paginado true gera páginas A4; false gera imagem contínua
 * @returns {HTMLCanvasElement[]}
 */
export function renderizarPauta(dados, meta, paginado) {
  const medidor = document.createElement('canvas').getContext('2d');
  const { colunas, linhas } = medirLayout(medidor, dados);

  const alturaCabecalhoTabela = 46;
  const alturaUtil = ALTURA_PAGINA - ALTURA_CABECALHO - alturaCabecalhoTabela - ALTURA_RODAPE - 20;

  const paginas = paginado
    ? paginar(linhas, alturaUtil)
    : [linhas];

  return paginas.map((linhasPagina, indicePagina) => {
    const alturaConteudo = linhasPagina.reduce((s, l) => s + l.altura, 0);
    const altura = paginado
      ? ALTURA_PAGINA
      : ALTURA_CABECALHO + alturaCabecalhoTabela + alturaConteudo + ALTURA_RODAPE + 20;

    const { canvas, ctx } = novoCanvas(LARGURA, altura);

    desenharCabecalho(ctx, meta, indicePagina + 1, paginas.length);

    let y = desenharCabecalhoTabela(ctx, colunas, ALTURA_CABECALHO + 14);
    linhasPagina.forEach((linha, i) => { y = desenharLinha(ctx, colunas, linha, y, i); });

    if (!linhasPagina.length) {
      ctx.fillStyle = CORES.textoFraco;
      ctx.font = '400 22px "Segoe UI", system-ui, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Nenhum compromisso no período selecionado.', LARGURA / 2, y + 70);
      ctx.textAlign = 'left';
    }

    desenharRodape(ctx, altura, meta);
    return canvas;
  });
}

/* ---------------- saídas ---------------- */

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportarJPEG(dados, meta, nomeArquivo) {
  await carregarLogo();
  const [canvas] = renderizarPauta(dados, meta, false);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Não foi possível gerar a imagem.'));
        baixar(blob, `${nomeArquivo}.jpg`);
        resolve();
      },
      'image/jpeg',
      0.94
    );
  });
}

let promessaJsPDF = null;

function carregarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);

  if (!promessaJsPDF) {
    promessaJsPDF = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CDN_JSPDF;
      script.onload = () =>
        window.jspdf?.jsPDF
          ? resolve(window.jspdf.jsPDF)
          : reject(new Error('jsPDF indisponível.'));
      script.onerror = () => reject(new Error('Falha ao carregar o gerador de PDF.'));
      document.head.appendChild(script);
    }).catch((erro) => {
      promessaJsPDF = null;
      throw erro;
    });
  }

  return promessaJsPDF;
}

/**
 * Gera o PDF em A4 paisagem. Sem internet para buscar o gerador, devolve
 * `{ imprimir: true }` para que a interface caia na impressão do navegador.
 */
export async function exportarPDF(dados, meta, nomeArquivo) {
  await carregarLogo();

  let jsPDF;
  try {
    jsPDF = await carregarJsPDF();
  } catch {
    return { imprimir: true };
  }

  const paginas = renderizarPauta(dados, meta, true);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const larguraMm = 297;
  const alturaMm = 210;

  paginas.forEach((canvas, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, larguraMm, alturaMm);
  });

  pdf.save(`${nomeArquivo}.pdf`);
  return { imprimir: false };
}

/** Versão escrita, pensada para colar em e-mail ou WhatsApp. */
export function montarTexto(dados, meta) {
  const linhas = [
    'PAUTA CF — CALMON & FREITAS ADVOGADOS',
    meta.titulo.toUpperCase(),
    meta.subtitulo,
    '='.repeat(60),
    '',
  ];

  if (!dados.length) {
    linhas.push('Nenhum compromisso no período selecionado.');
    return linhas.join('\n');
  }

  const porData = new Map();
  for (const item of dados) {
    if (!porData.has(item.data)) porData.set(item.data, []);
    porData.get(item.data).push(item);
  }

  for (const [data, itens] of porData) {
    linhas.push(`${data} — ${itens[0].diaSemana.toUpperCase()}`);
    linhas.push('-'.repeat(60));

    for (const item of itens) {
      const marcador = item.tipo === 'tarefa' ? '[TAREFA]' : item.horario;
      linhas.push(`${marcador}  ${item.parteAutora || item.titulo}`);

      if (item.parteRe) linhas.push(`          Réu: ${item.parteRe}`);
      if (item.processo) linhas.push(`          Processo: ${item.processo}`);
      if (item.foro) linhas.push(`          Vara: ${item.foro}`);
      if (item.cidade) linhas.push(`          Cidade: ${item.cidade}`);

      linhas.push(`          Responsável: ${item.responsavel || 'A DEFINIR'}`);
      if (item.modalidade) linhas.push(`          Modalidade: ${item.modalidade}`);
      if (item.link) linhas.push(`          Link: ${item.link}`);
      linhas.push('');
    }
  }

  linhas.push('='.repeat(60));
  linhas.push(`${meta.contagem} · Emitido em ${meta.emitidoEm}`);

  return linhas.join('\n');
}

export function baixarTexto(texto, nomeArquivo) {
  baixar(new Blob([texto], { type: 'text/plain;charset=utf-8' }), `${nomeArquivo}.txt`);
}
