/* PAUTA CF — Persistência local.
 *
 * O feed do Astrea é somente leitura: advogado responsável, modalidade e ajustes
 * de cidade são informações do escritório e vivem no navegador, indexadas pelo
 * UID do compromisso.
 */

const CHAVE_ANOTACOES = 'pautacf.anotacoes.v1';
const CHAVE_ADVOGADOS = 'pautacf.advogados.v1';
const CHAVE_CONFIG = 'pautacf.config.v1';
const CHAVE_CACHE = 'pautacf.cache.v1';

const ADVOGADOS_PADRAO = [
  'Joselton Calmon',
  'Rafael Freitas',
  'Larissa Frontado',
  'Nathalia Cheron',
];

const CONFIG_PADRAO = {
  urlAgenda:
    'https://app.astrea.net.br/calendarsyncservlet?user=6487363246817280&type=googlewebcalendar&noCache',
  nomeEscritorio: 'Calmon & Freitas Advogados',
};

function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

/* ---------- Anotações por compromisso ---------- */

let anotacoes = ler(CHAVE_ANOTACOES, {});

/** Campos do escritório para um compromisso: responsavel, modalidade, cidade, obs. */
export function getAnotacao(uid) {
  return anotacoes[uid] || {};
}

export function setAnotacao(uid, campos) {
  anotacoes[uid] = { ...(anotacoes[uid] || {}), ...campos };

  // Não guardamos campos vazios para o armazenamento não inchar com ruído.
  for (const [k, v] of Object.entries(anotacoes[uid])) {
    if (v === '' || v == null) delete anotacoes[uid][k];
  }
  if (Object.keys(anotacoes[uid]).length === 0) delete anotacoes[uid];

  gravar(CHAVE_ANOTACOES, anotacoes);
}

export function limparAnotacoes() {
  anotacoes = {};
  gravar(CHAVE_ANOTACOES, anotacoes);
}

export function exportarAnotacoes() {
  return JSON.stringify({ versao: 1, anotacoes, advogados: getAdvogados() }, null, 2);
}

/** Importa um backup. Retorna a quantidade de compromissos restaurados. */
export function importarAnotacoes(json) {
  const dados = JSON.parse(json);
  if (!dados || typeof dados.anotacoes !== 'object') {
    throw new Error('Arquivo de backup inválido.');
  }

  anotacoes = { ...anotacoes, ...dados.anotacoes };
  gravar(CHAVE_ANOTACOES, anotacoes);

  if (Array.isArray(dados.advogados) && dados.advogados.length) {
    setAdvogados(dados.advogados);
  }

  return Object.keys(dados.anotacoes).length;
}

/* ---------- Equipe ---------- */

export function getAdvogados() {
  const lista = ler(CHAVE_ADVOGADOS, null);
  return Array.isArray(lista) && lista.length ? lista : [...ADVOGADOS_PADRAO];
}

export function setAdvogados(lista) {
  const limpa = [...new Set(lista.map((n) => n.trim()).filter(Boolean))];
  gravar(CHAVE_ADVOGADOS, limpa);
  return limpa;
}

/* ---------- Configuração ---------- */

export function getConfig() {
  return { ...CONFIG_PADRAO, ...ler(CHAVE_CONFIG, {}) };
}

export function setConfig(campos) {
  gravar(CHAVE_CONFIG, { ...getConfig(), ...campos });
}

/* ---------- Cache do feed ---------- */

/** Guarda o .ics bruto para a pauta abrir mesmo sem internet. */
export function salvarCache(icsText) {
  gravar(CHAVE_CACHE, { ics: icsText, em: Date.now() });
}

export function lerCache() {
  return ler(CHAVE_CACHE, null);
}
