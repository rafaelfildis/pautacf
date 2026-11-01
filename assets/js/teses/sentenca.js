/* PAUTA CF — Leitura do dispositivo de sentenças publicadas no DJEN.
 *
 * Recebe o texto integral de uma publicação e devolve o resultado do
 * julgamento (procedente, parcial, improcedente, extinto, acordo), se houve
 * condenação em dano moral e o valor, mais o trecho do dispositivo em que a
 * conclusão se baseou. É uma leitura por padrões de redação: o trecho vem
 * junto para conferência humana.
 */

export const RESULTADOS_SENTENCA = {
  procedente: 'Procedente',
  parcial: 'Parcialmente procedente',
  improcedente: 'Improcedente',
  extinto: 'Extinto sem mérito',
  acordo: 'Acordo homologado',
  nao_classificado: 'Não classificado',
};

/** Minúsculas, sem acentos, sem HTML e com espaços simples. */
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto legível (sem HTML), preservando acentos. */
export function textoLimpo(texto) {
  return String(texto ?? '')
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const MARCAS_DISPOSITIVO = /(ante o exposto|diante do exposto|isto posto|isso posto|pelo exposto|posto isso|em face do exposto|face ao exposto|diante do que foi exposto|por todo o exposto|ante todo o exposto|ex positis|em razao do exposto|dispositivo)/g;
const JULGAMENTO = /(julgo|julgar|julgados?|julgadas?|resolvo o merito|extingo|homologo|procedente|improcedente)/;

/** Posição do dispositivo: a última marca seguida de um verbo de julgamento. */
function inicioDispositivo(n) {
  let melhor = -1;
  let m;
  MARCAS_DISPOSITIVO.lastIndex = 0;
  while ((m = MARCAS_DISPOSITIVO.exec(n))) {
    if (JULGAMENTO.test(n.slice(m.index, m.index + 700))) melhor = m.index;
  }
  if (melhor >= 0) return melhor;
  const j = n.search(/julgo (parcialmente )?(im)?procedente|julgo-os|homologo/);
  return j >= 0 ? Math.max(0, j - 80) : Math.max(0, n.length - 1500);
}

const PARCIAL = /(parcialmente procedentes?|\bprocedentes? em parte|\bprocedencia parcial|parcial procedencia|parcialmente os pedidos)/;
// Rejeição de só um dos pedidos ("improcedente o pedido de danos morais").
const IMPROCEDENTE_PARCIAL = /(\bimprocedentes? (o|os|a|as) pedidos? (de|relativ|referente|quanto|indenizat)|improcedencia d[oe]s? pedidos? (de|relativ|referente|indenizat))/;
const IMPROCEDENTE_GERAL = /(julgo|julgar|julgados?|julgadas?|julgo-os|julgo-a)( totalmente| integralmente)? improcedentes?|improcedentes? (os|o|a|as) (pedidos?|pretensao|pretensoes|acao|demanda)( formulad\w+| deduzid\w+)?( na (peticao )?inicial| pela parte autora| pel[ao] autora?)?\s*[,.;:]/;
const PROCEDENTE = /(julgo|julgar|julgados?|julgadas?|julgo-os|julgo-a)( totalmente| integralmente)? procedentes?|\bprocedentes? (os|o|a|as) (pedidos?|pretensao|acao|demanda)/;
const EXTINCAO = /(extingo|extinto|extinta|extinguir|julgo extint\w+)( o| a)? (processo|feito|acao)?.{0,60}(sem (resolucao|julgamento|exame) d[oe] merito)|sem (resolucao|julgamento|exame) d[oe] merito|art\.? ?485|art\.? ?51,? (inciso )?(i|ii|iii|iv|v)\b/;
const ACORDO = /(homolog\w+ (por sentenca )?(para que surta seus juridicos e legais efeitos )?(o |a )?(acordo|transacao|composicao)|acordo .{0,80}homologad|transacao .{0,60}homologad)/;
const DM = 'danos? morai?s?|dano moral';

function valorEm(trecho) {
  const m = trecho.match(/r\$\s*([\d.]{1,12},\d{2})/);
  if (!m) return null;
  const v = Number(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Condenação em dano moral no dispositivo: true, false ou null (não identificado). */
function danoMoral(d, resultado) {
  if (resultado === 'improcedente') return { dm: false, valor: null };
  if (!['procedente', 'parcial'].includes(resultado)) return { dm: null, valor: null };
  const NEGA = /(improceden|indefir|indefiro|rejeit|afast|nao (restou|ficou|foi) (configurad|demonstrad|comprovad)|nao (ha|houve) (que se falar|configuracao)|incabive|nao merece|mero (aborrecimento|dissabor)|ausente|nao configurad)/;
  const VERBO = /(conden|pagar|pague|pagamento|indeniza|compensa|reparac|fixo|fixad|arbitr)/;
  let negado = false;
  const re = new RegExp(DM, 'g');
  let m;
  while ((m = re.exec(d))) {
    const antes = d.slice(Math.max(0, m.index - 140), m.index);
    const depois = d.slice(m.index, m.index + 140);
    // Negação colada à menção ("improcedência do pedido de danos morais", "danos morais ... afastados").
    const negAntes = NEGA.test(antes.slice(-70)) && !/[;)]/.test(antes.slice(-70).replace(/^.*?(improceden|indefir|rejeit|afast)/, ''));
    if (negAntes || NEGA.test(depois.slice(0, 90))) { negado = true; continue; }
    // Valor mais próximo da menção, dentro da mesma cláusula (sem atravessar ";").
    const valores = [];
    for (const v of antes.matchAll(/r\$\s*([\d.]{1,12},\d{2})/g)) {
      if (!/;/.test(antes.slice(v.index))) valores.push({ dist: antes.length - v.index, txt: v[0] });
    }
    for (const v of depois.matchAll(/r\$\s*([\d.]{1,12},\d{2})/g)) {
      if (!/;/.test(depois.slice(0, v.index))) valores.push({ dist: v.index, txt: v[0] });
    }
    if (valores.length && VERBO.test(antes + depois)) {
      valores.sort((a, b) => a.dist - b.dist);
      return { dm: true, valor: valorEm(valores[0].txt) };
    }
  }
  return negado ? { dm: false, valor: null } : { dm: null, valor: null };
}

/**
 * Classifica a sentença pelo dispositivo.
 * @returns {{resultado: string, danoMoral: boolean|null, valorDanoMoral: number|null, trecho: string}}
 */
export function classificarSentenca(textoBruto) {
  const limpo = textoLimpo(textoBruto);
  const n = normalizarTexto(textoBruto);
  if (!n) return { resultado: 'nao_classificado', danoMoral: null, valorDanoMoral: null, trecho: '' };
  const ini = inicioDispositivo(n);
  const d = n.slice(ini, ini + 2500);

  let resultado = 'nao_classificado';
  const temProc = PROCEDENTE.test(d);
  const temImp = IMPROCEDENTE_GERAL.test(d);
  if (ACORDO.test(d) && !temProc && !temImp) resultado = 'acordo';
  else if (PARCIAL.test(d)) resultado = 'parcial';
  else if (temProc && (temImp || IMPROCEDENTE_PARCIAL.test(d))) resultado = 'parcial';
  else if (temImp) resultado = 'improcedente';
  else if (temProc) resultado = 'procedente';
  else if (EXTINCAO.test(d)) resultado = 'extinto';

  const { dm, valor } = danoMoral(d, resultado);
  // O texto limpo e o normalizado têm o mesmo número de palavras: o trecho
  // legível é recortado pela proporção, sem depender de índices exatos.
  const proporcao = limpo.length / Math.max(1, n.length);
  const a = Math.floor(ini * proporcao);
  return { resultado, danoMoral: dm, valorDanoMoral: valor, trecho: limpo.slice(a, a + 900) };
}

/** A publicação é uma sentença (ou traz um dispositivo de sentença)? */
export function pareceSentenca(item) {
  const tipo = normalizarTexto(item.tipoDocumento);
  if (/senten/.test(tipo)) return true;
  if (/acordao|ementa/.test(tipo)) return false;
  const n = normalizarTexto(item.texto).slice(-4000);
  return /julgo (parcialmente )?(im)?procedentes?|homologo o projeto de sentenca|julgo-os (im)?procedentes?/.test(n);
}

export function pareceAcordao(item) {
  return /acordao|ementa/.test(normalizarTexto(item.tipoDocumento));
}

/** Todas as palavras-chave aparecem no texto? Entre aspas, vale a frase exata. */
export function contemPalavras(texto, consulta) {
  const n = normalizarTexto(texto);
  const frases = [...String(consulta || '').matchAll(/"([^"]+)"/g)].map((m) => normalizarTexto(m[1]));
  const resto = normalizarTexto(String(consulta || '').replace(/"[^"]*"/g, ' '))
    .split(' ').filter((p) => p.length >= 3 && !['dos', 'das', 'com', 'por', 'para', 'sem', 'que'].includes(p));
  return frases.every((f) => n.includes(f)) && resto.every((p) => n.includes(p));
}
