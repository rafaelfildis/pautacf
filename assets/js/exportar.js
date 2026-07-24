/* PAUTA CF — orquestração das exportações.
 *
 * Reúne modal de configuração, pré-visualização (computador e celular),
 * impressão e download. Cada formato é um componente próprio; nada aqui captura
 * a tela do sistema — os documentos são construídos do zero a partir dos dados.
 */

import {
  MARCA, MODOS_DOCUMENTO, CHAVES_AGRUPAMENTO, VAZIO_RESPONSAVEL,
  ehDispositivoMovel, gerarNomeArquivo,
} from './formato.js';
import { montarDocumento, individualizar, padraoPara } from './documento.js';
import { gerarHTML, PAPEIS } from './doc-html.js';
import { gerarPDF, PAGINAS_PDF } from './pdf.js';
import { gerarJPEG } from './jpeg.js';

const $ = (s) => document.querySelector(s);

/** Larguras de aparelho oferecidas na prévia MOBILE. */
const LARGURAS_APARELHO = [360, 390, 430];

let contexto = { registros: [], periodo: null, avisar: () => {} };

export function configurarExportacao(fn) {
  contexto.obterDados = fn;
}

/* ---------------- download ---------------- */

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------------- leitura do modal ---------------- */

function lerConfiguracao() {
  const v = (id) => $(`#${id}`)?.value ?? '';
  const c = (id) => !!$(`#${id}`)?.checked;

  return {
    formato: v('expFormato'),
    orientacao: v('expOrientacao'),
    visualizacao: v('expVisualizacao'),
    agrupamento: v('expAgrupamento') || CHAVES_AGRUPAMENTO.data,
    documentos: v('expDocumentos') || MODOS_DOCUMENTO.exibir,
    conteudo: v('expConteudo'),
    papel: v('expPapel'),
    exibirLinks: c('expLinks'),
    exibirSemResponsavel: c('expSemResp'),
    individualizarPor: v('expIndividualizar'),
  };
}

/** Aplica o recorte de conteúdo escolhido no modal sobre os registros da tela. */
function filtrarConteudo(registros, conteudo) {
  if (conteudo === 'audiencias') return registros.filter((r) => r.subtipo === 'audiencia');
  if (conteudo === 'audiencias+prazos') {
    return registros.filter((r) => r.subtipo === 'audiencia' || r.subtipo === 'prazo');
  }
  return registros;
}

/** Traduz orientação e papel escolhidos para a chave de página do PDF. */
function chavePagina(cfg, modo) {
  if (modo === 'mobile') {
    return cfg.papel === 'a4-retrato' ? 'mobile-a4' : 'mobile';
  }
  if (cfg.orientacao === 'retrato') return 'completo-retrato';
  return 'completo';
}

function papelImpressao(cfg, modo) {
  if (cfg.papel && PAPEIS[cfg.papel]) return cfg.papel;
  if (modo === 'mobile') return 'a4-retrato';
  return cfg.orientacao === 'retrato' ? 'a4-retrato' : 'a4-paisagem';
}

/* ---------------- versão escrita ---------------- */

function montarTexto(doc) {
  const L = [
    MARCA.tituloLinha1,
    MARCA.tituloLinha2,
    doc.periodo.rotulo,
    '='.repeat(52),
    '',
  ];

  if (!doc.itens.length) {
    L.push('Nenhum registro no período selecionado.');
    return L.join('\n');
  }

  const r = doc.resumo;
  L.push(`${r.total} registros · ${r.audiencias} audiências · ${r.prazos + r.tarefas} prazos/tarefas`);
  if (r.semResponsavel) L.push(`${r.semResponsavel} sem responsável definido`);
  L.push('');

  for (const grupo of doc.grupos) {
    L.push(`${grupo.rotulo}${grupo.subtitulo ? ` — ${grupo.subtitulo}` : ''}`);
    L.push(`(${grupo.resumo})`);
    L.push('-'.repeat(52));

    for (const item of grupo.itens) {
      L.push(`${item.horario} · ${item.modalidade}`);
      L.push(`  Autora: ${item.parteAutora}`);
      L.push(`  Ré: ${item.parteRe}`);
      L.push(`  Processo: ${item.processo}`);
      L.push(`  Vara: ${item.foro}${item.foroComplemento ? ` (${item.foroComplemento})` : ''}`);
      L.push(`  Cidade: ${item.cidade}`);
      L.push(`  Responsável: ${item.responsavel}`);
      if (item.link) L.push(`  Acesso: ${item.link}`);
      L.push('');
    }
  }

  L.push('='.repeat(52));
  L.push(`Emitido em ${doc.emitidoEm}`);

  return L.join('\n');
}

/* ---------------- impressão ---------------- */

/**
 * Abre o documento numa janela própria e dispara a impressão.
 * Janela nova (em vez de iframe) porque é o caminho que funciona também no
 * Safari do iPhone e no Chrome do Android.
 */
function imprimirHTML(html) {
  const janela = window.open('', '_blank');

  if (!janela) {
    contexto.avisar('O navegador bloqueou a janela de impressão. Libere os pop-ups e tente de novo.', true);
    return false;
  }

  janela.document.open();
  janela.document.write(html.replace(
    '</body>',
    `<script>
       window.addEventListener('load', function () {
         setTimeout(function () { window.focus(); window.print(); }, 350);
       });
     <\/script></body>`
  ));
  janela.document.close();
  return true;
}

/* ---------------- pré-visualização ---------------- */

function fecharPrevia() {
  $('#modalPrevia')?.close();
}

async function abrirPrevia(doc, modo, cfg) {
  const modal = $('#modalPrevia');
  const palco = $('#previaPalco');
  const controles = $('#previaControles');

  $('#previaTitulo').textContent = modo === 'mobile'
    ? 'Prévia MOBILE'
    : 'Prévia completa';

  const larguraInicial = 390;
  const html = await gerarHTML(doc, modo, {
    papel: papelImpressao(cfg, modo),
    larguraMobile: modo === 'mobile' ? larguraInicial : 0,
  });

  palco.replaceChildren();
  controles.replaceChildren();

  const quadro = document.createElement('div');
  quadro.className = modo === 'mobile' ? 'previa-moldura' : 'previa-folha';

  const iframe = document.createElement('iframe');
  iframe.className = 'previa-iframe';
  iframe.title = 'Pré-visualização do documento';
  iframe.srcdoc = html;

  if (modo === 'mobile') {
    const entalhe = document.createElement('span');
    entalhe.className = 'previa-moldura__notch';
    quadro.appendChild(entalhe);
    quadro.style.width = `${larguraInicial}px`;
  }

  quadro.appendChild(iframe);
  palco.appendChild(quadro);

  /* --- controles --- */

  if (modo === 'mobile') {
    const grupo = document.createElement('div');
    grupo.className = 'previa-larguras';

    const trocar = async (largura, botao) => {
      quadro.style.width = `${largura}px`;
      [...grupo.querySelectorAll('button')].forEach((b) => b.classList.remove('ativo'));
      botao.classList.add('ativo');
      iframe.srcdoc = await gerarHTML(doc, 'mobile', {
        papel: papelImpressao(cfg, 'mobile'),
        larguraMobile: largura,
      });
    };

    for (const largura of LARGURAS_APARELHO) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn--fantasma btn--mini${largura === larguraInicial ? ' ativo' : ''}`;
      b.textContent = `${largura}px`;
      b.addEventListener('click', () => trocar(largura, b));
      grupo.appendChild(b);
    }

    const iphone = document.createElement('button');
    iphone.type = 'button';
    iphone.className = 'btn btn--fantasma btn--mini';
    iphone.textContent = 'iPhone';
    iphone.addEventListener('click', () => trocar(390, iphone));

    const android = document.createElement('button');
    android.type = 'button';
    android.className = 'btn btn--fantasma btn--mini';
    android.textContent = 'Android';
    android.addEventListener('click', () => trocar(360, android));

    grupo.append(iphone, android);
    controles.appendChild(grupo);
  }

  const acoes = document.createElement('div');
  acoes.className = 'previa-acoes';

  const botao = (rotulo, classe, aoClicar) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${classe}`;
    b.textContent = rotulo;
    b.addEventListener('click', aoClicar);
    return b;
  };

  acoes.append(
    botao(modo === 'mobile' ? 'Imprimir MOBILE' : 'Imprimir', 'btn--escuro', () => {
      gerarHTML(doc, modo, { papel: papelImpressao(cfg, modo) }).then(imprimirHTML);
    }),
    botao(modo === 'mobile' ? 'Exportar PDF MOBILE' : 'Exportar PDF', 'btn--ouro', async () => {
      await executar({ ...cfg, formato: modo === 'mobile' ? 'pdf-mobile' : 'pdf-completo' }, doc);
    }),
    botao('Exportar JPEG', 'btn--escuro', async () => {
      await executar({ ...cfg, formato: 'jpeg' }, doc);
    })
  );

  controles.appendChild(acoes);

  if (!modal.open) modal.showModal();
}

/* ---------------- execução ---------------- */

async function entregarPDF(doc, modo, cfg, escopo = '', tipoEscopo = '') {
  const { blob, paginas } = await gerarPDF(doc, modo, { pagina: chavePagina(cfg, modo) });

  const nome = gerarNomeArquivo({
    de: doc.periodo.de,
    ate: doc.periodo.ate,
    variante: modo === 'mobile' ? 'mobile' : 'completo',
    escopo,
    tipoEscopo,
    extensao: 'pdf',
  });

  baixar(blob, nome);
  return paginas;
}

async function entregarJPEG(doc, escopo = '') {
  const arquivos = await gerarJPEG(doc);

  for (const { blob, parte, total } of arquivos) {
    const nome = gerarNomeArquivo({
      de: doc.periodo.de,
      ate: doc.periodo.ate,
      variante: 'jpeg',
      escopo,
      parte: total > 1 ? parte : 0,
      extensao: 'jpg',
    });
    baixar(blob, nome);
    // Alguns navegadores descartam downloads simultâneos.
    await new Promise((r) => setTimeout(r, 350));
  }

  return arquivos.length;
}

/**
 * Executa o formato escolhido.
 * @param {object} cfg configuração do modal
 * @param {object} [documentoPronto] reaproveitado quando vem da prévia
 */
async function executar(cfg, documentoPronto = null) {
  const { registros, periodo } = contexto.obterDados();
  const selecionados = filtrarConteudo(registros, cfg.conteudo);

  if (!selecionados.length && cfg.formato !== 'texto') {
    contexto.avisar('Nenhum registro para exportar com os filtros atuais.', true);
    return;
  }

  /* --- documentos individualizados --- */
  if (cfg.individualizarPor && cfg.formato !== 'texto') {
    const lotes = individualizar(selecionados, periodo, cfg);
    const modo = cfg.formato === 'pdf-mobile' ? 'mobile' : 'completo';

    for (const { escopo, documento } of lotes) {
      if (cfg.formato === 'jpeg') await entregarJPEG(documento, escopo);
      else await entregarPDF(documento, modo, cfg, escopo, cfg.individualizarPor);
      await new Promise((r) => setTimeout(r, 350));
    }

    contexto.avisar(`${lotes.length} documento${lotes.length > 1 ? 's' : ''} gerado${lotes.length > 1 ? 's' : ''}.`);
    return;
  }

  const doc = documentoPronto || montarDocumento(selecionados, periodo, cfg);

  switch (cfg.formato) {
    case 'pdf-completo': {
      const p = await entregarPDF(doc, 'completo', cfg);
      contexto.avisar(`PDF gerado com ${p} página${p > 1 ? 's' : ''}.`);
      break;
    }

    case 'pdf-mobile': {
      const p = await entregarPDF(doc, 'mobile', cfg);
      contexto.avisar(`PDF MOBILE gerado com ${p} página${p > 1 ? 's' : ''}.`);
      break;
    }

    case 'imprimir-completo': {
      const html = await gerarHTML(doc, 'completo', { papel: papelImpressao(cfg, 'completo') });
      if (imprimirHTML(html)) contexto.avisar('Janela de impressão aberta.');
      break;
    }

    case 'imprimir-mobile': {
      const html = await gerarHTML(doc, 'mobile', { papel: papelImpressao(cfg, 'mobile') });
      if (imprimirHTML(html)) contexto.avisar('Janela de impressão MOBILE aberta.');
      break;
    }

    case 'jpeg': {
      const n = await entregarJPEG(doc);
      contexto.avisar(n > 1 ? `JPEG gerado em ${n} partes.` : 'JPEG gerado.');
      break;
    }

    case 'previa-completa':
      await abrirPrevia(doc, 'completo', cfg);
      break;

    case 'previa-mobile':
      await abrirPrevia(doc, 'mobile', cfg);
      break;

    case 'texto': {
      $('#saidaTexto').value = montarTexto(doc);
      $('#modalTexto').showModal();
      break;
    }

    default:
      contexto.avisar('Formato não reconhecido.', true);
  }
}

/* ---------------- modal de configuração ---------------- */

/** Mostra apenas os controles que fazem sentido para o formato escolhido. */
function ajustarModal() {
  const formato = $('#expFormato').value;
  const ehMobile = /mobile|jpeg/.test(formato);
  const ehTexto = formato === 'texto';
  const ehImpressao = formato.startsWith('imprimir');
  const ehImagem = formato === 'jpeg';

  $('#linhaOrientacao').hidden = ehTexto || ehImagem;
  $('#linhaPapel').hidden = !ehImpressao;
  $('#linhaIndividualizar').hidden = ehTexto;
  $('#linhaVisualizacao').hidden = ehTexto;

  // Documento que sai do escritório por celular vai mascarado por padrão.
  if (!$('#expDocumentos').dataset.tocado) {
    $('#expDocumentos').value = ehMobile ? MODOS_DOCUMENTO.mascarar : MODOS_DOCUMENTO.exibir;
  }

  if (!$('#expOrientacao').dataset.tocado) {
    $('#expOrientacao').value = ehMobile ? 'retrato' : 'paisagem';
  }

  if (!$('#expVisualizacao').dataset.tocado) {
    $('#expVisualizacao').value = ehImagem ? 'whatsapp' : ehMobile ? 'celular' : ehImpressao ? 'impressao' : 'computador';
  }
}

export function abrirModalExportacao(formatoInicial = '') {
  const modal = $('#modalExportar');

  if (formatoInicial) $('#expFormato').value = formatoInicial;
  ajustarModal();

  const { registros } = contexto.obterDados();
  $('#expResumo').textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'} no período e filtros atuais.`;

  modal.showModal();
}

/* ---------------- ligação com a interface ---------------- */

export function ligarExportacao({ obterDados, avisar }) {
  contexto = { obterDados, avisar };

  $('#expFormato').addEventListener('change', ajustarModal);

  // Marca os campos que o usuário mexeu para não sobrescrever a escolha dele.
  for (const id of ['expDocumentos', 'expOrientacao', 'expVisualizacao']) {
    $(`#${id}`).addEventListener('change', (e) => { e.target.dataset.tocado = '1'; });
  }

  $('#btnExportarConfirmar').addEventListener('click', async (e) => {
    e.preventDefault();
    const cfg = lerConfiguracao();
    $('#modalExportar').close();
    try {
      await executar(cfg);
    } catch (erro) {
      contexto.avisar(`Falha na exportação: ${erro.message}`, true);
    }
  });

  $('#btnPreviaCompleta').addEventListener('click', async (e) => {
    e.preventDefault();
    const cfg = lerConfiguracao();
    $('#modalExportar').close();
    const { registros, periodo } = contexto.obterDados();
    await abrirPrevia(montarDocumento(filtrarConteudo(registros, cfg.conteudo), periodo, cfg), 'completo', cfg);
  });

  $('#btnPreviaMobile').addEventListener('click', async (e) => {
    e.preventDefault();
    const cfg = lerConfiguracao();
    $('#modalExportar').close();
    const { registros, periodo } = contexto.obterDados();
    await abrirPrevia(montarDocumento(filtrarConteudo(registros, cfg.conteudo), periodo, cfg), 'mobile', cfg);
  });

  $('#fecharPrevia').addEventListener('click', fecharPrevia);

  // Atalhos diretos da barra de exportação
  const atalhos = {
    btnPdfCompleto: 'pdf-completo',
    btnPdfMobile: 'pdf-mobile',
    btnImprimirCompleto: 'imprimir-completo',
    btnImprimirMobile: 'imprimir-mobile',
    btnJpeg: 'jpeg',
    btnTexto: 'texto',
  };

  for (const [id, formato] of Object.entries(atalhos)) {
    $(`#${id}`)?.addEventListener('click', async () => {
      const base = padraoPara(formato);
      const cfg = { ...base, ...lerConfiguracao(), formato };

      // No atalho o modal nem foi aberto: o padrão do formato tem de prevalecer
      // sobre o valor inicial dos campos, senão o PDF MOBILE sairia com CPF
      // integral quando o padrão dele é mascarar.
      for (const [campo, id2] of [['documentos', 'expDocumentos'], ['orientacao', 'expOrientacao']]) {
        if (!$(`#${id2}`).dataset.tocado) cfg[campo] = base[campo];
      }
      try {
        await executar(cfg);
      } catch (erro) {
        contexto.avisar(`Falha na exportação: ${erro.message}`, true);
      }
    });
  }

  $('#btnPreviaRapida')?.addEventListener('click', () => {
    abrirModalExportacao(ehDispositivoMovel() ? 'previa-mobile' : 'previa-completa');
  });

  $('#btnAbrirExportacao')?.addEventListener('click', () => abrirModalExportacao());
}

export { montarTexto };
