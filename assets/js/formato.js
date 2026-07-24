/* PAUTA CF — constantes institucionais e funções de formatação reutilizáveis.
 *
 * Tudo que formata, mascara, agrupa ou nomeia arquivo vive aqui, para que a
 * tela, os documentos HTML, o PDF e o JPEG produzam exatamente o mesmo texto.
 */

/* ---------------- identidade ---------------- */

export const MARCA = {
  tituloLinha1: 'PAUTA DE AUDIÊNCIAS',
  tituloLinha2: 'CALMON E FREITAS ADVOGADOS',
  titulo: 'PAUTA DE AUDIÊNCIAS CALMON E FREITAS ADVOGADOS',
  logo: 'assets/img/logo.png',
};

export const CORES = {
  marinho: '#07162e',
  marinhoSecundario: '#102747',
  ouro: '#d1a94b',
  fundo: '#f4f6f9',
  texto: '#1a2638',
  textoFraco: '#64748b',
  borda: '#dfe4ec',
  virtual: '#2f6fb0',
  presencial: '#2f8a5b',
  hibrida: '#9b6bb5',
  alerta: '#b5762a',
};

export const MODALIDADES = ['Presencial', 'Virtual', 'Híbrida'];

/* Ícone textual acompanha a cor para que a etiqueta não dependa só do tom —
   exigência de acessibilidade e de impressão em preto e branco. */
export const ICONE_MODALIDADE = {
  Virtual: '🎥',
  Presencial: '🏛',
  Híbrida: '🔀',
};

export const VAZIO_TEXTO = 'Não informado';
export const VAZIO_RESPONSAVEL = 'Não definido';

/* ---------------- datas e horários ---------------- */

const fmtDataCurtaBR = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});
const fmtDiaSemanaBR = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const fmtDataLongaBR = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: 'long', year: 'numeric',
});
const fmtMesAnoBR = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fmtDiaMesBR = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' });
const fmtHoraBR = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtCarimboBR = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export const formatarData = (d) => fmtDataCurtaBR.format(d);
export const formatarDataLonga = (d) => fmtDataLongaBR.format(d);
export const formatarMesAno = (d) => fmtMesAnoBR.format(d);
export const formatarDiaMes = (d) => fmtDiaMesBR.format(d);
export const formatarHora = (d) => fmtHoraBR.format(d);
export const formatarCarimbo = (d) => fmtCarimboBR.format(d);

/** "segunda-feira" sem o sufixo, em caixa alta para cabeçalho de dia. */
export function formatarDiaSemana(d, { curto = false } = {}) {
  const nome = fmtDiaSemanaBR.format(d);
  return curto ? nome.replace('-feira', '') : nome;
}

/** "08:40 às 09:10" — formato pedido nos cards MOBILE. */
export function formatarIntervalo(inicio, fim, { conector = 'às' } = {}) {
  if (!inicio) return '';
  return fim ? `${formatarHora(inicio)} ${conector} ${formatarHora(fim)}` : formatarHora(inicio);
}

/** Data compacta usada nos nomes de arquivo: 24.07.2026 */
export const formatarDataArquivo = (d) => formatarData(d).replace(/\//g, '.');

/* ---------------- CPF e CNPJ ---------------- */

const RE_CPF = /(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/g;
const RE_CNPJ = /(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})/g;
/* Remove o rótulo inteiro, inclusive quando o número já vem mascarado pelo Astrea. */
const RE_ROTULO_DOC = /\s*[-–]?\s*\bCN?PJ?F?:\s*[\d.\-/*]+/gi;

export const MODOS_DOCUMENTO = {
  exibir: 'exibir',
  mascarar: 'mascarar',
  ocultar: 'ocultar',
};

/**
 * Aplica a política de exibição de CPF/CNPJ sobre um texto livre — os documentos
 * chegam embutidos no nome das partes ("FULANO - CPF: 123.456.789-00").
 * @param {string} texto
 * @param {'exibir'|'mascarar'|'ocultar'} modo
 */
export function aplicarPrivacidade(texto, modo) {
  if (!texto || modo === MODOS_DOCUMENTO.exibir) return texto || '';

  if (modo === MODOS_DOCUMENTO.ocultar) {
    return texto.replace(RE_ROTULO_DOC, '').replace(/\s{2,}/g, ' ').trim();
  }

  return texto
    .replace(RE_CNPJ, '$1.***.***/$4-$5')
    .replace(RE_CPF, '$1.***.***-$4')
    .trim();
}

/* ---------------- textos ---------------- */

export const ouVazio = (valor, padrao = VAZIO_TEXTO) => {
  const t = (valor ?? '').toString().trim();
  return t || padrao;
};

/** Título curto do foro para a segunda linha do card ("Matutino", "Cível"). */
export function separarForo(foro) {
  const texto = (foro || '').trim();
  if (!texto) return { principal: VAZIO_TEXTO, complemento: '' };

  const m = texto.match(/^(.*?)\s*[（(]([^)）]+)[)）]\s*$/);
  if (m) return { principal: m[1].trim(), complemento: m[2].trim() };

  return { principal: texto, complemento: '' };
}

/** Domínio do link, para exibir sem despejar a URL inteira. */
export function dominioDoLink(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/* ---------------- agrupamento ---------------- */

export const CHAVES_AGRUPAMENTO = {
  data: 'data',
  responsavel: 'responsavel',
  cidade: 'cidade',
  cliente: 'cliente',
};

function rotuloDoGrupo(item, criterio) {
  switch (criterio) {
    case CHAVES_AGRUPAMENTO.responsavel:
      return ouVazio(item.responsavel, VAZIO_RESPONSAVEL);
    case CHAVES_AGRUPAMENTO.cidade:
      return ouVazio(item.cidade);
    case CHAVES_AGRUPAMENTO.cliente:
      return ouVazio(item.cliente || item.parteAutora);
    default:
      return formatarData(item.inicio);
  }
}

/**
 * Agrupa preservando a ordem cronológica dentro de cada grupo.
 * @returns {Array<{chave, rotulo, subtitulo, itens}>}
 */
export function agrupar(itens, criterio) {
  const mapa = new Map();

  for (const item of itens) {
    const rotulo = rotuloDoGrupo(item, criterio);
    if (!mapa.has(rotulo)) mapa.set(rotulo, []);
    mapa.get(rotulo).push(item);
  }

  const grupos = [...mapa.entries()].map(([rotulo, lista]) => {
    lista.sort((a, b) => a.inicio - b.inicio);
    const primeiro = lista[0];

    const porData = criterio === CHAVES_AGRUPAMENTO.data;
    return {
      chave: rotulo,
      // No agrupamento por data o dia da semana vira o título, e a data completa
      // o subtítulo — hierarquia pedida no cabeçalho de cada dia.
      rotulo: porData ? formatarDiaSemana(primeiro.inicio).toUpperCase() : rotulo,
      subtitulo: porData ? formatarDataLonga(primeiro.inicio).toUpperCase() : '',
      referencia: primeiro.inicio,
      itens: lista,
    };
  });

  if (criterio === CHAVES_AGRUPAMENTO.data) {
    grupos.sort((a, b) => a.referencia - b.referencia);
  } else {
    grupos.sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
  }

  return grupos;
}

/** "3 audiências" / "1 audiência e 2 prazos" para o cabeçalho do grupo. */
export function resumirGrupo(itens) {
  const conta = (sub) => itens.filter((i) => i.subtipo === sub).length;
  const partes = [];

  const audiencias = conta('audiencia');
  const tarefas = conta('tarefa');
  const prazos = conta('prazo');

  if (audiencias) partes.push(`${audiencias} AUDIÊNCIA${audiencias > 1 ? 'S' : ''}`);
  if (tarefas) partes.push(`${tarefas} TAREFA${tarefas > 1 ? 'S' : ''}`);
  if (prazos) partes.push(`${prazos} PRAZO${prazos > 1 ? 'S' : ''}`);

  return partes.join(' · ');
}

/* ---------------- nomes de arquivo ---------------- */

/** Windows e Android rejeitam estes caracteres em nome de arquivo. */
const sanitizar = (t) => t.replace(/[\\/:*?"<>|]/g, '').replace(/\s{2,}/g, ' ').trim();

/**
 * Monta o nome do arquivo no padrão institucional.
 * @param {object} opcoes
 * @param {Date} opcoes.de
 * @param {Date} opcoes.ate
 * @param {'completo'|'mobile'|'jpeg'} [opcoes.variante]
 * @param {string} [opcoes.escopo]  nome do responsável, cliente, cidade…
 * @param {'responsavel'|'cliente'|'data'|'cidade'} [opcoes.tipoEscopo]
 * @param {number} [opcoes.parte]
 * @param {string} opcoes.extensao
 */
export function gerarNomeArquivo({
  de, ate, variante = 'completo', escopo = '', tipoEscopo = '', parte = 0, extensao,
}) {
  const mesmoDia = formatarData(de) === formatarData(ate);
  const periodo = mesmoDia
    ? formatarDataArquivo(de)
    : `${formatarDataArquivo(de)} A ${formatarDataArquivo(ate)}`;

  let base;

  if (tipoEscopo === 'cliente' && escopo) {
    // Documento de uma audiência específica: identifica o cliente, não a pauta.
    base = `AUDIÊNCIA - ${escopo.toUpperCase()} - ${periodo}`;
  } else if (escopo) {
    base = `PAUTA DE AUDIÊNCIAS - ${escopo.toUpperCase()} - ${periodo}`;
  } else if (variante === 'mobile') {
    base = `${MARCA.titulo} - MOBILE - ${periodo}`;
  } else {
    base = `${MARCA.titulo} - ${periodo}`;
  }

  if (parte) base += ` - PARTE ${String(parte).padStart(2, '0')}`;

  return `${sanitizar(base)}.${extensao}`;
}

/* ---------------- ambiente ---------------- */

/** Detecta se a sessão está num aparelho de toque estreito. */
export function ehDispositivoMovel() {
  return window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
}
