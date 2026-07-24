/* PAUTA CF — modelo do documento exportado.
 *
 * Recebe os registros já filtrados pela tela e devolve uma estrutura pronta,
 * independente de formato: cabeçalho, resumo executivo e grupos de registros.
 * PDF, HTML, impressão e JPEG consomem exatamente este objeto, o que garante que
 * os quatro formatos mostrem os mesmos dados.
 */

import {
  MARCA, VAZIO_RESPONSAVEL, VAZIO_TEXTO, MODOS_DOCUMENTO, CHAVES_AGRUPAMENTO,
  agrupar, aplicarPrivacidade, formatarCarimbo, formatarData, formatarDataLonga,
  formatarIntervalo, formatarHora, ouVazio, resumirGrupo, separarForo,
} from './formato.js';

export const CONFIG_PADRAO = {
  formato: 'pdf-completo',
  orientacao: 'auto',
  visualizacao: 'computador',
  agrupamento: CHAVES_AGRUPAMENTO.data,
  documentos: MODOS_DOCUMENTO.exibir,
  exibirLinks: true,
  exibirSemResponsavel: true,
  individualizarPor: '',
};

/** Ajustes que fazem sentido por si só em cada destino. */
export function padraoPara(formato) {
  const ehMobile = formato === 'pdf-mobile' || formato === 'imprimir-mobile' || formato === 'jpeg';

  return {
    ...CONFIG_PADRAO,
    formato,
    // Pauta compartilhada por celular circula fora do escritório: mascarar é o
    // padrão seguro, e continua ajustável no modal.
    documentos: ehMobile ? MODOS_DOCUMENTO.mascarar : MODOS_DOCUMENTO.exibir,
    visualizacao: ehMobile ? 'celular' : 'computador',
    orientacao: ehMobile ? 'retrato' : 'paisagem',
  };
}

/** Normaliza um registro da tela para o vocabulário do documento. */
function prepararItem(item, config) {
  const priv = (t) => aplicarPrivacidade(t, config.documentos);
  const foro = separarForo(item.foro);

  return {
    uid: item.uid,
    tipo: item.tipo,
    subtipo: item.subtipo,
    inicio: item.inicio,
    fim: item.fim,

    data: formatarData(item.inicio),
    dataLonga: formatarDataLonga(item.inicio),
    // Tarefas e prazos não têm hora marcada; a etiqueta ao lado já diz o tipo,
    // então o espaço do horário informa a única coisa útil que resta.
    horario: item.tipo === 'tarefa' ? 'Dia inteiro' : formatarIntervalo(item.inicio, item.fim),
    horarioCurto: item.tipo === 'tarefa' ? '—' : formatarHora(item.inicio),

    parteAutora: ouVazio(priv(item.parteAutora || item.titulo)),
    parteRe: ouVazio(priv(item.parteRe)),
    cliente: priv(item.cliente || item.parteAutora || ''),
    processo: ouVazio(item.processo),
    foro: ouVazio(foro.principal),
    foroComplemento: foro.complemento,
    cidade: ouVazio(item.cidade),
    responsavel: ouVazio(item.responsavel, VAZIO_RESPONSAVEL),
    temResponsavel: !!(item.responsavel || '').trim(),
    modalidade: ouVazio(item.modalidade, VAZIO_TEXTO),
    detalhe: item.detalhe || '',
    link: config.exibirLinks ? (item.link || '') : '',
  };
}

function montarResumo(itens) {
  const conta = (fn) => itens.filter(fn).length;

  return {
    total: itens.length,
    audiencias: conta((i) => i.subtipo === 'audiencia'),
    tarefas: conta((i) => i.subtipo === 'tarefa'),
    prazos: conta((i) => i.subtipo === 'prazo'),
    comarcas: new Set(itens.map((i) => i.cidade).filter((c) => c && c !== VAZIO_TEXTO)).size,
    semResponsavel: conta((i) => !i.temResponsavel),
    virtuais: conta((i) => i.modalidade === 'Virtual'),
    presenciais: conta((i) => i.modalidade === 'Presencial'),
    hibridas: conta((i) => i.modalidade === 'Híbrida'),
    comLink: conta((i) => !!i.link),
  };
}

/**
 * Monta o documento completo.
 * @param {Array<object>} registros registros já filtrados pela tela
 * @param {object} periodo { de, ate, rotulo }
 * @param {object} config configuração vinda do modal
 */
export function montarDocumento(registros, periodo, config) {
  const cfg = { ...CONFIG_PADRAO, ...config };

  let itens = registros.map((r) => prepararItem(r, cfg));
  if (!cfg.exibirSemResponsavel) itens = itens.filter((i) => i.temResponsavel);

  const grupos = agrupar(itens, cfg.agrupamento).map((g) => ({
    ...g,
    resumo: resumirGrupo(g.itens),
  }));

  return {
    marca: MARCA,
    titulo: MARCA.titulo,
    tituloLinha1: MARCA.tituloLinha1,
    tituloLinha2: MARCA.tituloLinha2,
    periodo: { ...periodo },
    emitidoEm: formatarCarimbo(new Date()),
    config: cfg,
    itens,
    grupos,
    resumo: montarResumo(itens),
  };
}

/**
 * Divide o documento em vários, um por responsável, cliente, data ou cidade.
 * @returns {Array<{escopo: string, documento: object}>}
 */
export function individualizar(registros, periodo, config) {
  const criterio = config.individualizarPor;
  if (!criterio) return [];

  const chave = (r) => {
    switch (criterio) {
      case 'responsavel': return ouVazio(r.responsavel, VAZIO_RESPONSAVEL);
      case 'cidade': return ouVazio(r.cidade);
      case 'cliente': return ouVazio(r.cliente || r.parteAutora);
      default: return formatarData(r.inicio);
    }
  };

  const mapa = new Map();
  for (const r of registros) {
    const k = chave(r);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(r);
  }

  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .map(([escopo, lista]) => ({
      escopo,
      documento: montarDocumento(lista, periodo, { ...config, individualizarPor: '' }),
    }));
}
