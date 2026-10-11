/* Gera a base publicada do Painel de Processos a partir da exportação do Astrea.
 *
 *   node scripts/processos/gerar_base.mjs <Processos.xlsx> [--datajud data/saida/datajud.json]
 *        [--conferencia <Carteira_por_tribunal.xlsx>] [--json-bruto <saida.json>]
 *
 * Usa exatamente o mesmo classificador da importação feita no navegador
 * (assets/js/processos/classificar.js) e grava assets/data/processos-base.json.
 * O repositório é público: vai para ele o número do processo (publicado por
 * decisão do escritório), mas nunca nome de cliente, CPF, texto de andamento,
 * valor da causa ou data exata.
 *
 * --conferencia lê a planilha da carteira organizada por tribunal (abas com
 * "Nº do processo", "Procedente/Improcedente", "Com Dano Moral / Sem Dano
 * Moral" e "Tese"). Dela vêm a tese refinada e o dano moral de cada processo;
 * o resultado só é substituído quando a linha foi conferida nos autos
 * (Observações iniciadas por "PJe (dd/mm/aaaa)", "eproc (...)" ou "Projudi (...)").
 *
 * Também atualiza assets/data/origens-cnj.json, o dicionário público de
 * unidades de origem (J.TR.OOOO → município), aprendido dos processos em que a
 * comarca veio escrita por extenso. Ele permite localizar, em importações
 * futuras, processos cuja exportação não traz foro nem vara.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lerXlsx, lerXlsxAbas, lerCsv } from '../../assets/js/processos/xlsx.js';
import {
  classificarPlanilha, criarIndiceMunicipios, paraPublicacao, origensAprendidas, lerCnj, normalizar, TESES,
} from '../../assets/js/processos/classificar.js';
import { consolidarProcesso, aplicarHistorico } from '../../assets/js/processos/movimentos.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DADOS = resolve(RAIZ, 'assets', 'data');

const [arquivo, ...opcoes] = process.argv.slice(2);
if (!arquivo) {
  console.error('Uso: node scripts/processos/gerar_base.mjs <Processos.xlsx> [--datajud <datajud.json>] [--conferencia <carteira.xlsx>] [--json-bruto <saida.json>]');
  process.exit(1);
}

const linhas = arquivo.toLowerCase().endsWith('.csv')
  ? lerCsv(readFileSync(arquivo, 'utf-8'))
  : await lerXlsx(readFileSync(arquivo), async (b) => inflateRawSync(b));

const municipios = JSON.parse(readFileSync(resolve(DADOS, 'municipios.json'), 'utf-8'));
const indice = criarIndiceMunicipios(municipios);
const caminhoOrigens = resolve(DADOS, 'origens-cnj.json');
let origens = {};
try { origens = JSON.parse(readFileSync(caminhoOrigens, 'utf-8')).origens || {}; } catch { /* primeira execução */ }

// Registros do tipo "Caso" não são processos judiciais e ficam fora da base.
let registros = classificarPlanilha(linhas, indice, origens).filter((r) => r.tipo !== 'caso');

// Histórico oficial do CNJ (scripts/processos/sincronizar_datajud.mjs), quando houver.
const iDatajud = opcoes.indexOf('--datajud');
let datajudEm = null;
if (iDatajud >= 0 && opcoes[iDatajud + 1]) {
  const dj = JSON.parse(readFileSync(opcoes[iDatajud + 1], 'utf-8'));
  datajudEm = dj.geradoEm?.slice(0, 10) || null;
  const porIbge = new Map(municipios.municipios.map(([ibge, nome, uf, lat, lon]) => [ibge, { ibge, nome, uf, lat, lon }]));
  registros = registros.map((r) => {
    const p = dj.processos?.[r.numero];
    return p?.fontes?.length ? aplicarHistorico(r, consolidarProcesso(p.fontes), porIbge) : { ...r, datajud: false };
  });
}

// Planilha da carteira conferida (tese, dano moral e, se conferido nos autos, resultado).
const iConf = opcoes.indexOf('--conferencia');
let conferidos = 0;
if (iConf >= 0 && opcoes[iConf + 1]) {
  const abas = await lerXlsxAbas(readFileSync(opcoes[iConf + 1]), async (b) => inflateRawSync(b));
  const tesePorRotulo = new Map(Object.entries(TESES).map(([chave, rotulo]) => [normalizar(rotulo), chave]));
  const resultadoDe = (texto) => {
    const n = normalizar(texto);
    if (/^parcial/.test(n)) return 'parcial';
    if (/^improcedente/.test(n)) return 'improcedente';
    if (/^procedente/.test(n)) return 'procedente';
    if (/^extint\w* com/.test(n)) return 'improcedente'; // decadência, prescrição
    if (/^extint/.test(n)) return 'sem_merito';
    if (/^acordo/.test(n)) return 'acordo';
    if (/^sem senten/.test(n)) return 'pendente';
    return null;
  };
  const planilha = new Map();
  for (const aba of abas) {
    const iCab = aba.linhas.findIndex((l) => l.some((c) => /n[ºo°] do processo/i.test(String(c ?? ''))));
    if (iCab < 0) continue;
    const cab = aba.linhas[iCab].map((c) => normalizar(c));
    const col = (re) => cab.findIndex((c) => re.test(c));
    const C = {
      numero: col(/do processo/), resultado: col(/procedente/), dano: col(/dano moral/),
      tese: col(/^tese$|comunicacao digital/), obs: col(/observac/),
    };
    for (const l of aba.linhas.slice(iCab + 1)) {
      const cnj = lerCnj(String(l[C.numero] ?? ''));
      if (cnj) planilha.set(cnj.formatado, { resultado: l[C.resultado], dano: l[C.dano], tese: l[C.tese], obs: String(l[C.obs] ?? '') });
    }
  }
  const INVERTER = { procedente: 'improcedente', improcedente: 'procedente' };
  registros = registros.map((r) => {
    const p = planilha.get(r.numero);
    if (!p) return r;
    const novo = { ...r };
    const tese = tesePorRotulo.get(normalizar(String(p.tese || '').replace(/ e debito seguro$/i, '')));
    if (tese) novo.tese = tese;
    const dano = normalizar(p.dano);
    novo.danoMoral = /^com dano/.test(dano) ? true : /^sem dano/.test(dano) ? false : null;
    const nosAutos = /(^|\.\s)(PJe|eproc|Projudi|PJe\/eproc) \(\d{2}\/\d{2}\/\d{4}\)/.test(p.obs);
    const resultado = resultadoDe(p.resultado);
    // Acórdão já registrado no CNJ que reformou a sentença continua valendo.
    const reformada = r.fonteResultado === 'datajud' && ['provido', 'parcial'].includes(r.recurso);
    if (nosAutos && resultado && !reformada) {
      novo.resultado = r.clienteReu && INVERTER[resultado] ? INVERTER[resultado] : resultado;
      novo.fonteResultado = resultado === 'pendente' ? null : 'autos';
      if (resultado !== 'pendente' && novo.situacao === 'em_andamento') novo.situacao = 'sentenciado';
      conferidos += 1;
    }
    return novo;
  });
}

// Dicionário de origens: só entra o que veio do texto do foro/vara, sem conflito.
const aprendidas = { ...origens };
for (const [origem, r] of origensAprendidas(registros)) aprendidas[origem] ??= r.municipio;
const ordenadas = Object.fromEntries(Object.entries(aprendidas).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(caminhoOrigens, `${JSON.stringify({
  descricao: 'Unidade de origem do número CNJ (J.TR.OOOO) → município-sede. Dado público de organização judiciária.',
  origens: ordenadas,
}, null, 1)}\n`);

const datas = registros.map((r) => r.ultimoAndamento).filter(Boolean).sort();
const base = {
  versao: 1,
  geradoEm: new Date().toISOString().slice(0, 10),
  referencia: datas.at(-1) || null,
  fonte: (datajudEm
    ? `Exportação de processos do Astrea + histórico do DataJud/CNJ (consultado em ${datajudEm})`
    : 'Exportação de processos do Astrea — sem nome de cliente')
    + (conferidos ? ` + conferência nos autos (${conferidos} processos)` : ''),
  datajud: datajudEm,
  total: registros.length,
  registros: registros.map(paraPublicacao),
};
writeFileSync(resolve(DADOS, 'processos-base.json'), `${JSON.stringify(base)}\n`);

const iBruto = opcoes.indexOf('--json-bruto');
if (iBruto >= 0 && opcoes[iBruto + 1]) {
  writeFileSync(opcoes[iBruto + 1], JSON.stringify(registros, null, 1));
}

const semLocal = registros.filter((r) => !r.municipio);
const contagem = (campo) => Object.entries(registros.reduce((acc, r) => ({ ...acc, [r[campo]]: (acc[r[campo]] || 0) + 1 }), {}))
  .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · ');
console.log(`${registros.length} processos classificados${conferidos ? ` · ${conferidos} com resultado conferido nos autos` : ''}.`);
console.log(`Tese — ${contagem('tese')}`);
console.log(`Dano moral — ${contagem('danoMoral')}`);
console.log(`Resultado — ${contagem('resultado')}`);
console.log(`UF — ${contagem('uf')}`);
console.log(`Sem município (${semLocal.length}): ${semLocal.map((r) => `${r.uf}/${r.unidade}`).join(', ')}`);
