/* PAUTA CF — exportação em imagem JPEG.
 *
 * Duas plataformas, o mesmo documento:
 *
 *   MOBILE — cards verticais em 1080 px, tipos grandes, pensado para leitura
 *            direta no celular e envio por WhatsApp.
 *   A4     — tabela em paisagem na proporção da folha A4, com as mesmas colunas
 *            do PDF completo, para quem quer a pauta inteira numa imagem.
 *
 * Imagens muito longas são recusadas pelos aplicativos e ficam ilegíveis, por
 * isso a pauta é dividida em partes numeradas, sempre em limites de card ou de
 * linha — nunca no meio de um registro.
 */

import {
  CORES, ICONE_MODALIDADE, distribuirColunas, valorDaCelula,
} from './formato.js';
import { carregarLogoDataURI } from './doc-html.js';

const FONTE = '"Poppins", Arial, Helvetica, sans-serif';

/* MOBILE — escala de cards. */
const T = {
  hora: 40, nome: 34, corpo: 29, rotulo: 21, botao: 30, grupo: 30, titulo: 34, meta: 22,
  obsTitulo: 30, obsCorpo: 27,
};

/* A4 — escala de tabela. 2400 px sobre os 273 mm de área útil da folha dão
   cerca de 8,8 px/mm, então o corpo de 8,5 pt do PDF equivale a 26 px aqui:
   as duas saídas A4 têm o mesmo peso visual. */
const T_A4 = {
  corpo: 26, cabTabela: 23, grupo: 34, titulo: 46, meta: 24, rotulo: 21,
  resumoValor: 40, resumoRotulo: 19, obsTitulo: 32, obsCorpo: 27,
  // Etiqueta menor que o rótulo comum: "PRESENCIAL" é a modalidade mais larga e
  // precisa caber na coluna de modalidade sem a fonte ser reduzida linha a linha.
  etiqueta: 19,
};

/* Altura máxima por parte. No MOBILE é alta o bastante para caber um dia
   inteiro sem picotar; no A4 respeita a proporção da folha em paisagem
   (2400 × 1700 ≈ 297 × 210 mm). */
export const PLATAFORMAS_JPEG = {
  mobile: {
    largura: 1080, alturaMax: 4000, margem: 36,
    alturaCab: 200, alturaRodape: 64, tipo: T, marcaCentralizada: true,
  },
  a4: {
    largura: 2400, alturaMax: 1700, margem: 56,
    alturaCab: 190, alturaRodape: 70, tipo: T_A4, marcaCentralizada: false,
  },
};

const PAD_CARD = 26;
const GAP_CARD = 18;

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

/**
 * Rótulo da etiqueta.
 * O ícone acompanha a cor para a etiqueta não depender só do tom, mas na tabela
 * A4 ele é dispensado: a célula é estreita e o emoji, largo, empurraria a pílula
 * para dentro da coluna vizinha. É também o que o PDF A4 já faz.
 */
function rotuloEtiqueta(item, comIcone = true) {
  if (item.subtipo === 'prazo') return comIcone ? '⏳ PRAZO' : 'PRAZO';
  if (item.subtipo === 'tarefa') return comIcone ? '✓ TAREFA' : 'TAREFA';

  const modalidade = (item.modalidade || '—').toUpperCase();
  if (!comIcone) return modalidade;

  return `${ICONE_MODALIDADE[item.modalidade] || '•'} ${modalidade}`;
}

/**
 * Etiqueta de modalidade em pílula, alinhada à direita de `xDireita`.
 * @param {object} [opcoes] { icone, larguraMax }
 */
function desenharEtiqueta(ctx, item, xDireita, y, tamanho, opcoes = {}) {
  const { icone = true, larguraMax = 0 } = opcoes;
  const rotulo = rotuloEtiqueta(item, icone);
  const cor = corDoItem(item);

  // Nome de modalidade longo num espaço apertado: encolhe a fonte em vez de
  // invadir o que está ao lado.
  fonte(ctx, tamanho, 700);
  if (larguraMax) {
    const cheia = ctx.measureText(rotulo).width + 26;
    if (cheia > larguraMax) {
      tamanho = Math.max(14, tamanho * ((larguraMax - 26) / (cheia - 26)));
      fonte(ctx, tamanho, 700);
    }
  }

  const w = ctx.measureText(rotulo).width + 26;
  const h = tamanho * 1.9;
  const x = xDireita - w;

  caixa(ctx, x, y, w, h, h / 2, { preenchimento: `${cor}1a`, borda: cor, larguraBorda: 1.6 });

  ctx.fillStyle = cor;
  ctx.textBaseline = 'middle';
  ctx.fillText(rotulo, x + 13, y + h / 2);
  ctx.textBaseline = 'top';

  return { largura: w, altura: h };
}

/* ================= OBSERVAÇÕES IMPORTANTES ================= */

const OBS = { pad: 26, recuo: 40, gapItem: 10, gapTitulo: 14 };

const larguraObs = (largura) => largura - OBS.pad * 2 - OBS.recuo;

function medirObs(ctx, doc, largura, tipo) {
  if (!doc.observacoes?.length) return 0;

  let h = OBS.pad;
  h += medirTexto(ctx, doc.tituloObservacoes, {
    largura: largura - OBS.pad * 2, tamanho: tipo.obsTitulo, peso: 700,
  });
  h += OBS.gapTitulo;

  for (const texto of doc.observacoes) {
    h += medirTexto(ctx, texto, { largura: larguraObs(largura), tamanho: tipo.obsCorpo }) + OBS.gapItem;
  }

  return h - OBS.gapItem + OBS.pad;
}

function desenharObs(ctx, doc, x, y, largura, altura, tipo) {
  caixa(ctx, x, y, largura, altura, 12, {
    preenchimento: '#fffdf7', borda: CORES.ouro, larguraBorda: 2,
  });
  caixa(ctx, x, y + 8, 7, altura - 16, 3.5, { preenchimento: CORES.ouro });

  let cy = y + OBS.pad;

  cy += escrever(ctx, doc.tituloObservacoes, x + OBS.pad, cy, {
    largura: largura - OBS.pad * 2, tamanho: tipo.obsTitulo, peso: 700, cor: CORES.marinho,
  }) + OBS.gapTitulo;

  doc.observacoes.forEach((texto, i) => {
    escrever(ctx, `${i + 1}.`, x + OBS.pad, cy, {
      largura: OBS.recuo, tamanho: tipo.obsCorpo, peso: 700, cor: CORES.ouro,
    });

    cy += escrever(ctx, texto, x + OBS.pad + OBS.recuo, cy, {
      largura: larguraObs(largura), tamanho: tipo.obsCorpo,
    }) + OBS.gapItem;
  });
}

/* ================= MODELO MOBILE (cards) ================= */

/** Altura da linha de data — zero fora do documento de audiência única. */
const alturaData = (item) => (item.mostrarData ? T.rotulo * 1.3 + 8 : 0);

function medirCard(ctx, item, largura) {
  const w = largura - PAD_CARD * 2;
  let h = PAD_CARD;

  h += alturaData(item);
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

  if (item.mostrarData) {
    escrever(ctx, item.dataLonga.toUpperCase(), cx, cy, {
      largura: w, tamanho: T.rotulo, peso: 600, cor: CORES.ouro,
    });
    cy += alturaData(item);
  }

  fonte(ctx, T.hora, 700);
  ctx.fillStyle = CORES.marinho;
  ctx.textBaseline = 'top';
  ctx.fillText(item.horario, cx, cy);

  desenharEtiqueta(ctx, item, x + largura - PAD_CARD, cy + 4, T.rotulo);

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

/* ================= MODELO A4 (tabela) ================= */

const PAD_CEL = 12;
const ALTURA_CAB_TABELA = 52;
const ALTURA_RESUMO = 108;

function medirLinha(ctx, item, colunas) {
  let maior = T_A4.corpo * 1.3;

  for (const col of colunas) {
    if (col.chave === 'modalidade') continue;
    const h = medirTexto(ctx, valorDaCelula(item, col.chave), {
      largura: col.largura - PAD_CEL * 2, tamanho: T_A4.corpo,
    });
    maior = Math.max(maior, h);
  }

  return maior + PAD_CEL * 2;
}

function desenharCabTabela(ctx, colunas, x, y, largura) {
  ctx.fillStyle = CORES.marinho;
  ctx.fillRect(x, y, largura, ALTURA_CAB_TABELA);

  fonte(ctx, T_A4.cabTabela, 700);
  ctx.fillStyle = CORES.ouro;
  ctx.textBaseline = 'middle';

  for (const col of colunas) {
    ctx.fillText(col.titulo, x + col.x + PAD_CEL, y + ALTURA_CAB_TABELA / 2);
  }

  ctx.textBaseline = 'top';
}

function desenharLinha(ctx, item, colunas, x, y, largura, altura, par) {
  if (par) {
    ctx.fillStyle = '#fafbfd';
    ctx.fillRect(x, y, largura, altura);
  }

  for (const col of colunas) {
    const cx = x + col.x + PAD_CEL;

    if (col.chave === 'modalidade') {
      desenharEtiqueta(ctx, item, cx + col.largura - PAD_CEL * 2, y + PAD_CEL, T_A4.etiqueta, {
        icone: false,
        larguraMax: col.largura - PAD_CEL * 2,
      });
      continue;
    }

    const destaque = col.chave === 'horario' || col.chave === 'responsavel';
    const alerta = col.chave === 'responsavel' && !item.temResponsavel;
    const acesso = col.chave === 'acesso' && item.link;

    escrever(ctx, valorDaCelula(item, col.chave), cx, y + PAD_CEL, {
      largura: col.largura - PAD_CEL * 2,
      tamanho: T_A4.corpo,
      peso: destaque || acesso ? 600 : 400,
      cor: alerta ? CORES.alerta : acesso ? CORES.virtual : destaque ? CORES.marinho : CORES.texto,
    });
  }

  ctx.strokeStyle = CORES.borda;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + altura);
  ctx.lineTo(x + largura, y + altura);
  ctx.stroke();
}

function desenharResumo(ctx, doc, x, y, largura) {
  const r = doc.resumo;
  const cartoes = [
    ['AUDIÊNCIAS', r.audiencias, false],
    ['PRAZOS', r.prazos + r.tarefas, false],
    ['COMARCAS', r.comarcas, false],
    ['SEM RESPONSÁVEL', r.semResponsavel, r.semResponsavel > 0],
    ['VIRTUAIS', r.virtuais, false],
    ['PRESENCIAIS', r.presenciais, false],
  ];

  const gap = 14;
  const w = (largura - gap * (cartoes.length - 1)) / cartoes.length;
  const h = ALTURA_RESUMO - 18;

  cartoes.forEach(([rotulo, valor, alerta], i) => {
    const cx = x + i * (w + gap);

    caixa(ctx, cx, y, w, h, 10, { preenchimento: '#ffffff', borda: CORES.borda, larguraBorda: 1.5 });
    caixa(ctx, cx, y, 6, h, 3, { preenchimento: alerta ? CORES.alerta : CORES.ouro });

    escrever(ctx, String(valor), cx + 20, y + 14, {
      largura: w - 32, tamanho: T_A4.resumoValor, peso: 700, cor: CORES.texto,
    });
    escrever(ctx, rotulo, cx + 20, y + 20 + T_A4.resumoValor, {
      largura: w - 32, tamanho: T_A4.resumoRotulo, cor: CORES.textoFraco, maxLinhas: 1,
    });
  });

  return ALTURA_RESUMO;
}

/* ================= cabeçalho de grupo ================= */

const ALTURA_GRUPO = { mobile: 84, a4: 76 };

function desenharGrupo(ctx, grupo, x, y, largura, continuacao, tipo, altura) {
  caixa(ctx, x, y, largura, altura, 10, { preenchimento: CORES.marinhoSecundario });

  const titulo = continuacao ? `${grupo.rotulo} (CONT.)` : grupo.rotulo;

  fonte(ctx, tipo.grupo, 700);
  ctx.fillStyle = CORES.ouro;
  ctx.textBaseline = 'top';
  ctx.fillText(titulo, x + 22, y + 14);

  fonte(ctx, tipo.rotulo + 1, 400);
  ctx.fillStyle = '#dbe2ec';
  ctx.fillText(grupo.subtitulo || grupo.resumo, x + 22, y + 14 + tipo.grupo * 1.25);

  if (grupo.subtitulo) {
    fonte(ctx, tipo.rotulo, 700);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(grupo.resumo, x + largura - 22, y + 32);
    ctx.textAlign = 'left';
  }
}

/* ================= cabeçalho e rodapé da imagem ================= */

function desenharCabecalho(ctx, doc, logo, parte, totalPartes, P) {
  const { largura: L, alturaCab, tipo } = P;

  ctx.fillStyle = CORES.marinho;
  ctx.fillRect(0, 0, L, alturaCab);
  ctx.fillStyle = CORES.ouro;
  ctx.fillRect(0, alturaCab - 5, L, 5);

  const sufixo = totalPartes > 1
    ? `  ·  PARTE ${String(parte).padStart(2, '0')} DE ${String(totalPartes).padStart(2, '0')}`
    : '';

  /* No MOBILE a marca vai centralizada, como num documento estreito. No A4 o
     desenho acompanha o PDF completo: marca à esquerda, metadados à direita. */
  if (P.marcaCentralizada) {
    let y = 24;

    if (logo) {
      const h = 40;
      const w = (logo.naturalWidth / logo.naturalHeight) * h;
      ctx.drawImage(logo, (L - w) / 2, y, w, h);
      y += h + 12;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    /* Sem a linha "PAUTA DE AUDIÊNCIAS" o nome do escritório vira o título, e a
       faixa encolhe em vez de guardar espaço vazio. */
    if (doc.tituloLinha1) {
      fonte(ctx, tipo.titulo, 700);
      ctx.fillStyle = CORES.ouro;
      ctx.fillText(doc.tituloLinha1, L / 2, y);
      y += tipo.titulo * 1.2;

      fonte(ctx, tipo.meta + 2, 500);
      ctx.fillStyle = '#e8ecf3';
      ctx.fillText(doc.tituloLinha2, L / 2, y);
      y += (tipo.meta + 2) * 1.35;
    } else {
      fonte(ctx, tipo.titulo, 700);
      ctx.fillStyle = CORES.ouro;
      ctx.fillText(doc.tituloLinha2, L / 2, y);
      y += tipo.titulo * 1.35;
    }

    fonte(ctx, tipo.meta, 400);
    ctx.fillStyle = '#c3cbd8';
    ctx.fillText(`${doc.periodo.rotulo}${sufixo}`, L / 2, y);

    ctx.textAlign = 'left';
    return;
  }

  let x = P.margem;
  ctx.textBaseline = 'top';

  if (logo) {
    const h = 62;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    ctx.drawImage(logo, x, (alturaCab - 5 - h) / 2, w, h);
    x += w + 30;
  }

  if (doc.tituloLinha1) {
    fonte(ctx, tipo.titulo, 700);
    ctx.fillStyle = CORES.ouro;
    ctx.fillText(doc.tituloLinha1, x, alturaCab / 2 - tipo.titulo * 0.95);

    fonte(ctx, tipo.meta + 2, 500);
    ctx.fillStyle = '#e8ecf3';
    ctx.fillText(doc.tituloLinha2, x, alturaCab / 2 + 8);
  } else {
    fonte(ctx, tipo.titulo, 700);
    ctx.fillStyle = CORES.ouro;
    ctx.fillText(doc.tituloLinha2, x, alturaCab / 2 - tipo.titulo * 0.6);
  }

  ctx.textAlign = 'right';
  const xDir = L - P.margem;

  fonte(ctx, tipo.meta + 2, 700);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${doc.periodo.rotulo}${sufixo}`, xDir, 44);

  fonte(ctx, tipo.meta, 400);
  ctx.fillStyle = '#c3cbd8';
  ctx.fillText(`${doc.resumo.total} registro${doc.resumo.total === 1 ? '' : 's'}`, xDir, 44 + tipo.meta * 1.7);
  ctx.fillText(`Emitido em ${doc.emitidoEm}`, xDir, 44 + tipo.meta * 3.1);

  ctx.textAlign = 'left';
}

function desenharRodape(ctx, doc, altura, P) {
  const { largura: L, alturaRodape, tipo } = P;
  const y = altura - alturaRodape;

  ctx.fillStyle = CORES.fundo;
  ctx.fillRect(0, y, L, alturaRodape);
  ctx.fillStyle = CORES.ouro;
  ctx.fillRect(0, y, L, 3);

  fonte(ctx, tipo.meta, 400);
  ctx.fillStyle = CORES.textoFraco;
  ctx.textBaseline = 'middle';

  const esquerda = P.marcaCentralizada ? `Emitido em ${doc.emitidoEm}` : doc.titulo;
  ctx.fillText(esquerda, P.margem, y + alturaRodape / 2);

  ctx.textAlign = 'right';
  ctx.fillText(
    `${doc.resumo.total} registro${doc.resumo.total === 1 ? '' : 's'}`,
    L - P.margem,
    y + alturaRodape / 2
  );
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

/* ================= montagem ================= */

/** Achata o documento numa lista linear de elementos já medidos. */
function montarElementos(ctx, doc, P, ehA4, largura) {
  const elementos = [];
  const hGrupo = ehA4 ? ALTURA_GRUPO.a4 : ALTURA_GRUPO.mobile;

  for (const grupo of doc.grupos) {
    elementos.push({ tipo: 'grupo', grupo, altura: hGrupo + 14 });

    if (ehA4) {
      const colunas = distribuirColunas(largura);
      elementos.push({ tipo: 'cabtabela', colunas, altura: ALTURA_CAB_TABELA });
      grupo.itens.forEach((item, i) => {
        elementos.push({
          tipo: 'linha', item, colunas, par: i % 2 === 1,
          altura: medirLinha(ctx, item, colunas),
        });
      });
      elementos.push({ tipo: 'espaco', altura: 26 });
    } else {
      for (const item of grupo.itens) {
        elementos.push({ tipo: 'card', item, altura: medirCard(ctx, item, largura) + GAP_CARD });
      }
      elementos.push({ tipo: 'espaco', altura: 10 });
    }
  }

  const hObs = medirObs(ctx, doc, largura, P.tipo);
  if (hObs) elementos.push({ tipo: 'observacoes', altura: hObs + GAP_CARD });

  return elementos;
}

/**
 * Reparte os elementos em partes, sem cortar registro e sem deixar cabeçalho de
 * grupo órfão no pé da imagem.
 */
function repartir(elementos, utilPrimeira, utilDemais) {
  const partes = [];
  let atual = [];
  let usado = 0;
  let limite = utilPrimeira;

  const fechar = () => {
    if (atual.length) partes.push(atual);
    atual = [];
    usado = 0;
    limite = utilDemais;
  };

  for (let i = 0; i < elementos.length; i++) {
    const el = elementos[i];

    // Cabeçalho de grupo só entra se o primeiro registro couber junto.
    const conjunto = el.tipo === 'grupo' && elementos[i + 1]
      ? el.altura + elementos[i + 1].altura
      : el.altura;

    if (usado > 0 && usado + conjunto > limite) fechar();

    // Elemento maior que a imagem inteira: entra sozinho para não sumir.
    if (el.altura > limite && atual.length) fechar();

    atual.push(el);
    usado += el.altura;
  }

  fechar();
  return partes.length ? partes : [[]];
}

/**
 * Gera o JPEG, dividido em partes quando necessário.
 * @param {object} doc documento vindo de montarDocumento()
 * @param {object} [opcoes] { plataforma: 'a4' | 'mobile' }
 * @returns {Promise<Array<{blob: Blob, parte: number, total: number}>>}
 */
export async function gerarJPEG(doc, opcoes = {}) {
  const P = PLATAFORMAS_JPEG[opcoes.plataforma] || PLATAFORMAS_JPEG.mobile;
  const ehA4 = P === PLATAFORMAS_JPEG.a4;

  const logo = await carregarImagemLogo(await carregarLogoDataURI());
  const medidor = document.createElement('canvas').getContext('2d');
  const largura = P.largura - P.margem * 2;

  const elementos = montarElementos(medidor, doc, P, ehA4, largura);

  /* O resumo executivo do A4 só ocupa espaço na primeira parte, e no documento
     de audiência única não entra: contar "1 audiência" é repetir o documento. */
  const comResumo = ehA4 && !doc.exportacaoIndividual;
  const alturaResumo = comResumo ? ALTURA_RESUMO + 20 : 0;
  const base = P.alturaMax - P.alturaCab - P.alturaRodape - P.margem * 2;
  const partes = repartir(elementos, base - alturaResumo, base);

  const gruposVistos = new Set();
  const arquivos = [];

  for (let p = 0; p < partes.length; p++) {
    const blocos = partes[p];
    const alturaConteudo = blocos.reduce((s, b) => s + b.altura, 0)
      + (p === 0 ? alturaResumo : 0);

    const altura = Math.max(
      600,
      Math.round(P.alturaCab + P.margem + alturaConteudo + P.margem + P.alturaRodape)
    );

    const canvas = document.createElement('canvas');
    canvas.width = P.largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = CORES.fundo;
    ctx.fillRect(0, 0, P.largura, altura);

    desenharCabecalho(ctx, doc, logo, p + 1, partes.length, P);

    let y = P.alturaCab + P.margem;

    if (comResumo && p === 0) {
      y += desenharResumo(ctx, doc, P.margem, y, largura) + 20;
    }

    for (const el of blocos) {
      switch (el.tipo) {
        case 'grupo': {
          const repetido = gruposVistos.has(el.grupo.chave);
          gruposVistos.add(el.grupo.chave);
          desenharGrupo(
            ctx, el.grupo, P.margem, y, largura, repetido, P.tipo,
            el.altura - 14
          );
          break;
        }
        case 'cabtabela':
          desenharCabTabela(ctx, el.colunas, P.margem, y, largura);
          break;
        case 'linha':
          desenharLinha(ctx, el.item, el.colunas, P.margem, y, largura, el.altura, el.par);
          break;
        case 'card':
          desenharCard(ctx, el.item, P.margem, y, largura, el.altura - GAP_CARD);
          break;
        case 'observacoes':
          desenharObs(ctx, doc, P.margem, y, largura, el.altura - GAP_CARD, P.tipo);
          break;
        default:
          break;
      }
      y += el.altura;
    }

    if (!doc.itens.length) {
      fonte(ctx, P.tipo.corpo, 400);
      ctx.fillStyle = CORES.textoFraco;
      ctx.textAlign = 'center';
      ctx.fillText('Nenhum registro no período selecionado.', P.largura / 2, P.alturaCab + 120);
      ctx.textAlign = 'left';
    }

    desenharRodape(ctx, doc, altura, P);

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.93));
    arquivos.push({ blob, parte: p + 1, total: partes.length });
  }

  return arquivos;
}
