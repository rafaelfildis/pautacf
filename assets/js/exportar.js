/* PAUTA CF — orquestração das exportações.
 *
 * A escolha do usuário tem dois eixos independentes:
 *
 *   FORMATO     PDF ou JPEG — o arquivo que sai.
 *   PLATAFORMA  A4 ou MOBILE — a diagramação do documento.
 *
 * As quatro combinações são válidas e passam todas por exportarPauta(), o único
 * ponto de exportação do sistema. A plataforma escolhida sempre prevalece sobre
 * o tamanho da tela: pedir A4 num celular devolve o documento de computador, e
 * pedir MOBILE num computador devolve o documento de celular.
 *
 * Nada aqui captura a tela do sistema — os documentos são construídos do zero a
 * partir dos dados filtrados.
 */

import {
  FORMATOS, MARCA, MODOS_DOCUMENTO, CHAVES_AGRUPAMENTO, PLATAFORMAS,
  ROTULO_FORMATO, ROTULO_PLATAFORMA,
  ehFormatoValido, ehPlataformaValida, gerarNomeArquivo, modoDoDocumento,
} from './formato.js';
import { montarDocumento, individualizar, padraoPara } from './documento.js';
import { gerarHTML, LARGURA_A4, PAPEIS } from './doc-html.js';
import { gerarPDF } from './pdf.js';
import { gerarJPEG } from './jpeg.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/** Larguras de aparelho oferecidas na prévia MOBILE. */
const LARGURAS_APARELHO = [360, 390, 430];

/* Seleção corrente dos dois filtros. A barra da tela é a fonte da verdade; o
   modal apenas reflete e altera estes valores, para que Prévia e Exportar nunca
   discordem entre si. Padrão inicial: PDF em A4. */
const selecao = {
  formato: FORMATOS.pdf,
  plataforma: PLATAFORMAS.a4,
};

let contexto = { obterDados: () => ({ registros: [], periodo: null }), avisar: () => {} };

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

/* ---------------- configuração ---------------- */

/**
 * Monta a configuração completa da exportação.
 * Parte dos padrões da plataforma escolhida e só deixa o modal sobrescrever os
 * campos em que o usuário efetivamente mexeu — sem isso o MOBILE sairia com CPF
 * integral, já que o padrão dele é mascarar.
 */
function lerConfiguracao() {
  const v = (id) => $(`#${id}`)?.value ?? '';
  const c = (id) => $(`#${id}`) ? !!$(`#${id}`).checked : true;
  const tocado = (id) => !!$(`#${id}`)?.dataset.tocado;

  const base = padraoPara(selecao.plataforma);

  return {
    ...base,
    formato: selecao.formato,
    plataforma: selecao.plataforma,
    orientacao: tocado('expOrientacao') ? v('expOrientacao') : base.orientacao,
    documentos: tocado('expDocumentos') ? v('expDocumentos') : base.documentos,
    agrupamento: v('expAgrupamento') || CHAVES_AGRUPAMENTO.data,
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

/** Traduz plataforma e orientação para a chave de página do PDF. */
function chavePagina(cfg) {
  if (cfg.plataforma === PLATAFORMAS.mobile) {
    // Quem prefere folha comum troca no modal; o padrão é a página estreita.
    return cfg.papel === 'a4-retrato' ? 'mobile-a4' : 'mobile';
  }
  return cfg.orientacao === 'retrato' ? 'completo-retrato' : 'completo';
}

function papelImpressao(cfg) {
  if (cfg.papel && PAPEIS[cfg.papel]) return cfg.papel;
  if (cfg.plataforma === PLATAFORMAS.mobile) return 'a4-retrato';
  return cfg.orientacao === 'retrato' ? 'a4-retrato' : 'a4-paisagem';
}

/**
 * Nome do arquivo.
 * No documento de audiência única o nome identifica o cliente, não a pauta —
 * é o arquivo que será enviado à parte.
 */
function nomeDoArquivo(doc, cfg, { escopo = '', tipoEscopo = '', parte = 0, extensao }) {
  const audiencia = doc.exportacaoIndividual && !escopo
    ? doc.itens.find((i) => i.subtipo === 'audiencia')
    : null;
  const cliente = audiencia?.cliente || audiencia?.parteAutora || '';
  const individual = !!(audiencia && cliente);

  // Documento de uma audiência só: a data que interessa é a dela, não o
  // intervalo que o filtro da tela por acaso estava mostrando.
  const de = individual ? audiencia.inicio : doc.periodo.de;
  const ate = individual ? audiencia.inicio : doc.periodo.ate;

  return gerarNomeArquivo({
    de,
    ate,
    variante: modoDoDocumento(cfg.plataforma),
    escopo: individual ? cliente : escopo,
    tipoEscopo: individual ? 'cliente' : tipoEscopo,
    parte,
    extensao,
  });
}

/* ---------------- entrega dos arquivos ---------------- */

async function entregarPDF(doc, cfg, escopo = '', tipoEscopo = '') {
  const { blob, paginas } = await gerarPDF(doc, modoDoDocumento(cfg.plataforma), {
    pagina: chavePagina(cfg),
  });

  baixar(blob, nomeDoArquivo(doc, cfg, { escopo, tipoEscopo, extensao: 'pdf' }));
  return paginas;
}

async function entregarJPEG(doc, cfg, escopo = '', tipoEscopo = '') {
  const arquivos = await gerarJPEG(doc, { plataforma: cfg.plataforma });

  for (const { blob, parte, total } of arquivos) {
    baixar(blob, nomeDoArquivo(doc, cfg, {
      escopo, tipoEscopo, parte: total > 1 ? parte : 0, extensao: 'jpg',
    }));
    // Alguns navegadores descartam downloads simultâneos.
    await new Promise((r) => setTimeout(r, 350));
  }

  return arquivos.length;
}

/** Despacha para o gerador do formato escolhido, sem avisar a tela. */
function entregar(doc, cfg, escopo = '', tipoEscopo = '') {
  return cfg.formato === FORMATOS.jpeg
    ? entregarJPEG(doc, cfg, escopo, tipoEscopo)
    : entregarPDF(doc, cfg, escopo, tipoEscopo);
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

  // Mesma regra dos demais formatos: contar "1 audiência" é repetir o documento.
  if (!doc.exportacaoIndividual) {
    const r = doc.resumo;
    L.push(`${r.total} registros · ${r.audiencias} audiências · ${r.prazos + r.tarefas} prazos/tarefas`);
    if (r.semResponsavel) L.push(`${r.semResponsavel} sem responsável definido`);
    L.push('');
  }

  for (const grupo of doc.grupos) {
    L.push(`${grupo.rotulo}${grupo.subtitulo ? ` — ${grupo.subtitulo}` : ''}`);
    L.push(`(${grupo.resumo})`);
    L.push('-'.repeat(52));

    for (const item of grupo.itens) {
      L.push(`${item.data} · ${item.horario} · ${item.modalidade}`);
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

  // Mesma regra dos demais formatos: só na audiência única.
  if (doc.observacoes.length) {
    L.push(doc.tituloObservacoes);
    L.push('-'.repeat(52));
    doc.observacoes.forEach((texto, i) => L.push(`${i + 1}. ${texto}`));
    L.push('');
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

/**
 * Abre a prévia na plataforma selecionada.
 * O modo vem sempre de cfg.plataforma — nunca do tamanho da tela.
 */
async function abrirPrevia(doc, cfg) {
  const modal = $('#modalPrevia');
  const palco = $('#previaPalco');
  const controles = $('#previaControles');
  const modo = modoDoDocumento(cfg.plataforma);
  const ehMobile = modo === 'mobile';

  $('#previaTitulo').textContent = ehMobile ? 'Prévia MOBILE' : 'Prévia A4';

  const larguraInicial = 390;
  const html = await gerarHTML(doc, modo, {
    papel: papelImpressao(cfg),
    larguraMobile: ehMobile ? larguraInicial : 0,
  });

  palco.replaceChildren();
  controles.replaceChildren();

  const quadro = document.createElement('div');
  quadro.className = ehMobile ? 'previa-moldura' : 'previa-folha';

  const iframe = document.createElement('iframe');
  iframe.className = 'previa-iframe';
  iframe.title = 'Pré-visualização do documento';
  iframe.srcdoc = html;

  if (ehMobile) {
    const entalhe = document.createElement('span');
    entalhe.className = 'previa-moldura__notch';
    quadro.appendChild(entalhe);
    quadro.style.width = `${larguraInicial}px`;
  }

  quadro.appendChild(iframe);
  palco.appendChild(quadro);

  /* --- controles --- */

  if (ehMobile) {
    const grupo = document.createElement('div');
    grupo.className = 'previa-larguras';

    const trocar = async (largura, botao) => {
      quadro.style.width = `${largura}px`;
      [...grupo.querySelectorAll('button')].forEach((b) => b.classList.remove('ativo'));
      botao.classList.add('ativo');
      iframe.srcdoc = await gerarHTML(doc, 'mobile', {
        papel: papelImpressao(cfg),
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

  const rotuloPlataforma = ROTULO_PLATAFORMA[cfg.plataforma];

  acoes.append(
    botao(`Imprimir ${rotuloPlataforma}`, 'btn--escuro', () => {
      gerarHTML(doc, modo, { papel: papelImpressao(cfg) }).then(imprimirHTML);
    }),
    botao(`Exportar PDF ${rotuloPlataforma}`, 'btn--ouro', () => (
      comAviso(() => entregarComAviso(doc, { ...cfg, formato: FORMATOS.pdf }))
    )),
    botao(`Exportar JPEG ${rotuloPlataforma}`, 'btn--escuro', () => (
      comAviso(() => entregarComAviso(doc, { ...cfg, formato: FORMATOS.jpeg }))
    ))
  );

  controles.appendChild(acoes);

  if (!modal.open) modal.showModal();

  /* Numa tela estreita a folha A4 inteira não cabe na moldura. Em vez de
     recortar o documento ou deixá-lo rolar de lado, ela é reduzida
     proporcionalmente: o que se vê continua sendo a diagramação de computador,
     apenas menor — exatamente como o arquivo que será gerado.
     A medida só vale depois do showModal(): antes disso o diálogo está fechado
     e a moldura ainda não tem largura. */
  if (!ehMobile) {
    const fator = Math.min(1, quadro.clientWidth / LARGURA_A4);

    if (fator > 0 && fator < 1) {
      iframe.style.width = `${LARGURA_A4}px`;
      iframe.style.height = `${quadro.clientHeight / fator}px`;
      iframe.style.transformOrigin = 'top left';
      iframe.style.transform = `scale(${fator})`;
    }
  }
}

/* ---------------- execução ---------------- */

/** Entrega o arquivo e anuncia o resultado na tela. */
async function entregarComAviso(doc, cfg) {
  const quantidade = await entregar(doc, cfg);
  const rotulo = `${ROTULO_FORMATO[cfg.formato]} ${ROTULO_PLATAFORMA[cfg.plataforma]}`;

  if (cfg.formato === FORMATOS.jpeg) {
    contexto.avisar(quantidade > 1
      ? `${rotulo} gerado em ${quantidade} partes.`
      : `${rotulo} gerado.`);
    return;
  }

  contexto.avisar(`${rotulo} gerado com ${quantidade} página${quantidade > 1 ? 's' : ''}.`);
}

/**
 * Ponto único de exportação — todo caminho da interface passa por aqui.
 *
 * @param {object} opcoes
 * @param {'arquivo'|'previa'|'imprimir'|'texto'} [opcoes.destino] o que fazer
 *        com o documento pronto
 * @param {object} [opcoes.cfg] configuração; por padrão a seleção atual da tela
 * @param {object} [opcoes.documento] documento já montado, reaproveitado quando
 *        a ação vem de dentro da prévia
 */
async function exportarPauta({ destino = 'arquivo', cfg = null, documento = null } = {}) {
  const config = cfg || lerConfiguracao();
  const { registros, periodo } = contexto.obterDados();

  // A exportação respeita exatamente os filtros da tela — período, busca, tipo,
  // responsável e modalidade já vêm aplicados em `registros`.
  const selecionados = filtrarConteudo(registros, config.conteudo);

  if (!selecionados.length && destino !== 'texto') {
    contexto.avisar('Nenhum registro para exportar com os filtros atuais.', true);
    return;
  }

  /* --- documentos individualizados (só na geração de arquivo) --- */
  if (destino === 'arquivo' && config.individualizarPor) {
    const lotes = individualizar(selecionados, periodo, config);

    for (const { escopo, documento: doc } of lotes) {
      await entregar(doc, config, escopo, config.individualizarPor);
      await new Promise((r) => setTimeout(r, 350));
    }

    const plural = lotes.length > 1 ? 's' : '';
    contexto.avisar(`${lotes.length} documento${plural} gerado${plural}.`);
    return;
  }

  const doc = documento || montarDocumento(selecionados, periodo, config);

  switch (destino) {
    case 'previa':
      await abrirPrevia(doc, config);
      break;

    case 'imprimir': {
      const html = await gerarHTML(doc, modoDoDocumento(config.plataforma), {
        papel: papelImpressao(config),
      });
      if (imprimirHTML(html)) {
        contexto.avisar(`Janela de impressão ${ROTULO_PLATAFORMA[config.plataforma]} aberta.`);
      }
      break;
    }

    case 'texto':
      $('#saidaTexto').value = montarTexto(doc);
      $('#modalTexto').showModal();
      break;

    default:
      await entregarComAviso(doc, config);
  }
}

/** Envolve uma ação assíncrona para que falhas apareçam como aviso na tela. */
async function comAviso(acao) {
  try {
    await acao();
  } catch (erro) {
    contexto.avisar(`Falha na exportação: ${erro.message}`, true);
  }
}

/* ---------------- seleção de formato e plataforma ---------------- */

function pintarSegmento(idGrupo, atributo, valor) {
  for (const botao of $$(`#${idGrupo} [data-${atributo}]`)) {
    const ativo = botao.dataset[atributo] === valor;
    botao.classList.toggle('segmento__opcao--ativa', ativo);
    botao.setAttribute('aria-checked', String(ativo));
  }
}

/** Mostra apenas os controles do modal que fazem sentido para a seleção. */
function ajustarModal() {
  const ehMobile = selecao.plataforma === PLATAFORMAS.mobile;

  // A orientação existe só no A4: no MOBILE a página estreita é a definição.
  const linhaOrientacao = $('#linhaOrientacao');
  if (linhaOrientacao) linhaOrientacao.hidden = ehMobile;

  // Documento que circula por celular vai mascarado por padrão.
  const documentos = $('#expDocumentos');
  if (documentos && !documentos.dataset.tocado) {
    documentos.value = ehMobile ? MODOS_DOCUMENTO.mascarar : MODOS_DOCUMENTO.exibir;
  }

  const orientacao = $('#expOrientacao');
  if (orientacao && !orientacao.dataset.tocado) {
    orientacao.value = ehMobile ? 'retrato' : 'paisagem';
  }
}

/** Reflete a seleção corrente na barra da tela e no modal. */
function sincronizarSelecao() {
  pintarSegmento('grupoFormato', 'formato', selecao.formato);
  pintarSegmento('grupoPlataforma', 'plataforma', selecao.plataforma);

  const formato = $('#expFormato');
  if (formato) formato.value = selecao.formato;

  const plataforma = $('#expPlataforma');
  if (plataforma) plataforma.value = selecao.plataforma;

  const botao = $('#btnExportar');
  if (botao) {
    botao.textContent = `Exportar ${ROTULO_FORMATO[selecao.formato]} · ${ROTULO_PLATAFORMA[selecao.plataforma]}`;
  }

  ajustarModal();
}

function definirFormato(valor) {
  if (!ehFormatoValido(valor) || valor === selecao.formato) return;
  selecao.formato = valor;
  sincronizarSelecao();
}

function definirPlataforma(valor) {
  if (!ehPlataformaValida(valor) || valor === selecao.plataforma) return;
  selecao.plataforma = valor;
  sincronizarSelecao();
}

/** Liga um grupo de botões segmentados, com teclado e clique. */
function ligarSegmento(idGrupo, atributo, escolher) {
  const grupo = $(`#${idGrupo}`);
  if (!grupo) return;

  grupo.addEventListener('click', (evento) => {
    const botao = evento.target.closest(`[data-${atributo}]`);
    if (botao) escolher(botao.dataset[atributo]);
  });

  grupo.addEventListener('keydown', (evento) => {
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;

    const botoes = [...grupo.querySelectorAll(`[data-${atributo}]`)];
    const atual = botoes.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const proximo = botoes[(atual + (evento.key === 'ArrowRight' ? 1 : -1) + botoes.length) % botoes.length];

    evento.preventDefault();
    escolher(proximo.dataset[atributo]);
    proximo.focus();
  });
}

/* ---------------- modal de configuração ---------------- */

export function abrirModalExportacao() {
  const modal = $('#modalExportar');
  sincronizarSelecao();

  const { registros } = contexto.obterDados();
  const audiencias = registros.filter((r) => r.subtipo === 'audiencia').length;

  /* O aviso da audiência única é a mesma regra do documento: contagem final de
     audiências incluídas, não o texto digitado na busca. */
  const resumo = [
    `${registros.length} registro${registros.length === 1 ? '' : 's'} no período e filtros atuais.`,
    audiencias === 1
      ? 'Uma única audiência: o documento sairá com o bloco OBSERVAÇÕES IMPORTANTES.'
      : '',
  ].filter(Boolean).join(' ');

  $('#expResumo').textContent = resumo;
  modal.showModal();
}

/* ---------------- ligação com a interface ---------------- */

export function ligarExportacao({ obterDados, avisar }) {
  contexto = { obterDados, avisar };

  /* --- filtros de formato e plataforma --- */

  ligarSegmento('grupoFormato', 'formato', definirFormato);
  ligarSegmento('grupoPlataforma', 'plataforma', definirPlataforma);

  $('#expFormato')?.addEventListener('change', (e) => definirFormato(e.target.value));
  $('#expPlataforma')?.addEventListener('change', (e) => definirPlataforma(e.target.value));

  // Marca os campos que o usuário mexeu para não sobrescrever a escolha dele.
  for (const id of ['expDocumentos', 'expOrientacao']) {
    $(`#${id}`)?.addEventListener('change', (e) => { e.target.dataset.tocado = '1'; });
  }

  /* --- ações da barra da tela --- */

  $('#btnExportar')?.addEventListener('click', () => comAviso(() => exportarPauta()));
  $('#btnPrevia')?.addEventListener('click', () => comAviso(() => exportarPauta({ destino: 'previa' })));
  $('#btnImprimir')?.addEventListener('click', () => comAviso(() => exportarPauta({ destino: 'imprimir' })));
  $('#btnTexto')?.addEventListener('click', () => comAviso(() => exportarPauta({ destino: 'texto' })));
  $('#btnAbrirExportacao')?.addEventListener('click', () => abrirModalExportacao());

  /* --- ações do modal --- */

  const doModal = (destino) => async (evento) => {
    evento.preventDefault();
    const cfg = lerConfiguracao();
    $('#modalExportar').close();
    await comAviso(() => exportarPauta({ destino, cfg }));
  };

  $('#btnExportarConfirmar')?.addEventListener('click', doModal('arquivo'));
  $('#btnPreviaModal')?.addEventListener('click', doModal('previa'));
  $('#btnImprimirModal')?.addEventListener('click', doModal('imprimir'));
  $('#btnTextoModal')?.addEventListener('click', doModal('texto'));

  $('#fecharPrevia')?.addEventListener('click', fecharPrevia);

  sincronizarSelecao();
}

export { montarTexto };
