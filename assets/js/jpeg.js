/* PAUTA CF — exportação JPEG vertical.
 *
 * Usa o mesmo desenho de cards da versão MOBILE, em formato retrato e com tipos
 * grandes, pensado para leitura direta no WhatsApp. Imagens muito longas são
 * recusadas pelos aplicativos e ficam ilegíveis, por isso a pauta é dividida em
 * partes numeradas, sempre em limites de card.
 */

import { CORES, ICONE_MODALIDADE, MARCA } from './formato.js';
import { carregarLogoDataURI } from './doc-html.js';

const LARGURA = 1080;          // dentro da faixa pedida (1080 a 1440)
/* Teto de altura por parte. Alto o bastante para caber um dia inteiro de pauta
   sem picotar, e baixo o bastante para o WhatsApp não degradar a imagem. */
const ALTURA_MAX = 4000;
const MARGEM = 36;
const PAD_CARD = 26;
const GAP_CARD = 18;

const FONTE = '"Poppins", Arial, Helvetica, sans-serif';
const T = { hora: 40, nome: 34, corpo: 29, rotulo: 21, botao: 30, grupo: 30, titulo: 34, meta: 22 };

const fonte = (ctx, tamanho, peso = 400) => { ctx.font = `${peso} ${tamanho}px ${FONTE}`; };

function quebrar(ctx, texto, larguraMax) {
  const t = String(texto ?? '').trim();
  if (!t) return [''];

  const linhas = [];
  let atual = '';

  for (const palavra of t.split(/\s+/)) {
    const teste = atual ? `${atual} ${palavra}` : palavra;

    if (ctx.measureText(teste).width <= larguraMax) {
      atual = teste;
      continue;
    }

    if (atual) linhas.push(atual);

    // Palavra sozinha maior que a linha (URL, número longo): fatia por caractere.
    if (ctx.measureText(palavra).width > larguraMax) {
      let resto = palavra;
      while (ctx.measureText(resto).width > larguraMax && resto.length > 1) {
        let corte = resto.length;
        while (corte > 1 && ctx.measureText(resto.slice(0, corte)).width > larguraMax) corte--;
        linhas.push(resto.slice(0, corte));
        resto = resto.slice(corte);
      }
      atual = resto;
    } else {
      atual = palavra;
    }
  }

  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [''];
}

function escrever(ctx, texto, x, y, { largura, tamanho, peso = 400, cor = CORES.texto, entrelinha = 1.3, maxLinhas = 0 }) {
  fonte(ctx, tamanho, peso);
  let linhas = quebrar(ctx, texto, largura);

  if (maxLinhas && linhas.length > maxLinhas) {
    linhas = linhas.slice(0, maxLinhas);
    linhas[maxLinhas - 1] = `${linhas[maxLinhas - 1].replace(/\s+\S*$/, '')}…`;
  }

  ctx.fillStyle = cor;
  ctx.textBaseline = 'top';
  const alturaLinha = tamanho * entrelinha;
  linhas.forEach((l, i) => ctx.fillText(l, x, y + i * alturaLinha));

  return linhas.length * alturaLinha;
}

function medirTexto(ctx, texto, { largura, tamanho, peso = 400, entrelinha = 1.3, maxLinhas = 0 }) {
  fonte(ctx, tamanho, peso);
  let n = quebrar(ctx, texto, largura).length;
  if (maxLinhas) n = Math.min(n, maxLinhas);
  return n * tamanho * entrelinha;
}

function caixa(ctx, x, y, w, h, raio, { preenchimento, borda, larguraBorda = 2 } = {}) {
  const r = Math.min(raio, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();

  if (preenchimento) { ctx.fillStyle = preenchimento; ctx.fill(); }
  if (borda) { ctx.strokeStyle = borda; ctx.lineWidth = larguraBorda; ctx.stroke(); }
}

const CORES_MOD = { Virtual: CORES.virtual, Presencial: CORES.presencial, Híbrida: CORES.hibrida };
const corDoItem = (i) => (i.subtipo !== 'audiencia' ? CORES.ouro : CORES_MOD[i.modalidade] || CORES.textoFraco);

function rotuloEtiqueta(item) {
  if (item.subtipo === 'prazo') return '⏳ PRAZO';
  if (item.subtipo === 'tarefa') return '✓ TAREFA';
  return `${ICONE_MODALIDADE[item.modalidade] || '•'} ${(item.modalidade || '—').toUpperCase()}`;
}

/* ---------------- medição e desenho dos cards ---------------- */

function medirCard(ctx, item, largura) {
  const w = largura - PAD_CARD * 2;
  let h = PAD_CARD;

  h += T.hora * 1.25 + 20;                                        // topo + divisor
  h += medirTexto(ctx, item.parteAutora, { largura: w, tamanho: T.nome, peso: 600 });
  h += T.rotulo * 1.3 + 10;
  h += medirTexto(ctx, item.parteRe, { largura: w, tamanho: T.corpo });
  h += T.rotulo * 1.3 + 14;

  h += 16 + T.rotulo * 1.3 + medirTexto(ctx, item.processo, { largura: w - 24, tamanho: T.corpo, peso: 600 }) + 16 + 14;

  if (item.subtipo !== 'audiencia' && item.detalhe) {
    h += 16 + T.rotulo * 1.3
      + medirTexto(ctx, item.detalhe, { largura: w - 24, tamanho: T.corpo, maxLinhas: 4 }) + 16 + 14;
  }

  for (const valor of [item.foro, item.cidade, item.responsavel]) {
    h += T.rotulo * 1.3 + medirTexto(ctx, valor, { largura: w, tamanho: T.corpo }) + 10;
  }

  h += 12 + 78 + PAD_CARD;                                        // botão
  return h;
}

function desenharCard(ctx, item, x, y, largura, altura) {
  const w = largura - PAD_CARD * 2;

  caixa(ctx, x, y, largura, altura, 14, {
    preenchimento: item.temResponsavel ? '#ffffff' : '#fffdf7',
    borda: CORES.borda,
  });
  caixa(ctx, x, y + 6, 7, altura - 12, 3.5, { preenchimento: corDoItem(item) });

  const cx = x + PAD_CARD;
  let cy = y + PAD_CARD;

  fonte(ctx, T.hora, 700);
  ctx.fillStyle = CORES.marinho;
  ctx.textBaseline = 'top';
  ctx.fillText(item.horario, cx, cy);

  // etiqueta de modalidade alinhada à direita
  const rotulo = rotuloEtiqueta(item);
  fonte(ctx, T.rotulo, 700);
  const wTag = ctx.measureText(rotulo).width + 26;
  const hTag = T.rotulo * 1.9;
  const cor = corDoItem(item);
  caixa(ctx, x + largura - PAD_CARD - wTag, cy + 4, wTag, hTag, hTag / 2, {
    preenchimento: `${cor}1a`, borda: cor, larguraBorda: 1.6,
  });
  ctx.fillStyle = cor;
  ctx.textBaseline = 'middle';
  ctx.fillText(rotulo, x + largura - PAD_CARD - wTag + 13, cy + 4 + hTag / 2);
  ctx.textBaseline = 'top';

  cy += T.hora * 1.25;
  ctx.strokeStyle = CORES.borda;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 9);
  ctx.lineTo(x + largura - PAD_CARD, cy + 9);
  ctx.stroke();
  cy += 20;

  cy += escrever(ctx, item.parteAutora, cx, cy, { largura: w, tamanho: T.nome, peso: 600 });
  cy += escrever(ctx, 'PARTE AUTORA', cx, cy, { largura: w, tamanho: T.rotulo, cor: CORES.textoFraco }) + 10;

  cy += escrever(ctx, item.parteRe, cx, cy, { largura: w, tamanho: T.corpo, cor: '#43506a' });
  cy += escrever(ctx, 'PARTE RÉ', cx, cy, { largura: w, tamanho: T.rotulo, cor: CORES.textoFraco }) + 14;

  const bloco = (rotuloBloco, valor, opcoes = {}) => {
    const hTexto = medirTexto(ctx, valor, { largura: w - 24, tamanho: T.corpo, peso: opcoes.peso || 400, maxLinhas: opcoes.maxLinhas });
    const hBloco = 16 + T.rotulo * 1.3 + hTexto + 16;
    caixa(ctx, cx, cy, w, hBloco, 10, { preenchimento: CORES.fundo });
    let by = cy + 16;
    by += escrever(ctx, rotuloBloco, cx + 12, by, { largura: w - 24, tamanho: T.rotulo, cor: CORES.textoFraco });
    escrever(ctx, valor, cx + 12, by, {
      largura: w - 24, tamanho: T.corpo, peso: opcoes.peso || 400,
      cor: opcoes.cor || CORES.marinho, maxLinhas: opcoes.maxLinhas,
    });
    cy += hBloco + 14;
  };

  bloco('PROCESSO', item.processo, { peso: 600 });
  if (item.subtipo !== 'audiencia' && item.detalhe) bloco('DESCRIÇÃO', item.detalhe, { cor: CORES.texto, maxLinhas: 4 });

  for (const [rot, valor, alerta] of [
    ['JUÍZO / VARA', item.foro, false],
    ['CIDADE', item.cidade, false],
    ['RESPONSÁVEL', item.responsavel, !item.temResponsavel],
  ]) {
    cy += escrever(ctx, rot, cx, cy, { largura: w, tamanho: T.rotulo, cor: CORES.textoFraco });
    cy += escrever(ctx, valor, cx, cy, {
      largura: w, tamanho: T.corpo, peso: alerta ? 600 : 400,
      cor: alerta ? CORES.alerta : CORES.texto,
    }) + 10;
  }

  cy += 12;
  const hBotao = 78;
  const temLink = !!item.link;

  caixa(ctx, cx, cy, w, hBotao, 10, temLink
    ? { preenchimento: CORES.marinho }
    : { preenchimento: CORES.fundo, borda: CORES.borda });

  fonte(ctx, T.botao, temLink ? 700 : 400);
  ctx.fillStyle = temLink ? '#ffffff' : CORES.textoFraco;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(temLink ? '🎥  ENTRAR NA AUDIÊNCIA' : 'LINK NÃO INFORMADO', cx + w / 2, cy + hBotao / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

/* ---------------- cabeçalho de grupo ---------------- */

const ALTURA_GRUPO = 84;

function desenharGrupoJPEG(ctx, grupo, x, y, largura, continuacao) {
  caixa(ctx, x, y, largura, ALTURA_GRUPO, 10, { preenchimento: CORES.marinhoSecundario });

  const titulo = continuacao ? `${grupo.rotulo} (CONT.)` : grupo.rotulo;
  fonte(ctx, T.grupo, 700);
  ctx.fillStyle = CORES.ouro;
  ctx.textBaseline = 'top';
  ctx.fillText(titulo, x + 22, y + 14);

  fonte(ctx, T.rotulo + 1, 400);
  ctx.fillStyle = '#dbe2ec';
  ctx.fillText(grupo.subtitulo || grupo.resumo, x + 22, y + 14 + T.grupo * 1.25);

  if (grupo.subtitulo) {
    fonte(ctx, T.rotulo, 700);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(grupo.resumo, x + largura - 22, y + 32);
    ctx.textAlign = 'left';
  }
}

/* ---------------- cabeçalho, rodapé e montagem ---------------- */

/* Altura suficiente para logomarca, título em duas linhas e a faixa de período
   sem encostar no filete dourado. */
const ALTURA_CAB = 200;
const ALTURA_RODAPE = 64;

function desenharCabecalho(ctx, doc, logo, parte, totalPartes) {
  ctx.fillStyle = CORES.marinho;
  ctx.fillRect(0, 0, LARGURA, ALTURA_CAB);
  ctx.fillStyle = CORES.ouro;
  ctx.fillRect(0, ALTURA_CAB - 5, LARGURA, 5);

  let y = 24;

  if (logo) {
    const h = 40;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    ctx.drawImage(logo, (LARGURA - w) / 2, y, w, h);
    y += h + 12;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  fonte(ctx, T.titulo, 700);
  ctx.fillStyle = CORES.ouro;
  ctx.fillText(doc.tituloLinha1, LARGURA / 2, y);
  y += T.titulo * 1.2;

  fonte(ctx, T.meta + 2, 500);
  ctx.fillStyle = '#e8ecf3';
  ctx.fillText(doc.tituloLinha2, LARGURA / 2, y);
  y += (T.meta + 2) * 1.35;

  fonte(ctx, T.meta, 400);
  ctx.fillStyle = '#c3cbd8';
  const sufixo = totalPartes > 1 ? `  ·  PARTE ${String(parte).padStart(2, '0')} DE ${String(totalPartes).padStart(2, '0')}` : '';
  ctx.fillText(`${doc.periodo.rotulo}${sufixo}`, LARGURA / 2, y);

  ctx.textAlign = 'left';
}

function desenharRodapeJPEG(ctx, doc, altura) {
  const y = altura - ALTURA_RODAPE;
  ctx.fillStyle = CORES.fundo;
  ctx.fillRect(0, y, LARGURA, ALTURA_RODAPE);
  ctx.fillStyle = CORES.ouro;
  ctx.fillRect(0, y, LARGURA, 3);

  fonte(ctx, T.meta, 400);
  ctx.fillStyle = CORES.textoFraco;
  ctx.textBaseline = 'middle';
  ctx.fillText(`Emitido em ${doc.emitidoEm}`, MARGEM, y + ALTURA_RODAPE / 2);

  ctx.textAlign = 'right';
  ctx.fillText(`${doc.resumo.total} registro${doc.resumo.total === 1 ? '' : 's'}`, LARGURA - MARGEM, y + ALTURA_RODAPE / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function carregarImagemLogo(dataURI) {
  if (!dataURI) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataURI;
  });
}

/**
 * Gera o JPEG vertical, dividido em partes quando necessário.
 * @returns {Promise<Array<{blob: Blob, parte: number, total: number}>>}
 */
export async function gerarJPEG(doc) {
  const logo = await carregarImagemLogo(await carregarLogoDataURI());

  const medidor = document.createElement('canvas').getContext('2d');
  const largura = LARGURA - MARGEM * 2;

  // 1) achata em elementos medidos
  const elementos = [];
  for (const grupo of doc.grupos) {
    elementos.push({ tipo: 'grupo', grupo, altura: ALTURA_GRUPO + 14 });
    for (const item of grupo.itens) {
      elementos.push({ tipo: 'card', item, altura: medirCard(medidor, item, largura) + GAP_CARD });
    }
    elementos.push({ tipo: 'espaco', altura: 10 });
  }

  // 2) reparte em páginas, nunca cortando card nem deixando título órfão
  const util = ALTURA_MAX - ALTURA_CAB - ALTURA_RODAPE - MARGEM * 2;
  const partes = [];
  let atual = [];
  let usado = 0;

  for (let i = 0; i < elementos.length; i++) {
    const el = elementos[i];
    const conjunto = el.tipo === 'grupo' && elementos[i + 1]
      ? el.altura + elementos[i + 1].altura
      : el.altura;

    if (usado > 0 && usado + conjunto > util) {
      partes.push(atual);
      atual = [];
      usado = 0;
    }

    atual.push(el);
    usado += el.altura;
  }
  if (atual.length || !partes.length) partes.push(atual);

  // 3) desenha cada parte
  const gruposVistos = new Set();
  const arquivos = [];

  for (let p = 0; p < partes.length; p++) {
    const blocos = partes[p];
    const alturaConteudo = blocos.reduce((s, b) => s + b.altura, 0);
    const altura = Math.max(
      600,
      Math.round(ALTURA_CAB + MARGEM + alturaConteudo + MARGEM + ALTURA_RODAPE)
    );

    const canvas = document.createElement('canvas');
    canvas.width = LARGURA;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = CORES.fundo;
    ctx.fillRect(0, 0, LARGURA, altura);

    desenharCabecalho(ctx, doc, logo, p + 1, partes.length);

    let y = ALTURA_CAB + MARGEM;
    for (const el of blocos) {
      if (el.tipo === 'grupo') {
        const repetido = gruposVistos.has(el.grupo.chave);
        gruposVistos.add(el.grupo.chave);
        desenharGrupoJPEG(ctx, el.grupo, MARGEM, y, largura, repetido);
      } else if (el.tipo === 'card') {
        desenharCard(ctx, el.item, MARGEM, y, largura, el.altura - GAP_CARD);
      }
      y += el.altura;
    }

    if (!blocos.length) {
      fonte(ctx, T.corpo, 400);
      ctx.fillStyle = CORES.textoFraco;
      ctx.textAlign = 'center';
      ctx.fillText('Nenhum registro no período selecionado.', LARGURA / 2, ALTURA_CAB + 120);
      ctx.textAlign = 'left';
    }

    desenharRodapeJPEG(ctx, doc, altura);

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.93));
    arquivos.push({ blob, parte: p + 1, total: partes.length });
  }

  return arquivos;
}
