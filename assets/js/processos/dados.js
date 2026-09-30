/* PAUTA CF — Base, filtros e indicadores do Painel de Processos.
 *
 * Duas bases possíveis:
 *   - a publicada (assets/data/processos-base.json), anonimizada, que abre em
 *     qualquer navegador;
 *   - a local, importada da exportação do Astrea neste navegador, que mantém
 *     nome do cliente e número do processo e nunca sai do computador.
 *
 * Todo número exibido no painel — mapa, ranking, gráficos e tabela — sai das
 * funções deste módulo sobre o mesmo recorte filtrado, para que nunca
 * discordem entre si.
 */

import { EXITO, DECIDIDO, TESES_MASSA, NOMES_UF } from './classificar.js';

const CHAVE_LOCAL = 'pautacf.processos.base.v1';

// ---------------------------------------------------------------- carga

export async function carregarBasePublicada() {
  const resp = await fetch('assets/data/processos-base.json', { cache: 'no-cache' });
  if (!resp.ok) throw new Error(`Base publicada indisponível (HTTP ${resp.status}).`);
  const base = await resp.json();
  return { ...base, origemBase: 'publicada' };
}

export function lerBaseLocal() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCAL);
    return bruto ? { ...JSON.parse(bruto), origemBase: 'local' } : null;
  } catch {
    return null;
  }
}

export function gravarBaseLocal(base) {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(base));
    return true;
  } catch {
    return false; // cota do navegador — a base segue valendo nesta aba
  }
}

export function apagarBaseLocal() {
  try { localStorage.removeItem(CHAVE_LOCAL); } catch { /* nada a fazer */ }
}

let municipiosCache = null;
export async function carregarMunicipios() {
  if (!municipiosCache) {
    const resp = await fetch('assets/data/municipios.json');
    if (!resp.ok) throw new Error('Tabela de municípios indisponível.');
    municipiosCache = await resp.json();
  }
  return municipiosCache;
}

export async function carregarOrigens() {
  try {
    const resp = await fetch('assets/data/origens-cnj.json');
    return resp.ok ? (await resp.json()).origens || {} : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- filtros

export const FILTROS_PADRAO = {
  escopo: 'massa',
  uf: '',
  municipio: '',
  adversa: '',
  tese: '',
  resultado: '',
  periodo: '',
  responsavel: '',
  busca: '',
};

/** Rótulo de local usado como chave de agrupamento por comarca. */
export function chaveComarca(r) {
  if (r.municipio) return `${r.municipio}/${r.uf}`;
  if (r.unidade === 'Núcleo de Justiça 4.0') return `Núcleo de Justiça 4.0/${r.uf}`;
  return `Comarca não identificada/${r.uf ?? '—'}`;
}

function dentroDoPeriodo(r, periodo, referencia) {
  if (!periodo) return true;
  if (!r.distribuicao) return false;
  if (/^\d{4}$/.test(periodo)) return r.distribuicao.startsWith(periodo);
  // A base publicada guarda só o mês (AAAA-MM); a comparação é sempre por mês.
  const meses = Number(periodo.replace('m', ''));
  const ref = new Date(`${referencia || new Date().toISOString().slice(0, 10)}T12:00:00`);
  const limite = new Date(ref.getFullYear(), ref.getMonth() - meses + 1, 1);
  const mesLimite = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}`;
  return r.distribuicao.slice(0, 7) >= mesLimite;
}

function normalizarBusca(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filtrar(registros, f, referencia, { ignorar = [] } = {}) {
  const busca = normalizarBusca(f.busca).trim();
  const usa = (campo) => !ignorar.includes(campo) && f[campo];
  return registros.filter((r) => {
    if (f.escopo === 'massa' && (!TESES_MASSA.has(r.tese) || r.proBono)) return false;
    if (usa('uf') && r.uf !== f.uf) return false;
    if (usa('municipio') && chaveComarca(r) !== f.municipio) return false;
    if (usa('adversa') && r.adversa !== f.adversa) return false;
    if (usa('tese') && r.tese !== f.tese) return false;
    if (usa('resultado')) {
      if (f.resultado === 'decididos' ? !DECIDIDO.has(r.resultado) : r.resultado !== f.resultado) return false;
    }
    if (usa('responsavel') && r.responsavel !== f.responsavel) return false;
    if (!ignorar.includes('periodo') && !dentroDoPeriodo(r, f.periodo, referencia)) return false;
    if (busca) {
      const alvo = normalizarBusca([r.cliente, r.numero, r.municipio, r.uf, r.adversa, r.unidade, r.tribunal].join(' '));
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- agregação

function novoGrupo(chave) {
  return {
    chave, total: 0, decididos: 0, exitos: 0,
    procedente: 0, parcial: 0, acordo: 0, improcedente: 0, sem_merito: 0, pendente: 0,
    liminares: 0, sobrestados: 0, emRecurso: 0,
  };
}

function somar(g, r) {
  g.total += 1;
  g[r.resultado] += 1;
  if (DECIDIDO.has(r.resultado)) g.decididos += 1;
  if (EXITO.has(r.resultado)) g.exitos += 1;
  if (r.liminar === 'deferida') g.liminares += 1;
  if (r.situacao === 'sobrestado') g.sobrestados += 1;
  if (r.situacao === 'em_recurso') g.emRecurso += 1;
}

export function agrupar(registros, chaveDe) {
  const grupos = new Map();
  for (const r of registros) {
    const chave = chaveDe(r);
    if (chave == null) continue;
    if (!grupos.has(chave)) grupos.set(chave, novoGrupo(chave));
    somar(grupos.get(chave), r);
  }
  return grupos;
}

export function resumo(registros) {
  const g = novoGrupo('total');
  registros.forEach((r) => somar(g, r));
  g.ufs = new Set(registros.map((r) => r.uf).filter(Boolean)).size;
  g.comarcas = new Set(registros.filter((r) => r.municipio).map((r) => `${r.municipio}/${r.uf}`)).size;
  g.taxa = g.decididos ? g.exitos / g.decididos : null;
  return g;
}

// ---------------------------------------------------------------- prioridade

/*
 * Índice de prioridade para tráfego pago (0 a 100)
 *
 * Com poucas decisões por comarca, a taxa bruta engana: 1 procedente em 1
 * decisão vira "100%". Por isso a taxa de êxito é ajustada por encolhimento
 * bayesiano em direção à média do escopo (prior Beta com força K): quanto
 * menos decisões, mais perto da média o local fica.
 *
 *   êxito ajustado = (êxitos + K·média) / (decisões + K)
 *   índice = 100 · (0,55·êxito ajustado + 0,30·volume relativo + 0,15·liminares)
 *
 * volume relativo = √processos / √(maior volume do ranking) — demanda comprovada
 * liminares       = liminares deferidas / processos (sinal precoce de êxito)
 */
export const K_PRIOR = 4;
export const PESOS = { exito: 0.55, volume: 0.30, liminar: 0.15 };

export const RECOMENDACOES = {
  escalar: { rotulo: 'Escalar', icone: '▲', descricao: 'Êxito comprovado acima da média, com decisões suficientes. Priorizar verba.' },
  testar: { rotulo: 'Testar', icone: '◆', descricao: 'Há demanda (volume ou liminares), mas poucas decisões de mérito. Verba de teste e acompanhamento.' },
  observar: { rotulo: 'Observar', icone: '●', descricao: 'Volume baixo e sem decisões. Aguardar sinais antes de investir.' },
  cautela: { rotulo: 'Cautela', icone: '▼', descricao: 'Maioria das decisões de mérito desfavorável. Rever tese ou suspender anúncios.' },
};

function recomendar(g, media) {
  const taxa = g.decididos ? g.exitos / g.decididos : null;
  if (g.decididos >= 2 && taxa < 0.4) return 'cautela';
  if (g.decididos >= 3 && taxa >= 0.6 && g.exitoAjustado >= media) return 'escalar';
  if (g.total >= 3 || g.liminares >= 1 || (g.decididos >= 1 && taxa >= 0.5)) return 'testar';
  return 'observar';
}

export function confiabilidade(decididos) {
  if (decididos >= 5) return 'alta';
  if (decididos >= 2) return 'média';
  return 'baixa';
}

/** Ranking de locais (UF ou comarca) com índice e recomendação. */
export function ranking(registros, nivel) {
  const chaveDe = nivel === 'uf' ? (r) => r.uf : chaveComarca;
  const grupos = [...agrupar(registros, chaveDe).values()];
  const geral = resumo(registros);
  const media = geral.taxa ?? 0.5;
  const maiorVolume = Math.max(1, ...grupos.map((g) => g.total));

  for (const g of grupos) {
    g.taxa = g.decididos ? g.exitos / g.decididos : null;
    g.exitoAjustado = (g.exitos + K_PRIOR * media) / (g.decididos + K_PRIOR);
    g.volumeRel = Math.sqrt(g.total) / Math.sqrt(maiorVolume);
    g.liminarRel = g.total ? g.liminares / g.total : 0;
    g.indice = Math.round(100 * (PESOS.exito * g.exitoAjustado + PESOS.volume * g.volumeRel + PESOS.liminar * g.liminarRel));
    g.recomendacao = recomendar(g, media);
    g.confianca = confiabilidade(g.decididos);
    g.participacao = registros.length ? g.total / registros.length : 0;
    if (nivel === 'uf') {
      g.uf = g.chave;
      g.nome = NOMES_UF[g.chave] || g.chave || 'UF não identificada';
    } else {
      const [nome, uf] = g.chave.split('/');
      g.nome = nome;
      g.uf = uf;
      const ref = registros.find((r) => chaveComarca(r) === g.chave);
      g.lat = ref?.lat ?? null;
      g.lon = ref?.lon ?? null;
      g.identificada = Boolean(ref?.municipio);
    }
  }
  grupos.sort((a, b) => b.indice - a.indice || b.total - a.total);
  return { grupos, media };
}

// ---------------------------------------------------------------- séries

export function porMes(registros) {
  const contagem = new Map();
  for (const r of registros) {
    if (!r.distribuicao) continue;
    const mes = r.distribuicao.slice(0, 7);
    contagem.set(mes, (contagem.get(mes) || 0) + 1);
  }
  const meses = [...contagem.keys()].sort();
  if (!meses.length) return [];
  // Preenche meses sem distribuição, para o eixo do tempo não mentir.
  const serie = [];
  let [a, m] = meses[0].split('-').map(Number);
  const [aFim, mFim] = meses.at(-1).split('-').map(Number);
  while (a < aFim || (a === aFim && m <= mFim)) {
    const chave = `${a}-${String(m).padStart(2, '0')}`;
    serie.push({ mes: chave, total: contagem.get(chave) || 0 });
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return serie;
}

export function valoresUnicos(registros, campo) {
  return [...new Set(registros.map((r) => r[campo]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
}
