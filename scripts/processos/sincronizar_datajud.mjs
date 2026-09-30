/* Consulta o histórico dos processos na API Pública do DataJud (CNJ).
 *
 *   node scripts/processos/sincronizar_datajud.mjs <Processos.xlsx> [--saida data/saida/datajud.json]
 *
 * Para cada número CNJ da exportação do Astrea, busca no índice do tribunal
 * (api_publica_tjba, api_publica_trf1, api_publica_trt5…) todos os graus em
 * que o processo tramitou, com a lista completa de movimentos. O resultado
 * bruto vai para data/saida/ — pasta ignorada pelo Git, porque contém partes e
 * andamentos. A base publicada é atualizada depois pelo gerar_base.mjs, que lê
 * esse arquivo com --datajud.
 *
 * A chave é a pública divulgada pelo CNJ na wiki do DataJud
 * (https://datajud-wiki.cnj.jus.br/api-publica/acesso); se o CNJ trocá-la,
 * informe a nova em DATAJUD_API_KEY.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lerXlsx, lerCsv } from '../../assets/js/processos/xlsx.js';
import { lerCnj } from '../../assets/js/processos/classificar.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHAVE = process.env.DATAJUD_API_KEY
  || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const URL_BASE = 'https://api-publica.datajud.cnj.jus.br';

const UF_TJ = {
  '01': 'ac', '02': 'al', '03': 'ap', '04': 'am', '05': 'ba', '06': 'ce', '07': 'dft', '08': 'es', '09': 'go',
  10: 'ma', 11: 'mt', 12: 'ms', 13: 'mg', 14: 'pa', 15: 'pb', 16: 'pr', 17: 'pe', 18: 'pi', 19: 'rj',
  20: 'rn', 21: 'rs', 22: 'ro', 23: 'rr', 24: 'sc', 25: 'se', 26: 'sp', 27: 'to',
};

/** Índice do DataJud correspondente ao número CNJ. */
export function indiceDoTribunal(cnj) {
  if (!cnj) return null;
  if (cnj.j === '8') return UF_TJ[cnj.tr] ? `api_publica_tj${UF_TJ[cnj.tr]}` : null;
  if (cnj.j === '4') return `api_publica_trf${Number(cnj.tr)}`;
  if (cnj.j === '5') return `api_publica_trt${Number(cnj.tr)}`;
  return null;
}

const espera = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function consultar(indice, digitos) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      const resp = await fetch(`${URL_BASE}/${indice}/_search`, {
        method: 'POST',
        headers: { Authorization: `APIKey ${CHAVE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: 20, query: { match: { numeroProcesso: digitos } } }),
      });
      if (resp.status === 429 || resp.status >= 500) throw new Error(`HTTP ${resp.status}`);
      if (!resp.ok) return { erro: `HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
      const json = await resp.json();
      return { fontes: json.hits.hits.map((h) => h._source) };
    } catch (erro) {
      if (tentativa === 4) return { erro: String(erro.message || erro) };
      await espera(1000 * 2 ** tentativa);
    }
  }
  return { erro: 'sem resposta' };
}

async function main() {
  const [arquivo, ...opcoes] = process.argv.slice(2);
  if (!arquivo) {
    console.error('Uso: node scripts/processos/sincronizar_datajud.mjs <Processos.xlsx> [--saida arquivo.json]');
    process.exit(1);
  }
  const iSaida = opcoes.indexOf('--saida');
  const saida = resolve(iSaida >= 0 ? opcoes[iSaida + 1] : resolve(RAIZ, 'data', 'saida', 'datajud.json'));

  const linhas = arquivo.toLowerCase().endsWith('.csv')
    ? lerCsv(readFileSync(arquivo, 'utf-8'))
    : await lerXlsx(readFileSync(arquivo), async (b) => inflateRawSync(b));

  const alvos = [];
  for (const l of linhas) {
    const cnj = lerCnj(l['Número']);
    const indice = indiceDoTribunal(cnj);
    if (cnj && indice) alvos.push({ numero: cnj.formatado, digitos: cnj.digitos, indice });
  }

  const resultados = {};
  let feitos = 0;
  const fila = [...alvos];
  const trabalhador = async () => {
    while (fila.length) {
      const a = fila.shift();
      const r = await consultar(a.indice, a.digitos);
      resultados[a.numero] = { indice: a.indice, consultadoEm: new Date().toISOString(), ...r };
      feitos += 1;
      if (feitos % 25 === 0) console.log(`${feitos}/${alvos.length}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, trabalhador));

  mkdirSync(dirname(saida), { recursive: true });
  writeFileSync(saida, JSON.stringify({ geradoEm: new Date().toISOString(), processos: resultados }));

  const valores = Object.values(resultados);
  const achados = valores.filter((r) => r.fontes?.length).length;
  const erros = valores.filter((r) => r.erro);
  console.log(`${alvos.length} consultados · ${achados} encontrados no DataJud · ${alvos.length - achados - erros.length} não encontrados · ${erros.length} erros`);
  if (erros.length) console.log(erros.slice(0, 5).map((e) => `${e.indice}: ${e.erro}`).join('\n'));
  console.log(`Gravado em ${saida}`);
}

main();
