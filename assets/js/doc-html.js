/* PAUTA CF — geração dos documentos em HTML.
 *
 * Produz um HTML autocontido (CSS e logomarca embutidos) usado tanto na
 * pré-visualização quanto na impressão. Autocontido porque o documento também
 * abre em janela nova e precisa funcionar sem depender de caminhos relativos.
 */

import { ICONE_MODALIDADE, MARCA, VAZIO_RESPONSAVEL } from './formato.js';

const CAMINHO_CSS = 'assets/css/documento.css';

/* Tamanhos de papel oferecidos na impressão. */
export const PAPEIS = {
  'a4-retrato': { rotulo: 'A4 retrato', css: 'A4 portrait', margem: '12mm' },
  'a4-paisagem': { rotulo: 'A4 paisagem', css: 'A4 landscape', margem: '10mm' },
  'carta-retrato': { rotulo: 'Carta retrato', css: 'Letter portrait', margem: '12mm' },
  // Folha estreita proporcional a um celular, para quem imprime em bobina ou
  // salva um PDF que será lido exclusivamente no telefone.
  'mobile': { rotulo: 'MOBILE vertical', css: '80mm 160mm', margem: '5mm' },
  'auto': { rotulo: 'Automático', css: 'auto', margem: '10mm' },
};

let cssEmCache = null;
let logoEmCache = null;

async function carregarCSS() {
  if (cssEmCache) return cssEmCache;
  try {
    cssEmCache = await (await fetch(CAMINHO_CSS)).text();
  } catch {
    cssEmCache = '';
  }
  return cssEmCache;
}

/** Converte a logomarca para data URI — o documento precisa viajar sozinho. */
async function carregarLogoDataURI() {
  if (logoEmCache !== null) return logoEmCache;

  try {
    const blob = await (await fetch(MARCA.logo)).blob();
    logoEmCache = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve('');
      fr.readAsDataURL(blob);
    });
  } catch {
    logoEmCache = '';
  }

  return logoEmCache;
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ---------------- fragmentos ---------------- */

function classeModalidade(item) {
  if (item.subtipo !== 'audiencia') return 'prazo';
  return { Virtual: 'virtual', Presencial: 'presencial', Híbrida: 'hibrida' }[item.modalidade] || 'neutra';
}

function etiqueta(item) {
  if (item.subtipo === 'prazo') return '<span class="doc-tag doc-tag--prazo"><i class="doc-tag__icone">⏳</i>Prazo</span>';
  if (item.subtipo === 'tarefa') return '<span class="doc-tag doc-tag--prazo"><i class="doc-tag__icone">✓</i>Tarefa</span>';

  const cls = classeModalidade(item);
  const icone = ICONE_MODALIDADE[item.modalidade] || '•';
  return `<span class="doc-tag doc-tag--${cls}"><i class="doc-tag__icone">${icone}</i>${esc(item.modalidade)}</span>`;
}

function cabecalho(doc, logo) {
  const l = logo ? `<img class="doc-cab__logo" src="${logo}" alt="${esc(MARCA.tituloLinha2)}">` : '';

  return `
<header class="doc-cab">
  ${l}
  <div class="doc-cab__titulo">
    <strong>${esc(doc.tituloLinha1)}</strong>
    <span>${esc(doc.tituloLinha2)}</span>
  </div>
  <div class="doc-cab__meta">
    <div><b>${esc(doc.periodo.rotulo)}</b></div>
    <div>${doc.resumo.total} registro${doc.resumo.total === 1 ? '' : 's'}</div>
    <div>Emitido em ${esc(doc.emitidoEm)}</div>
  </div>
</header>`;
}

function resumoExecutivo(doc) {
  const r = doc.resumo;
  const cards = [
    ['Audiências', r.audiencias, false],
    ['Prazos', r.prazos + r.tarefas, false],
    ['Comarcas', r.comarcas, false],
    ['Sem responsável', r.semResponsavel, r.semResponsavel > 0],
    ['Virtuais', r.virtuais, false],
    ['Presenciais', r.presenciais, false],
  ];

  return `
<section class="doc-resumo">
  ${cards.map(([rotulo, valor, alerta]) => `
  <div class="doc-resumo__item${alerta ? ' doc-resumo__item--alerta' : ''}">
    <span class="doc-resumo__valor">${valor}</span>
    <span class="doc-resumo__rotulo">${esc(rotulo)}</span>
  </div>`).join('')}
</section>`;
}

function cabecalhoGrupo(grupo) {
  const sub = grupo.subtitulo ? `<span class="doc-grupo__sub">${esc(grupo.subtitulo)}</span>` : '';

  return `
<div class="doc-grupo__cab">
  <div>
    <span class="doc-grupo__titulo">${esc(grupo.rotulo)}</span>
    ${sub}
  </div>
  <span class="doc-grupo__contagem">${esc(grupo.resumo)}</span>
</div>`;
}

function botaoAcesso(item) {
  if (!item.link) {
    return '<span class="doc-botao doc-botao--ausente">Link não informado</span>';
  }

  return `<a class="doc-botao" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">
  <span aria-hidden="true">🎥</span> Entrar na audiência
</a>`;
}

/* ---------------- card MOBILE ---------------- */

function card(item) {
  const campos = [
    ['Juízo / Vara', esc(item.foro) + (item.foroComplemento ? `<br><small>${esc(item.foroComplemento)}</small>` : ''), ''],
    ['Cidade', esc(item.cidade), ''],
    ['Responsável', esc(item.responsavel), item.temResponsavel ? '' : ' doc-campo__valor--alerta'],
  ];

  const detalhe = item.subtipo !== 'audiencia' && item.detalhe
    ? `<div class="doc-card__bloco">
         <span class="doc-campo__rotulo">Descrição</span>
         <span class="doc-campo__valor">${esc(item.detalhe)}</span>
       </div>`
    : '';

  return `
<article class="doc-card doc-card--${classeModalidade(item)}${item.temResponsavel ? '' : ' doc-card--sem-resp'}">
  <div class="doc-card__topo">
    <span class="doc-card__hora">${esc(item.horario)}</span>
    ${etiqueta(item)}
  </div>

  <div class="doc-card__parte">
    <span class="doc-card__nome">${esc(item.parteAutora)}</span>
    <span class="doc-card__papel">Parte autora</span>
  </div>

  <div class="doc-card__parte">
    <span class="doc-card__nome doc-card__nome--secundario">${esc(item.parteRe)}</span>
    <span class="doc-card__papel">Parte ré</span>
  </div>

  <div class="doc-card__bloco">
    <span class="doc-campo__rotulo">Processo</span>
    <span class="doc-campo__valor doc-campo__valor--processo">${esc(item.processo)}</span>
  </div>

  ${detalhe}

  <div class="doc-card__grade">
    ${campos.map(([rot, val, cls]) => `
    <div>
      <span class="doc-campo__rotulo">${esc(rot)}</span>
      <span class="doc-campo__valor${cls}">${val}</span>
    </div>`).join('')}
  </div>

  ${botaoAcesso(item)}
</article>`;
}

/* ---------------- tabela do documento completo ---------------- */

const COLUNAS_COMPLETO = [
  ['Horário', 'cel-hora'],
  ['Parte autora', ''],
  ['Parte ré', ''],
  ['Processo', 'cel-processo'],
  ['Juízo / Vara', ''],
  ['Cidade', ''],
  ['Responsável', 'cel-resp'],
  ['Modalidade', ''],
  ['Acesso', 'cel-acesso'],
];

function linhaTabela(item) {
  const acesso = item.link
    ? `<a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Entrar &#8599;</a>`
    : '<span style="color:#94a3b8">—</span>';

  const foro = esc(item.foro) + (item.foroComplemento ? ` (${esc(item.foroComplemento)})` : '');

  return `
<tr>
  <td class="cel-hora">${esc(item.horario)}</td>
  <td>${esc(item.parteAutora)}</td>
  <td>${esc(item.parteRe)}</td>
  <td class="cel-processo">${esc(item.processo)}</td>
  <td>${foro}</td>
  <td>${esc(item.cidade)}</td>
  <td class="cel-resp${item.temResponsavel ? '' : ' cel-alerta'}">${esc(item.responsavel)}</td>
  <td>${etiqueta(item)}</td>
  <td class="cel-acesso">${acesso}</td>
</tr>`;
}

function tabelaGrupo(grupo) {
  return `
<div class="doc-tabela-envolucro">
  <table class="doc-tabela">
    <thead><tr>${COLUNAS_COMPLETO.map(([t, c]) => `<th class="${c}">${esc(t)}</th>`).join('')}</tr></thead>
    <tbody>${grupo.itens.map(linhaTabela).join('')}</tbody>
  </table>
</div>`;
}

/* ---------------- documento ---------------- */

function rodape(doc) {
  return `
<footer class="doc-rodape">
  <span>${esc(MARCA.titulo)}</span>
  <span>Emitido em ${esc(doc.emitidoEm)} · ${doc.resumo.total} registro${doc.resumo.total === 1 ? '' : 's'}</span>
</footer>`;
}

function corpo(doc, modo) {
  if (!doc.grupos.length) {
    return '<div class="doc-corpo"><p style="text-align:center;color:#64748b;padding:32px 0">Nenhum registro no período selecionado.</p></div>';
  }

  const grupos = doc.grupos.map((g) => `
<section class="doc-grupo">
  ${cabecalhoGrupo(g)}
  ${modo === 'mobile' ? g.itens.map(card).join('') : tabelaGrupo(g)}
</section>`).join('');

  return `<div class="doc-corpo">${grupos}</div>`;
}

/**
 * Monta o HTML completo do documento.
 * @param {object} doc documento vindo de montarDocumento()
 * @param {'mobile'|'completo'} modo
 * @param {object} [opcoes] { papel, larguraMobile }
 * @returns {Promise<string>} HTML autocontido
 */
export async function gerarHTML(doc, modo, opcoes = {}) {
  const [css, logo] = await Promise.all([carregarCSS(), carregarLogoDataURI()]);

  const papel = PAPEIS[opcoes.papel] || PAPEIS[modo === 'mobile' ? 'a4-retrato' : 'a4-paisagem'];
  const regraPagina = `@page { size: ${papel.css}; margin: ${papel.margem}; }`;

  // A prévia MOBILE trava a largura para representar fielmente o aparelho.
  const larguraMobile = opcoes.larguraMobile
    ? `.doc--mobile { max-width: ${opcoes.larguraMobile}px; }`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(MARCA.titulo)} — ${esc(doc.periodo.rotulo)}</title>
<style>
${css}
${regraPagina}
${larguraMobile}
</style>
</head>
<body>
<div class="doc doc--${modo}">
  ${cabecalho(doc, logo)}
  ${resumoExecutivo(doc)}
  ${corpo(doc, modo)}
  ${rodape(doc)}
</div>
</body>
</html>`;
}

export { carregarLogoDataURI };
