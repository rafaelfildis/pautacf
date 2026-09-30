/* Gera a base publicada do Painel de Processos a partir da exportação do Astrea.
 *
 *   node scripts/processos/gerar_base.mjs <Processos.xlsx> [--json-bruto <saida.json>]
 *
 * Usa exatamente o mesmo classificador da importação feita no navegador
 * (assets/js/processos/classificar.js) e grava assets/data/processos-base.json.
 * O repositório é público: vai para ele o número do processo (publicado por
 * decisão do escritório), mas nunca nome de cliente, CPF, texto de andamento,
 * valor da causa ou data exata.
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

import { lerXlsx, lerCsv } from '../../assets/js/processos/xlsx.js';
import {
  classificarPlanilha, criarIndiceMunicipios, paraPublicacao, origensAprendidas,
} from '../../assets/js/processos/classificar.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DADOS = resolve(RAIZ, 'assets', 'data');

const [arquivo, ...opcoes] = process.argv.slice(2);
if (!arquivo) {
  console.error('Uso: node scripts/processos/gerar_base.mjs <Processos.xlsx> [--json-bruto <saida.json>]');
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

const registros = classificarPlanilha(linhas, indice, origens);

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
  fonte: 'Exportação de processos do Astrea — sem nome de cliente',
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
console.log(`${registros.length} processos classificados.`);
console.log(`Resultado — ${contagem('resultado')}`);
console.log(`UF — ${contagem('uf')}`);
console.log(`Sem município (${semLocal.length}): ${semLocal.map((r) => `${r.uf}/${r.unidade}`).join(', ')}`);
