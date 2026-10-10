/* Gera a base da aba "Demandas de massa" do Painel de Processos.
 *
 *   node scripts/processos/gerar_demandas_massa.mjs <Processos_Agibank_por_tribunal.xlsx>
 *
 * Lê a planilha conferida no PJe/Projudi (uma aba por tribunal, cabeçalho com
 * "Nº do processo", "Procedente/Improcedente", "Com Dano Moral / Sem Dano
 * Moral" e "TARIFA DE COMUNICAÇÃO DIGITAL/DÉBITO SEGURO") e grava
 * assets/data/demandas-massa.json só com os processos das duas teses de massa:
 * Tarifa de Comunicação Digital e Débito Seguro.
 *
 * Vai para o site público o número do processo (decisão do escritório), a
 * comarca, a tese, o resultado, o dano moral e a nota da conferência — sempre
 * sem o nome do cliente, que é retirado também do texto da nota.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lerXlsxAbas } from '../../assets/js/processos/xlsx.js';
import { criarIndiceMunicipios, resolverLocal, lerCnj, normalizar } from '../../assets/js/processos/classificar.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DADOS = resolve(RAIZ, 'assets', 'data');

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/processos/gerar_demandas_massa.mjs <planilha.xlsx>');
  process.exit(1);
}

const abas = await lerXlsxAbas(readFileSync(arquivo), async (b) => inflateRawSync(b));
const indice = criarIndiceMunicipios(JSON.parse(readFileSync(resolve(DADOS, 'municipios.json'), 'utf-8')));
const origens = JSON.parse(readFileSync(resolve(DADOS, 'origens-cnj.json'), 'utf-8')).origens || {};

function tese(texto) {
  const n = normalizar(texto);
  if (/comunicacao digital/.test(n)) return 'tcd';
  if (/seguro/.test(n)) return 'seguro';
  return null;
}

function resultado(texto) {
  const n = normalizar(texto);
  if (/^parcial/.test(n)) return 'parcial';
  if (/^improcedente/.test(n)) return 'improcedente';
  if (/^procedente/.test(n)) return 'procedente';
  if (/^extint/.test(n)) return 'extinto';
  return 'aguardando';
}

/** Tira o nome do cliente (completo e cada parte com mais de 3 letras) da nota. */
function semNome(texto, nome) {
  let t = String(texto || '');
  const partes = [nome, ...String(nome || '').split(/\s+/)].filter((p) => p && p.length > 3);
  for (const p of partes) t = t.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[cliente]');
  return t.replace(/(\[cliente\]\s*)+/g, '[cliente] ').trim();
}

const processos = [];
const semTese = {};
let dataReferencia = null;
for (const aba of abas) {
  const iCab = aba.linhas.findIndex((l) => l.some((c) => /n[ºo°] do processo/i.test(String(c ?? ''))));
  if (iCab < 0) continue;
  const cab = aba.linhas[iCab].map((c) => normalizar(c));
  const col = (re) => cab.findIndex((c) => re.test(c));
  const C = {
    numero: col(/do processo/), cliente: col(/parte autora|cliente/), orgao: col(/orgao julgador/),
    distribuicao: col(/distribuicao/), resultado: col(/procedente/), dano: col(/dano moral/),
    tese: col(/comunicacao digital|debito seguro|tese/), andamento: col(/ultimo andamento/), obs: col(/observac/),
  };
  for (const l of aba.linhas.slice(iCab + 1)) {
    const numero = String(l[C.numero] ?? '').trim();
    if (!lerCnj(numero)) continue;
    const t = tese(l[C.tese]);
    if (!t) { semTese[aba.nome] = (semTese[aba.nome] || 0) + 1; continue; }
    const loc = resolverLocal({ 'Número': numero, Vara: l[C.orgao] || '', Foro: '', 'Descrição do último histórico': '' }, indice, origens);
    const r = resultado(l[C.resultado]);
    const motivo = String(l[C.resultado] || '').match(/\(([^)]+)\)/);
    const andamento = String(l[C.andamento] || '');
    const m = andamento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) { const iso = `${m[3]}-${m[2]}-${m[1]}`; if (!dataReferencia || iso > dataReferencia) dataReferencia = iso; }
    processos.push({
      n: lerCnj(numero).formatado,
      uf: loc.uf,
      m: loc.municipio || (loc.unidade === 'Núcleo de Justiça 4.0' ? 'Núcleo de Justiça 4.0' : 'Comarca não identificada'),
      lat: loc.lat,
      lon: loc.lon,
      t,
      r,
      dm: /com dano moral/.test(normalizar(l[C.dano])),
      ext: r === 'extinto' && motivo ? motivo[1] : null,
      u: m ? m[0] : null,
      o: semNome(l[C.obs], l[C.cliente]).slice(0, 600),
    });
  }
}

const saida = {
  geradoEm: new Date().toISOString().slice(0, 10),
  referencia: dataReferencia,
  fonte: 'Planilha de processos do Agibank conferida no PJe/Projudi',
  semTese,
  processos,
};
writeFileSync(resolve(DADOS, 'demandas-massa.json'), `${JSON.stringify(saida)}\n`);

const conta = (f) => processos.reduce((a, p) => ({ ...a, [f(p)]: (a[f(p)] || 0) + 1 }), {});
console.log(`${processos.length} processos das duas teses gravados.`, conta((p) => `${p.uf}/${p.t}`));
console.log('Resultados:', conta((p) => p.r), '· com dano moral:', processos.filter((p) => p.dm).length);
console.log('Sem tese na planilha (fora do painel):', semTese);
console.log('Sem comarca no mapa:', processos.filter((p) => p.lat == null).map((p) => p.m).join(', ') || 'nenhum');
