/* PAUTA CF — Leitura dos movimentos processuais do DataJud (CNJ).
 *
 * O DataJud devolve, para cada processo e cada grau de jurisdição, a lista
 * completa de movimentos com o código das Tabelas Processuais Unificadas (TPU).
 * Ao contrário da exportação do Astrea, que só traz o último andamento, ali
 * está o histórico inteiro — sentença, acórdão e liminar, mesmo quando já
 * foram seguidos de dezenas de outros atos.
 *
 * A classificação é pelo CÓDIGO: o nome que o DataJud devolve é só a folha da
 * árvore ("Liminar", "Procedência") e não diz se foi concedida ou negada.
 * Códigos conferidos no SGT/CNJ (consulta_publica_movimentos.php) em 30/09/2026.
 */

const SENTENCA = {
  219: 'procedente', // Julgado procedente o pedido
  11795: 'procedente', // Procedente — reconhecimento do pedido pelo réu
  11401: 'procedente', 11402: 'procedente', 11403: 'procedente', // procedência + pedido contraposto
  221: 'parcial', // Julgado procedente em parte o pedido
  11404: 'parcial', 11405: 'parcial', 11406: 'parcial',
  220: 'improcedente', // Julgado improcedente o pedido
  11407: 'improcedente', 11408: 'improcedente', 11409: 'improcedente',
  471: 'improcedente', // Decadência ou prescrição
  455: 'improcedente', // Renúncia do autor
  466: 'acordo', // Homologada a transação
};

// Extinção sem resolução do mérito (filhos de 456).
const SEM_MERITO = new Set([
  454, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 11374, 11375, 11376, 11377, 11378,
  11379, 11380, 11381, 12256, 12325, 12617, 14848,
]);

const RECURSO = {
  237: 'provido', 240: 'provido', 972: 'provido',
  238: 'parcial', 241: 'parcial',
  239: 'negado', 242: 'negado', 901: 'negado',
  235: 'nao_conhecido', 236: 'nao_conhecido', 230: 'nao_conhecido',
};

const LIMINAR = {
  332: 'deferida', 339: 'deferida', 889: 'deferida', 892: 'deferida',
  785: 'indeferida', 792: 'indeferida',
  347: 'revogada', 348: 'revogada',
};

const MARCOS = {
  848: 'transito',
  22: 'baixa',
  246: 'arquivamento',
  265: 'sobrestado', 11975: 'sobrestado', 12098: 'sobrestado', 12099: 'sobrestado', 12100: 'sobrestado',
  14968: 'sobrestado', 14969: 'sobrestado', 14970: 'sobrestado', 14971: 'sobrestado', 898: 'sobrestado',
  11385: 'cumprimento', 14099: 'acordo_execucao', 196: 'execucao_extinta',
  11373: 'anulada', 893: 'reativado', 849: 'reativado',
};

/** Classifica um movimento do DataJud. Devolve null quando não é decisivo. */
export function classificarMovimento(mov) {
  const c = Number(mov?.codigo);
  if (SENTENCA[c]) return { tipo: 'sentenca', valor: SENTENCA[c] };
  if (SEM_MERITO.has(c)) return { tipo: 'sentenca', valor: 'sem_merito' };
  if (RECURSO[c]) return { tipo: 'recurso', valor: RECURSO[c] };
  if (LIMINAR[c]) return { tipo: 'liminar', valor: LIMINAR[c] };
  if (MARCOS[c]) return { tipo: 'marco', valor: MARCOS[c] };
  return null;
}

const GRAU_RECURSAL = new Set(['G2', 'TR', 'SUP', 'STJ', 'STF', 'TRU', 'TNU']);

/**
 * Consolida os documentos do DataJud de um mesmo processo (um por grau) no
 * histórico decisivo e no resultado mais recente conhecido.
 */
export function consolidarProcesso(fontes) {
  const eventos = [];
  let orgao = null;
  let atualizacao = null;
  for (const f of fontes) {
    if (!orgao && f.orgaoJulgador && !GRAU_RECURSAL.has(f.grau)) orgao = f.orgaoJulgador;
    if (f.dataHoraUltimaAtualizacao && (!atualizacao || f.dataHoraUltimaAtualizacao > atualizacao)) atualizacao = f.dataHoraUltimaAtualizacao;
    for (const m of f.movimentos || []) {
      const c = classificarMovimento(m);
      if (!c) continue;
      eventos.push({ data: String(m.dataHora || '').slice(0, 10), grau: f.grau || null, codigo: Number(m.codigo), nome: m.nome || '', ...c });
    }
  }
  if (!orgao && fontes[0]?.orgaoJulgador) orgao = fontes[0].orgaoJulgador;
  eventos.sort((a, b) => a.data.localeCompare(b.data));

  // Sentença anulada em recurso deixa de valer: só contam as posteriores à anulação.
  const anulacao = eventos.filter((e) => e.valor === 'anulada').at(-1);
  const validos = anulacao ? eventos.filter((e) => e.data >= anulacao.data) : eventos;

  const sentenca = validos.filter((e) => e.tipo === 'sentenca' && !GRAU_RECURSAL.has(e.grau)).at(-1) || null;
  const recurso = validos.filter((e) => e.tipo === 'recurso').at(-1) || null;
  const liminarEv = validos.filter((e) => e.tipo === 'liminar').at(-1) || null;
  const marcos = new Set(validos.filter((e) => e.tipo === 'marco').map((e) => e.valor));
  // Acordo homologado já na Turma Recursal também encerra o mérito.
  const acordoTr = validos.filter((e) => e.valor === 'acordo' && GRAU_RECURSAL.has(e.grau)).at(-1) || null;

  return {
    encontrado: fontes.length > 0,
    graus: [...new Set(fontes.map((f) => f.grau).filter(Boolean))],
    orgao: orgao ? { nome: orgao.nome || null, codigoMunicipioIBGE: orgao.codigoMunicipioIBGE ?? null } : null,
    atualizacao,
    sentenca: sentenca ? { valor: sentenca.valor, data: sentenca.data, codigo: sentenca.codigo } : null,
    recurso: recurso ? { valor: recurso.valor, data: recurso.data, codigo: recurso.codigo, grau: recurso.grau } : null,
    acordoRecursal: acordoTr ? { data: acordoTr.data } : null,
    liminar: liminarEv ? liminarEv.valor : null,
    transito: marcos.has('transito'),
    sobrestado: marcos.has('sobrestado'),
    cumprimento: marcos.has('cumprimento') || marcos.has('execucao_extinta') || marcos.has('acordo_execucao'),
    arquivado: marcos.has('arquivamento') || (marcos.has('baixa') && !marcos.has('reativado')),
    eventos,
  };
}

const INVERTER = { procedente: 'improcedente', improcedente: 'procedente' };

/**
 * Resultado de mérito para o painel a partir do histórico consolidado, do
 * ponto de vista do cliente. O DataJud não diz quem recorreu; vale a regra de
 * que recorre quem perdeu (improcedência → recurso do autor; procedência →
 * recurso do réu). Na procedência parcial, a direção é desconhecida e o
 * resultado fica como parcial.
 */
export function resultadoDoHistorico(c, clienteReu = false) {
  let resultado = c.acordoRecursal ? 'acordo' : c.sentenca?.valor || null;
  if (!resultado) return null;
  const recursoPosterior = c.recurso && (!c.sentenca || c.recurso.data >= c.sentenca.data);
  if (recursoPosterior && !['acordo', 'sem_merito'].includes(resultado) && ['provido', 'parcial'].includes(c.recurso.valor)) {
    if (resultado === 'improcedente') resultado = c.recurso.valor === 'provido' ? 'procedente' : 'parcial';
    else if (resultado === 'procedente') resultado = c.recurso.valor === 'provido' ? 'improcedente' : 'parcial';
  }
  return clienteReu && INVERTER[resultado] ? INVERTER[resultado] : resultado;
}

/**
 * Atualiza um registro do painel com o histórico do DataJud. O histórico
 * oficial prevalece sobre o texto do último andamento; o município só é
 * preenchido quando a planilha não permitiu identificá-lo.
 */
export function aplicarHistorico(registro, c, indiceIbge) {
  if (!c?.encontrado) return { ...registro, datajud: false };
  const r = { ...registro, datajud: true };
  const resultado = resultadoDoHistorico(c, registro.clienteReu);
  // O DataJud chega com semanas de atraso: se o último andamento da planilha já
  // traz o acórdão e o DataJud ainda não, vale a planilha.
  const planilhaMaisNova = registro.fonteResultado === 'andamento' && registro.recurso && !c.recurso;
  if (resultado && !planilhaMaisNova) {
    r.resultado = resultado;
    r.fonteResultado = 'datajud';
    r.sentenca = c.sentenca?.valor ?? r.sentenca;
    r.dataSentenca = c.sentenca?.data ?? null;
  }
  if (c.recurso) { r.recurso = c.recurso.valor; r.dataRecurso = c.recurso.data; }
  if (c.liminar === 'deferida' || c.liminar === 'indeferida') r.liminar = c.liminar;
  else if (c.liminar === 'revogada') r.liminar = 'indeferida';
  if (c.sobrestado) r.situacao = 'sobrestado';
  else if (c.arquivado && r.situacao !== 'sobrestado') r.situacao = 'arquivado';
  else if (c.recurso || c.graus.some((g) => GRAU_RECURSAL.has(g))) r.situacao = r.situacao === 'arquivado' ? r.situacao : 'em_recurso';
  else if (c.cumprimento) r.situacao = 'cumprimento';
  else if (c.sentenca) r.situacao = 'sentenciado';
  r.transito = c.transito;
  const mun = c.orgao?.codigoMunicipioIBGE && indiceIbge?.get(Number(c.orgao.codigoMunicipioIBGE));
  if (!r.municipio && mun && r.unidade !== 'Núcleo de Justiça 4.0' && mun.uf === r.uf) {
    Object.assign(r, { municipio: mun.nome, ibge: mun.ibge, lat: mun.lat, lon: mun.lon, fonteLocal: 'datajud' });
  }
  return r;
}
