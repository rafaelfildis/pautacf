/* PAUTA CF — Leitor mínimo de planilhas .xlsx e .csv.
 *
 * O painel de processos importa a exportação de processos do Astrea direto no
 * navegador, sem enviar o arquivo a servidor algum. Um .xlsx é um ZIP com XML
 * dentro; basta localizar a primeira planilha, descompactar e ler as células.
 * Nada aqui depende de biblioteca externa: a descompactação usa
 * DecompressionStream no navegador e zlib no Node (script de geração da base),
 * injetada por quem chama.
 *
 * Suporta os dois formatos de célula de texto que aparecem na prática: t="str"
 * e t="inlineStr" (exportação do Astrea) e t="s" com sharedStrings (arquivo
 * reaberto e salvo no Excel). Datas gravadas como número serial do Excel são
 * convertidas para dd/mm/aaaa, o mesmo formato que o Astrea exporta em texto.
 */

const decodificador = new TextDecoder('utf-8');

/** Descompactação padrão no navegador (deflate "cru", como no ZIP). */
export async function inflarNavegador(bytes) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

function u16(v, p) { return v[p] | (v[p + 1] << 8); }
function u32(v, p) { return (v[p] | (v[p + 1] << 8) | (v[p + 2] << 16) | (v[p + 3] << 24)) >>> 0; }

/** Lista as entradas do ZIP a partir do diretório central. */
function entradasZip(v) {
  let fim = -1;
  for (let p = v.length - 22; p >= Math.max(0, v.length - 65557); p--) {
    if (u32(v, p) === 0x06054b50) { fim = p; break; }
  }
  if (fim < 0) throw new Error('Arquivo não é um .xlsx válido (ZIP sem diretório central).');

  const total = u16(v, fim + 10);
  let p = u32(v, fim + 16);
  const entradas = new Map();
  for (let i = 0; i < total; i++) {
    if (u32(v, p) !== 0x02014b50) throw new Error('Diretório central do .xlsx corrompido.');
    const metodo = u16(v, p + 10);
    const compactado = u32(v, p + 20);
    const tamNome = u16(v, p + 28);
    const tamExtra = u16(v, p + 30);
    const tamComentario = u16(v, p + 32);
    const local = u32(v, p + 42);
    const nome = decodificador.decode(v.subarray(p + 46, p + 46 + tamNome));
    entradas.set(nome, { metodo, compactado, local });
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return entradas;
}

async function lerEntrada(v, entrada, inflar) {
  const p = entrada.local;
  if (u32(v, p) !== 0x04034b50) throw new Error('Cabeçalho local do .xlsx corrompido.');
  const inicio = p + 30 + u16(v, p + 26) + u16(v, p + 28);
  const dados = v.subarray(inicio, inicio + entrada.compactado);
  if (entrada.metodo === 0) return decodificador.decode(dados);
  if (entrada.metodo === 8) return decodificador.decode(await inflar(dados));
  throw new Error(`Compressão ${entrada.metodo} não suportada no .xlsx.`);
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function desescapar(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') {
      const codigo = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(codigo);
    }
    return ENTIDADES[e.toLowerCase()];
  });
}

/** Concatena todos os <t> de um trecho (texto simples ou rich text com <r>). */
function textoDe(trecho) {
  let saida = '';
  for (const m of trecho.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) {
    saida += m[1] ? desescapar(m[1]) : '';
  }
  return saida;
}

function indiceColuna(ref) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** Número serial do Excel (sistema 1900) para dd/mm/aaaa. */
function serialParaData(serial) {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function caminhoPrimeiraPlanilha(workbook, rels) {
  const folha = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/);
  if (folha && rels) {
    const alvo = [...rels.matchAll(/<Relationship\b[^>]*>/g)]
      .map((m) => m[0])
      .find((tag) => tag.includes(`Id="${folha[1]}"`));
    const destino = alvo?.match(/Target="([^"]+)"/)?.[1];
    if (destino) return destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`;
  }
  return 'xl/worksheets/sheet1.xml';
}

/**
 * Lê a primeira planilha de um .xlsx e devolve as linhas como objetos
 * indexados pelo cabeçalho (primeira linha). Células vazias viram ''.
 */
export async function lerXlsx(buffer, inflar = inflarNavegador) {
  const v = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const entradas = entradasZip(v);
  const ler = async (nome) => (entradas.has(nome) ? lerEntrada(v, entradas.get(nome), inflar) : null);

  const workbook = (await ler('xl/workbook.xml')) || '';
  const rels = await ler('xl/_rels/workbook.xml.rels');
  const caminho = caminhoPrimeiraPlanilha(workbook, rels);
  const planilha = await ler(caminho);
  if (!planilha) throw new Error('Planilha não encontrada dentro do .xlsx.');

  const compartilhadas = [];
  const ss = await ler('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) compartilhadas.push(textoDe(m[1]));

  // Estilos de data: numFmtId 14–22 e formatos personalizados com d/m/y.
  const estilosData = new Set();
  const estilos = await ler('xl/styles.xml');
  if (estilos) {
    const personalizados = new Set(
      [...estilos.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)]
        .filter((m) => /[dy]/i.test(m[2]) && !/\[h\]|h:mm/i.test(m[2]))
        .map((m) => Number(m[1])),
    );
    const cellXfs = estilos.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
    if (cellXfs) {
      [...cellXfs[1].matchAll(/<xf\b[^>]*>/g)].forEach((m, i) => {
        const id = Number(m[0].match(/numFmtId="(\d+)"/)?.[1] ?? 0);
        if ((id >= 14 && id <= 22) || personalizados.has(id)) estilosData.add(i);
      });
    }
  }

  const linhas = [];
  for (const linha of planilha.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const celulas = [];
    for (const c of linha[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const corpo = c[2] || '';
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const idx = ref ? indiceColuna(ref) : celulas.length;
      const tipo = attrs.match(/\bt="(\w+)"/)?.[1] || 'n';
      const estilo = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1);
      const bruto = corpo.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
      let valor = '';
      if (tipo === 's') valor = compartilhadas[Number(bruto)] ?? '';
      else if (tipo === 'inlineStr') valor = textoDe(corpo);
      else if (bruto !== undefined) {
        valor = desescapar(bruto);
        if (tipo === 'n' && estilosData.has(estilo) && valor !== '' && !Number.isNaN(Number(valor))) {
          valor = serialParaData(Number(valor));
        }
      }
      celulas[idx] = valor;
    }
    linhas.push(celulas);
  }
  return comoObjetos(linhas);
}

function comoObjetos(linhas) {
  const inicio = linhas.findIndex((l) => l.some((c) => String(c ?? '').trim() !== ''));
  if (inicio < 0) return [];
  const cabecalho = linhas[inicio].map((c) => String(c ?? '').trim());
  const saida = [];
  for (const linha of linhas.slice(inicio + 1)) {
    if (!linha.some((c) => String(c ?? '').trim() !== '')) continue;
    const obj = {};
    cabecalho.forEach((nome, i) => { if (nome) obj[nome] = String(linha[i] ?? '').trim(); });
    saida.push(obj);
  }
  return saida;
}

/** Lê CSV (vírgula ou ponto e vírgula, aspas duplas) no mesmo formato de saída. */
export function lerCsv(texto) {
  const semBom = texto.replace(/^﻿/, '');
  const primeira = semBom.split(/\r?\n/, 1)[0] || '';
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < semBom.length; i++) {
    const ch = semBom[i];
    if (aspas) {
      if (ch === '"' && semBom[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && semBom[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return comoObjetos(linhas);
}
