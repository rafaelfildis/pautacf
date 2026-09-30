/* PAUTA CF — Classificação dos processos exportados do Astrea.
 *
 * Transforma cada linha da exportação de processos (planilha "Processos" do
 * Astrea) num registro do painel: onde o processo tramita (UF, comarca e
 * coordenadas), contra quem, sobre qual tese e qual o resultado conhecido.
 *
 * O Astrea não preenche "Decisão do processo" nem "Resultado do processo" na
 * exportação. O resultado é reconstruído de duas fontes:
 *   1. as etiquetas do escritório (PROCEDENTE, IMPROCEDENTE, LIMINAR DEFERIDA,
 *      SOBRESTADO, Em fase de recurso) — autoritativas;
 *   2. o texto do último andamento, que muitas vezes traz a íntegra da
 *      sentença, da decisão monocrática ou do acórdão da Turma Recursal.
 *
 * Módulo puro (sem DOM): roda no navegador, na importação da planilha, e no
 * Node, no script que gera a base publicada.
 */

// ---------------------------------------------------------------- tribunais

const UF_JUSTICA_ESTADUAL = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DF',
  '08': 'ES', '09': 'GO', '10': 'MA', '11': 'MT', '12': 'MS', '13': 'MG', '14': 'PA',
  '15': 'PB', '16': 'PR', '17': 'PE', '18': 'PI', '19': 'RJ', '20': 'RN', '21': 'RS',
  '22': 'RO', '23': 'RR', '24': 'SC', '25': 'SE', '26': 'SP', '27': 'TO',
};

const UF_TRT = {
  '01': 'RJ', '02': 'SP', '03': 'MG', '04': 'RS', '05': 'BA', '06': 'PE', '07': 'CE',
  '08': 'PA', '09': 'PR', '10': 'DF', '11': 'AM', '12': 'SC', '13': 'PB', '14': 'RO',
  '15': 'SP', '16': 'MA', '17': 'ES', '18': 'GO', '19': 'AL', '20': 'SE', '21': 'RN',
  '22': 'PI', '23': 'MT', '24': 'MS',
};

// Seções judiciárias da Justiça Federal (dois primeiros dígitos do OOOO).
const UF_SECAO_FEDERAL = {
  '30': 'AC', '31': 'AP', '32': 'AM', '33': 'BA', '34': 'DF', '35': 'GO', '36': 'MT',
  '37': 'MA', '38': 'MG', '39': 'PA', '40': 'PI', '41': 'RO', '42': 'RR', '43': 'TO',
};

export const NOMES_UF = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const CAPITAIS = {
  AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus', BA: 'Salvador', CE: 'Fortaleza',
  DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá',
  MS: 'Campo Grande', MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba',
  PE: 'Recife', PI: 'Teresina', RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre',
  RO: 'Porto Velho', RR: 'Boa Vista', SC: 'Florianópolis', SP: 'São Paulo', SE: 'Aracaju',
  TO: 'Palmas',
};

// ---------------------------------------------------------------- rótulos

export const RESULTADOS = {
  procedente: 'Procedente',
  parcial: 'Parcialmente procedente',
  acordo: 'Acordo homologado',
  improcedente: 'Improcedente',
  sem_merito: 'Extinto sem mérito',
  pendente: 'Sem decisão de mérito',
};

/** Resultados que contam como êxito na taxa de procedência. */
export const EXITO = new Set(['procedente', 'parcial', 'acordo']);
/** Resultados de mérito (denominador da taxa). Extinção sem mérito fica de fora. */
export const DECIDIDO = new Set(['procedente', 'parcial', 'acordo', 'improcedente']);

export const TESES = {
  tarifa_bancaria: 'Tarifa bancária',
  emprestimo_consignado: 'Empréstimo consignado',
  cartao_rmc_rcc: 'Cartão consignado (RMC/RCC)',
  seguro_nao_contratado: 'Seguro não contratado',
  credito_pessoal_cdc: 'Crédito pessoal / CDC',
  fraude_bancaria: 'Fraude bancária',
  bancario_outros: 'Bancário — tese não cadastrada',
  previdenciario: 'Previdenciário (INSS)',
  consumidor_outros: 'Consumidor — outros',
  civel_outros: 'Cível — outros',
  familia_sucessoes: 'Família e sucessões',
  trabalhista: 'Trabalhista',
  empresarial: 'Empresarial / recuperação',
};

/** Teses de captação em massa — o escopo padrão do painel de tráfego. */
export const TESES_MASSA = new Set([
  'tarifa_bancaria', 'emprestimo_consignado', 'cartao_rmc_rcc', 'seguro_nao_contratado',
  'credito_pessoal_cdc', 'fraude_bancaria', 'bancario_outros', 'previdenciario', 'consumidor_outros',
]);

export const SITUACOES = {
  em_andamento: 'Em andamento',
  sentenciado: 'Sentenciado',
  em_recurso: 'Em recurso',
  cumprimento: 'Cumprimento de sentença',
  sobrestado: 'Sobrestado',
  arquivado: 'Arquivado',
};

// ---------------------------------------------------------------- utilidades

/** Minúsculas, sem acentos e com espaços simples — base de toda comparação. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tituloProprio(texto) {
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return String(texto ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/** Decompõe o número CNJ (com ou sem máscara). */
export function lerCnj(numero) {
  const d = String(numero ?? '').replace(/\D/g, '');
  if (d.length !== 20) return null;
  return {
    digitos: d,
    formatado: `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d[13]}.${d.slice(14, 16)}.${d.slice(16)}`,
    ano: Number(d.slice(9, 13)),
    j: d[13],
    tr: d.slice(14, 16),
    oooo: d.slice(16),
    origem: `${d[13]}.${d.slice(14, 16)}.${d.slice(16)}`,
  };
}

function siglaTribunal(cnj, etiquetas) {
  if (cnj) {
    if (cnj.j === '8') return `TJ${UF_JUSTICA_ESTADUAL[cnj.tr] ?? '??'}`;
    if (cnj.j === '4') return `TRF${Number(cnj.tr)}`;
    if (cnj.j === '5') return `TRT${Number(cnj.tr)}`;
  }
  const m = String(etiquetas ?? '').match(/\b(TJ[A-Z]{2}|TRF\d|TRT\d{1,2})\b/);
  return m ? m[1] : null;
}

function ufDoProcesso(cnj, textoLocal, etiquetas) {
  const n = normalizar(textoLocal);
  if (cnj?.j === '8') return UF_JUSTICA_ESTADUAL[cnj.tr] ?? null;
  if (cnj?.j === '5') return UF_TRT[cnj.tr] ?? null;
  if (cnj?.j === '4') {
    const porSigla = String(textoLocal).match(/\bSJ([A-Z]{2})\b|-\s*([A-Z]{2})\b/);
    if (porSigla) {
      const uf = porSigla[1] || porSigla[2];
      if (NOMES_UF[uf]) return uf;
    }
    for (const [uf, nome] of Object.entries(NOMES_UF)) {
      if (n.includes(`judiciaria d${uf === 'BA' || uf === 'PB' ? 'a' : 'o'} ${normalizar(nome)}`)) return uf;
    }
    return UF_SECAO_FEDERAL[cnj.oooo.slice(0, 2)] ?? null;
  }
  const tj = String(etiquetas ?? '').match(/\bTJ([A-Z]{2})\b/);
  return tj && NOMES_UF[tj[1]] ? tj[1] : null;
}

// ---------------------------------------------------------------- municípios

// Nomes de município que também são palavras comuns em nomes de varas.
const NOMES_AMBIGUOS = new Set(['central', 'conde', 'vitoria', 'natal', 'horizonte', 'palmas']);

/**
 * Índice de municípios por UF a partir de assets/data/municipios.json.
 * Cada UF guarda os nomes em ordem decrescente de tamanho, para que
 * "Juazeiro do Norte" vença "Juazeiro" e "Belo Horizonte" vença "Horizonte".
 */
export function criarIndiceMunicipios(base) {
  const porUf = new Map();
  const porChave = new Map();
  for (const [ibge, nome, uf, lat, lon] of base.municipios) {
    const item = { ibge, nome, uf, lat, lon, norm: normalizar(nome).replace(/[-']/g, ' ').replace(/\s+/g, ' ') };
    if (!porUf.has(uf)) porUf.set(uf, []);
    porUf.get(uf).push(item);
    porChave.set(`${uf}|${item.norm}`, item);
  }
  for (const lista of porUf.values()) lista.sort((a, b) => b.norm.length - a.norm.length);
  return { porUf, porChave };
}

function textoComparavel(texto) {
  return ` ${normalizar(texto).replace(/[-'´`]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
}

function porNome(indice, uf, nome) {
  if (!uf || !nome) return null;
  const chave = textoComparavel(nome).trim();
  return indice.porChave.get(`${uf}|${chave}`) ?? null;
}

/** Procura o município no trecho que segue "Comarca de", "Subseção de" etc. */
function porExpressao(indice, uf, texto) {
  const lista = indice.porUf.get(uf) || [];
  const n = textoComparavel(texto);
  const padroes = [
    / comarca d[aeo]s? (.+)/,
    / subsecao judiciaria d[aeo] (.+)/,
    / ssj d[aeo] (.+)/,
    / foro d[aeo] (.+)/,
    / (?:civeis|comerciais|consumo|juizados|juizado|especiais|jec|vara|unica) d[aeo] (.+)/,
  ];
  for (const re of padroes) {
    const m = n.match(re);
    if (!m) continue;
    const resto = ` ${m[1]}`;
    // Nome completo no início do trecho capturado.
    const achado = lista.find((mun) => resto.startsWith(` ${mun.norm} `));
    if (achado) return achado;
    // Texto truncado pelo Astrea ("... da Comarca de Porto Aleg"): prefixo único.
    const pedaco = resto.trim();
    if (pedaco.length >= 5) {
      const candidatos = lista.filter((mun) => mun.norm.startsWith(pedaco));
      if (candidatos.length === 1) return candidatos[0];
    }
  }
  return null;
}

/** Foro que começa pelo nome da cidade ("Natal - Juizado Especial Cível", "SALVADOR - REGIÃO METROPOLITANA"). */
function porInicio(indice, uf, texto) {
  const lista = indice.porUf.get(uf) || [];
  const n = textoComparavel(texto);
  return lista.find((mun) => n.startsWith(` ${mun.norm} `)) ?? null;
}

/** Último recurso textual: o maior nome de município da UF contido no texto. */
function porVarredura(indice, uf, texto) {
  const lista = indice.porUf.get(uf) || [];
  const n = textoComparavel(texto);
  for (const mun of lista) {
    if (mun.norm.length < 4 || NOMES_AMBIGUOS.has(mun.norm)) continue;
    if (n.includes(` ${mun.norm} `)) return mun;
  }
  return null;
}

/** Comarca de origem citada em acórdão ("ORIGEM: Juizado Especial Cível da Comarca de Crato/CE"). */
function origemDoHistorico(historico) {
  const m = String(historico ?? '').match(/ORIGEM:?\s*([^|\n]{0,120}?comarca d[aeo]s? [^/|\n,.;]{3,60})/i);
  return m ? m[1] : '';
}

/** Remessa para outra comarca no último andamento. */
function remessaDoHistorico(historico) {
  const m = String(historico ?? '').match(/remess[ao] dos autos (?:para|à|a) (?:a )?comarca de ([^/|\n,.;]{3,60})/i);
  return m ? `Comarca de ${m[1]}` : '';
}

function orgaoDoHistorico(historico) {
  const m = String(historico ?? '').match(/[OÓ]rg[aã]o:\s*([^<\n|]{3,140})/i);
  return m ? m[1] : '';
}

function tipoUnidade(textoLocal, acao) {
  const n = normalizar(`${textoLocal} ${acao}`);
  if (/nucleo de justica 4\.0/.test(n)) return 'Núcleo de Justiça 4.0';
  if (/turma recursal|\btitular tr\b|\btr - /.test(n)) return 'Turma Recursal';
  if (/juizado especial federal|vara federal de juizado|juizado especial civel e criminal adjunto a/.test(n)) return 'Juizado Especial Federal';
  if (/vara do trabalho/.test(n)) return 'Justiça do Trabalho';
  if (/vara federal|secao judiciaria|subsecao judiciaria/.test(n)) return 'Vara Federal';
  if (/juizad|\bjec\b|\bjd\b|vsje|unidade jurisdicional|sistema dos juizados|sistema juizados|sist dos juizados/.test(n)) return 'Juizado Especial';
  if (/familia|sucess/.test(n)) return 'Família e sucessões';
  if (/fazenda publica/.test(n)) return 'Fazenda Pública';
  if (/\bvara\b|\bv dos feitos\b|\bjuizo\b/.test(n)) return 'Vara cível';
  if (/comarca/.test(n)) return 'Comarca (unidade não informada)';
  return 'Não informada';
}

/**
 * Resolve UF e município. `origens` é o dicionário público "J.TR.OOOO" →
 * município (assets/data/origens-cnj.json), usado quando a exportação não traz
 * foro nem vara.
 */
export function resolverLocal(linha, indice, origens = {}) {
  const cnj = lerCnj(linha['Número']);
  const foro = linha.Foro || '';
  const vara = linha.Vara || '';
  const orgao = orgaoDoHistorico(linha['Descrição do último histórico']);
  const textoLocal = [foro, vara, orgao].filter(Boolean).join(' | ');
  const uf = ufDoProcesso(cnj, textoLocal, linha.Etiquetas);
  const unidade = tipoUnidade(textoLocal, linha['Ação']);
  const nLocal = normalizar(textoLocal);

  let municipio = null;
  let fonte = 'nenhuma';

  if (uf && indice) {
    if (unidade === 'Núcleo de Justiça 4.0') {
      municipio = null; // unidade virtual: atende o estado todo
    } else if (/\bvsje\b/.test(nLocal) && uf === 'BA') {
      municipio = porNome(indice, uf, 'Salvador'); fonte = 'vara';
    } else if (/secao judiciaria d[ao] |\bsj[a-z]{2}\b/.test(nLocal) && !/subsecao/.test(nLocal)) {
      municipio = porNome(indice, uf, CAPITAIS[uf]); fonte = 'foro';
    } else if (/jec central - vergueiro|foro central/.test(nLocal) && uf === 'SP') {
      municipio = porNome(indice, uf, 'São Paulo'); fonte = 'vara';
    }

    // O último andamento pode mostrar que o processo mudou de comarca, ou, no
    // Núcleo 4.0 e na Turma Recursal, qual foi a comarca de origem.
    const remessa = remessaDoHistorico(linha['Descrição do último histórico']);
    const origemAcordao = origemDoHistorico(linha['Descrição do último histórico']);
    for (const texto of [remessa, !municipio && origemAcordao]) {
      if (!texto) continue;
      const achado = porExpressao(indice, uf, texto);
      if (achado) { municipio = achado; fonte = 'texto'; break; }
    }

    if (!municipio && unidade !== 'Núcleo de Justiça 4.0') {
      for (const [texto, origem] of [[foro, 'foro'], [vara, 'vara'], [orgao, 'texto']]) {
        if (!texto) continue;
        municipio = porExpressao(indice, uf, texto)
          || (origem === 'foro' && porInicio(indice, uf, texto))
          || porVarredura(indice, uf, texto);
        if (municipio) { fonte = origem; break; }
      }
      if (!municipio && /\bcapital\b/.test(nLocal)) {
        municipio = porNome(indice, uf, CAPITAIS[uf]); fonte = 'foro';
      }
    }

    if (!municipio && cnj && origens[cnj.origem] && unidade !== 'Núcleo de Justiça 4.0') {
      municipio = porNome(indice, uf, origens[cnj.origem]);
      if (municipio) fonte = 'cnj';
    }
  }

  return {
    cnj,
    uf,
    tribunal: siglaTribunal(cnj, linha.Etiquetas),
    unidade,
    municipio: municipio?.nome ?? null,
    ibge: municipio?.ibge ?? null,
    lat: municipio?.lat ?? null,
    lon: municipio?.lon ?? null,
    fonteLocal: fonte,
  };
}

// ---------------------------------------------------------------- parte adversa

const REUS_CONHECIDOS = [
  [/agibank/, 'Agibank'],
  [/\bbmg\b/, 'BMG'],
  [/\bbanco pan\b|\bpan s\.?\s?a\b/, 'Pan'],
  [/santander/, 'Santander'],
  [/bradesco/, 'Bradesco'],
  [/banco master|\bmaster s/, 'Master'],
  [/capital consig/, 'Capital Consig'],
  [/instituto nacional do seguro social|\binss\b/, 'INSS'],
  [/mercantil/, 'Mercantil'],
  [/\bc6\b/, 'C6 Bank'],
  [/itau/, 'Itaú'],
  [/caixa economica/, 'Caixa'],
  [/banco do brasil/, 'Banco do Brasil'],
  [/facta|15\.581\.638/, 'Facta'],
  [/banco daycoval|daycoval/, 'Daycoval'],
  [/banco safra|\bsafra\b/, 'Safra'],
  [/banco inter\b/, 'Inter'],
  [/nubank|nu pagamentos/, 'Nubank'],
  [/picpay/, 'PicPay'],
  [/crefisa/, 'Crefisa'],
  [/olé|ole consignado|banco ole/, 'Olé'],
  [/paranaense de energia|copel/, 'Copel'],
  [/ampla energia|enel/, 'Enel/Ampla'],
  [/facebook|meta platforms/, 'Facebook/Meta'],
  [/banco maxima/, 'Master'],
  [/aymore/, 'Aymoré'],
  [/bnp paribas/, 'BNP Paribas'],
  [/pagseguro|pagbank/, 'PagBank'],
  [/amazon/, 'Amazon'],
  [/hapvida/, 'Hapvida'],
  [/telefonica|\bvivo\b/, 'Vivo'],
  [/\bgol linhas/, 'Gol'],
  [/\btam linhas|latam/, 'Latam'],
  [/estacio/, 'Estácio'],
  [/localiza/, 'Localiza'],
  [/epson/, 'Epson'],
  [/fundacao getulio vargas/, 'FGV'],
];

const PAPEIS_ADVERSOS = /\((reu|ré|réu|requerido|requerida|reclamado|reclamada|promovido|promovida|executado|executada|demandado|demandada|recorrido|recorrida|impetrado)\)/i;

const MARCAS_EMPRESA = /\b(s\.?\/?a\.?|ltda|eireli|epp|me|banco|bank|cnpj|instituto|associacao|fundacao|condominio|companhia|cia|sociedade|estado d[aeo]|municipio|uniao|empresa|servicos|comercio|industria|holding|financeira|credito|seguradora|seguros|administradora|consorcio|linhas aereas|energia|telecom|educacao|ensino|hospital|clinica|cooperativa|juizo|advogados|participacoes|consultoria|investimentos?|capitalizacao|assistencia|previdencia|servidores)\b/;

/** Parte adversa pessoa física: o nome não pode ir para a base publicada. */
export function pareceEmpresa(nome) {
  const n = normalizar(nome);
  if (!n) return true;
  if (/\bcpf\b/.test(n)) return false;
  if (REUS_CONHECIDOS.some(([re]) => re.test(n))) return true;
  return MARCAS_EMPRESA.test(n);
}

function nomeCurto(nome) {
  const limpo = String(nome).replace(/\s*-\s*CNPJ.*$/i, '').replace(/\s*-\s*CPF.*$/i, '').trim();
  const n = normalizar(limpo);
  for (const [re, curto] of REUS_CONHECIDOS) if (re.test(n)) return curto;
  return tituloProprio(limpo.replace(/\b(S\/?A|S\.A\.?|LTDA\.?|EIRELI|ME|EPP)\b/gi, '').replace(/[\s,.-]+$/, ''));
}

/** Parte adversa principal: { nome, empresa }. Para cliente réu, é quem move a ação. */
export function parteAdversa(linha, clienteReu) {
  const bruto = parteAdversaBruta(linha, clienteReu);
  if (!bruto) return { nome: null, empresa: true };
  return { nome: nomeCurto(bruto), empresa: pareceEmpresa(bruto) };
}

function parteAdversaBruta(linha, clienteReu) {
  const outros = String(linha['Outros envolvidos'] || '');
  const titulo = String(linha['Título'] || '');
  // "Outros envolvidos" separa por vírgula, mas nomes como "FACTA FINANCEIRA
  // S.A., CRÉDITO, FINANCIAMENTO E INVESTIMENTO" também têm vírgula: o papel
  // entre parênteses é o separador confiável.
  const partes = outros.split(/(?<=\))\s*,\s*/);
  const alvo = clienteReu ? /\((autor|autora|requerente|reclamante|exequente|promovente)\)/i : PAPEIS_ADVERSOS;
  const adversa = partes.find((p) => alvo.test(p) && !/advogad/i.test(p));
  if (adversa) return adversa.replace(/\s*\([^)]*\)\s*$/, '');

  // Papéis genéricos ("PARTE", "Interessado"): a primeira empresa listada.
  const generica = partes.find((p) => /\((parte|interessad[oa]|terceiro)\)/i.test(p)
    && /banco|bank|s\.?\/?a\b|ltda|financeira|credito|seguro|instituto/i.test(p) && !/ju[ií]zo/i.test(p));
  if (generica) return generica.replace(/\s*\([^)]*\)\s*$/, '');

  const lados = titulo.split(/\s+x\s+/i);
  if (lados.length >= 2) return clienteReu ? lados[0] : lados[lados.length - 1];
  return null;
}

// ---------------------------------------------------------------- tese

export function classificarTese(linha, adversa) {
  const acao = normalizar(linha['Ação']);
  const texto = normalizar(`${linha['Título']} ${linha.Objeto} ${linha['Observações']} ${linha['Descrição do último histórico']}`);
  const tudo = `${acao} ${texto}`;
  const envolvidos = normalizar(linha['Outros envolvidos']);
  const banco = /banco|bank|financeira|credito|consig|agibank|bmg|\bpan\b|santander|bradesco|master|mercantil|itau|facta|daycoval|aymore|paribas/.test(normalizar(adversa || ''));

  if (/vara do trabalho|reclamacao trabalhista|\bhte\b/.test(tudo) || lerCnj(linha['Número'])?.j === '5') return 'trabalhista';
  if (/administracao judicial|recuperacao judicial|falencia/.test(acao)) return 'empresarial';
  if (/inventario|heranca|sucessao provisoria|familia|alimentos|divorcio|guarda|paternidade/.test(`${acao} ${normalizar(linha['Título'])}`) || /vara de familia/.test(texto)) return 'familia_sucessoes';
  if (/auxilio-doenca|auxilio doenca|aposentadoria|beneficio assistencial|seguro-defeso|adicional de 25|pessoa com deficiencia/.test(acao) || adversa === 'INSS') return 'previdenciario';
  // Tema 1.414/STJ = cartão de crédito consignado (RMC/RCC).
  if (/\brmc\b|\brcc\b|reserva de margem|cartao de credito consignado|cartao consignado|cartao de beneficio|(tema|repetitivo) (repetitivo )?(n[o.]? ?)?1\.?414\b/.test(tudo)) return 'cartao_rmc_rcc';
  if (/cartao de credito/.test(acao) && banco) return 'cartao_rmc_rcc';
  if (/seguro \(7621|titulo de capitalizacao/.test(acao)) return 'seguro_nao_contratado';
  if (/tarifa/.test(acao)) return 'tarifa_bancaria';
  if (/emprestimo consignado/.test(acao)) return 'emprestimo_consignado';
  if (banco && /\bseguradora\b|\bseguros\b/.test(envolvidos)) return 'seguro_nao_contratado';
  if (/fraude bancaria|golpe|pix/.test(acao)) return 'fraude_bancaria';
  if (banco && /credito direto ao consumidor|\bcdc\b|cedula de credito bancario|financiamento de produto/.test(acao)) return 'credito_pessoal_cdc';

  if (/bancari|contratos bancarios/.test(acao) || banco) {
    if (/tarifa|cesta de servicos|pacote de servicos|comunicacao digital/.test(texto)) return 'tarifa_bancaria';
    if (/consignado/.test(texto)) return 'emprestimo_consignado';
    if (/seguro/.test(texto)) return 'seguro_nao_contratado';
    return 'bancario_outros';
  }
  const fornecedor = /facebook|meta|amazon|gol|latam|vivo|claro|tim\b|oi\b|enel|ampla|coelba|hapvida|unimed|estacio|localiza|epson|hyundai|pagbank|nubank|picpay|mercado (livre|pago)/.test(normalizar(adversa || ''));
  if (/direito do consumidor|consumo|direito da saude|planos? de saude|energia|telefonia|transporte aereo|oferta|abusiv|indebito/.test(acao) || fornecedor) return 'consumidor_outros';
  return 'civel_outros';
}

// ---------------------------------------------------------------- resultado

const RE = {
  parcial: /\b(julgad[ao]s?|julgo|julgou|julga|julgar)( [a-z,]+){0,4} (parcialmente procedentes?|procedentes? em parte)|procedencia parcial|parcial procedencia|procedencia em parte|parcialmente procedentes? (o|os) pedidos?/,
  improcedente: /\b(julgad[ao]s?|julgo|julgou|julga|julgar)( [a-z,]+){0,4} improcedentes?\b(?! o pedido contraposto)|sentenca de improcedencia/,
  procedente: /\b(julgad[ao]s?|julgo|julgou|julga|julgar)( [a-z,]+){0,4} procedentes?\b(?! em parte)|sentenca de procedencia/,
  semMerito: /extint[oa] o processo|julgo extint|extincao do processo|sem resolucao d[eo] merito|extinto sem/,
  acordo: /homologad[oa] a transacao|homolog[oa] (o |a )?(acordo|transacao)|acordo homologado|descumprimento (do |de )?acordo/,
  liminarDeferida: /concedida a (medida )?liminar|liminar deferida|defiro (a |o pedido de )?(tutela|liminar|medida liminar)|tutela (provisoria )?(de urgencia |antecipada )?deferida|deferida a (tutela|liminar)|concedo a tutela|tutela de urgencia concedida/,
  liminarIndeferida: /indefiro (a |o pedido de )?(tutela|liminar)|(tutela|liminar)( de urgencia)? indeferida|indeferida a (tutela|liminar)|nao concedida a liminar|indefiro o pedido liminar/,
  recursoParcial: /provid[oa],? em parte|parcialmente provid[oa]|parcial provimento|provimento parcial/,
  recursoNegado: /nao provid[oa]|desprovid[oa]|improvid[oa]|nego provimento|negou provimento|negar provimento|negado provimento|negou-se provimento/,
  recursoProvido: /\bprovid[oa]\b|dou provimento|deu provimento|dar provimento|dado provimento/,
  contextoRecurso: /recurso inominado|turma recursal|recorrente|acordao|relator|decisao monocratica|embargos de declaracao/,
  arquivado: /arquivad|baixa definitiva/,
  sobrestado: /sobrestad|sobrestamento|suspenso por recurso|processo suspenso|suspensao .{0,40}(repetitivo|tema|irdr)|determino a suspensao|suspensao do (julgamento|processamento|feito)|aguarda\w* decisao final .{0,20}tema/,
  emRecurso: /remetidos os autos .{0,30}recurso|remetidos os autos .{0,20}2o grau|remessa dos autos a turma recursal|a colenda turma recursal|recebido o recurso|juntada de peticao de (recurso|contra.?razoes)|recurso inominado|contrarrazoes|contra-razoes/,
  cumprimento: /classe: cumprimento de sentenca|(pedido|requerimento|impugnacao) (de |ao )?cumprimento de sentenca(?! .{0,20}(proceda|arquiv))|cumprimento de sentenca (contra|em face)|penhora online|sisbajud|bacenjud|expedicao de alvara|\bparte exequente\b/,
  sentenciado: /intimacao da sentenca|sentenca de merito|sentenca proferida|publicad[oa] .{0,20}sentenca|embargos de declaracao (nao.acolhidos|acolhidos|rejeitados)/,
};

/** Sentença de origem citada num acórdão ("contra a sentença que julgou improcedente..."). */
function sentencaNoTexto(n) {
  if (RE.acordo.test(n)) return 'acordo';
  if (RE.parcial.test(n)) return 'parcial';
  if (RE.improcedente.test(n)) return 'improcedente';
  if (RE.procedente.test(n)) return 'procedente';
  if (RE.semMerito.test(n)) return 'sem_merito';
  return null;
}

function resultadoRecurso(n) {
  if (!RE.contextoRecurso.test(n)) return null;
  // No acórdão, o dispositivo costuma vir na ementa ("RECURSO CONHECIDO E NÃO PROVIDO").
  const trecho = n.match(/recurso(s)? (inominado )?(conhecido|conhecidos)?[^.]{0,60}(nao provid[oa]|desprovid[oa]|improvid[oa]|provid[oa],? em parte|parcialmente provid[oa]|provid[oa])/);
  const alvo = trecho ? trecho[0] : n;
  if (RE.recursoParcial.test(alvo)) return 'parcial';
  if (RE.recursoNegado.test(alvo)) return 'negado';
  if (RE.recursoProvido.test(alvo)) return 'provido';
  return null;
}

function quemRecorreu(n, linha, sentenca, clienteReu) {
  const cliente = normalizar(String(linha.Cliente || '').split(/\s+-\s+/)[0]);
  const primeirosNomes = cliente.split(' ').slice(0, 2).join(' ');
  const m = n.match(/(?:interposto por|recorrente:?) ([a-z .]{3,80}?)(?: em face| contra| advogad| recorrid|,|\.|:)/);
  if (m) {
    const quem = m[1].trim();
    if (primeirosNomes && quem.includes(primeirosNomes)) return 'cliente';
    if (/banco|bank|s\.?a\b|ltda|financeira|instituto/.test(quem)) return clienteReu ? 'cliente' : 'adversa';
  }
  if (/parte autora interpos|interposto pela parte autora|recurso da parte autora|irresignad[ao] .{0,40}parte autora/.test(n)) return clienteReu ? 'adversa' : 'cliente';
  if (/interposto pel[ao] (banco|parte re|parte promovida|reu|promovid)/.test(n)) return clienteReu ? 'cliente' : 'adversa';
  // Sem menção expressa: recorre quem perdeu.
  if (sentenca === 'improcedente') return clienteReu ? 'adversa' : 'cliente';
  if (sentenca === 'procedente') return clienteReu ? 'cliente' : 'adversa';
  return 'desconhecido';
}

/** Aplica o resultado do recurso sobre a sentença, do ponto de vista do autor. */
function aplicarRecurso(sentenca, recurso, recorrente) {
  if (!recurso || recurso === 'negado' || !sentenca) return sentenca;
  const doAutor = recorrente === 'cliente';
  if (sentenca === 'improcedente' && doAutor) return recurso === 'provido' ? 'procedente' : 'parcial';
  if (sentenca === 'parcial' && doAutor && recurso === 'provido') return 'procedente';
  if (sentenca === 'procedente' && recorrente === 'adversa') return recurso === 'provido' ? 'improcedente' : 'parcial';
  if (sentenca === 'parcial' && recorrente === 'adversa' && recurso === 'provido') return 'improcedente';
  return sentenca;
}

const INVERTER = { procedente: 'improcedente', improcedente: 'procedente' };

export function classificarResultado(linha) {
  const etiquetas = normalizar(linha.Etiquetas).split(/\s*,\s*/);
  const tem = (e) => etiquetas.includes(e);
  const historico = normalizar(linha['Descrição do último histórico']);
  const papel = normalizar(linha['Papel do cliente']);
  const clienteReu = /^(reu|re|requerido|requerida|reclamado|executado|demandado)$/.test(papel);
  // A parte contrária figura como executada: o cliente está cobrando uma condenação.
  const adversaExecutada = !clienteReu && /\((executado|executada)\)/i.test(linha['Outros envolvidos'] || '');
  const condenacao = valorMonetario(linha['Valor da condenação']);
  const acao = normalizar(linha['Ação']);
  const extrajudicial = /extrajudicial|monitoria|busca e apreensao/.test(`${acao} ${historico}`);
  const emCumprimento = RE.cumprimento.test(historico)
    || /cumprimento de sentenca|causas supervenientes a sentenca/.test(acao)
    || (adversaExecutada && !extrajudicial);

  let sentenca = null;
  let fonte = null;
  if (etiquetas.some((e) => /parcialmente procedente|procedente em parte/.test(e))) { sentenca = 'parcial'; fonte = 'etiqueta'; }
  else if (tem('improcedente')) { sentenca = 'improcedente'; fonte = 'etiqueta'; }
  else if (tem('procedente')) { sentenca = 'procedente'; fonte = 'etiqueta'; }
  else if (etiquetas.some((e) => /acordo/.test(e))) { sentenca = 'acordo'; fonte = 'etiqueta'; }

  const doTexto = sentencaNoTexto(historico);
  if (!sentenca && doTexto) { sentenca = doTexto; fonte = 'andamento'; }

  const recurso = resultadoRecurso(historico);
  const recorrente = recurso ? quemRecorreu(historico, linha, sentenca, clienteReu) : null;

  // As etiquetas descrevem o estado atual; o acórdão só altera o quadro quando
  // é mais recente do que a etiqueta, o que o painel não tem como saber — por
  // isso a reforma em recurso só se aplica a resultados vindos do andamento.
  let resultado = sentenca;
  if (fonte === 'andamento' && sentenca !== 'acordo' && sentenca !== 'sem_merito') {
    const lado = clienteReu && recorrente ? { cliente: 'adversa', adversa: 'cliente' }[recorrente] ?? recorrente : recorrente;
    resultado = aplicarRecurso(sentenca, recurso, lado);
  }

  let situacao = 'em_andamento';
  if (tem('sobrestado') || RE.sobrestado.test(historico)) situacao = 'sobrestado';
  else if (RE.arquivado.test(historico)) situacao = 'arquivado';
  else if (tem('em fase de recurso') || RE.emRecurso.test(historico) || recurso) situacao = 'em_recurso';
  else if (emCumprimento) situacao = 'cumprimento';
  else if (sentenca || recurso || RE.sentenciado.test(historico)) situacao = 'sentenciado';

  // Cliente autor executando sentença, ou condenação lançada no Astrea: houve
  // decisão a seu favor, ainda que o teor não esteja no último andamento.
  if (!resultado && !clienteReu && !/familia/.test(historico) && (emCumprimento || condenacao > 0)) {
    resultado = 'procedente';
    fonte = 'cumprimento';
  }

  if (clienteReu && INVERTER[resultado]) resultado = INVERTER[resultado];

  let liminar = null;
  if (tem('liminar deferida') || RE.liminarDeferida.test(historico)) liminar = 'deferida';
  else if (etiquetas.some((e) => /liminar indeferida/.test(e)) || RE.liminarIndeferida.test(historico)) liminar = 'indeferida';

  return {
    resultado: resultado || 'pendente',
    sentenca: sentenca || null,
    recurso: recurso || null,
    recorrente: recorrente || null,
    liminar,
    situacao,
    fonteResultado: resultado ? fonte : null,
    clienteReu,
  };
}

// ---------------------------------------------------------------- registro

function dataIso(texto) {
  const m = String(texto ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function valorMonetario(texto) {
  const limpo = String(texto ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

function responsavelCurto(texto) {
  const t = String(texto ?? '').trim();
  if (!t || /calmon\s*&\s*freitas/i.test(t)) return 'Escritório';
  return tituloProprio(t.split(/\s+/).slice(0, 2).join(' '));
}

/**
 * Converte uma linha da exportação do Astrea no registro do painel.
 * Campos pessoais (cliente, número) só existem na base local importada;
 * `anonimizar()` os remove antes de publicar.
 */
export function classificarLinha(linha, indice, origens) {
  const local = resolverLocal(linha, indice, origens);
  const res = classificarResultado(linha);
  const { nome: adversa, empresa: adversaEmpresa } = parteAdversa(linha, res.clienteReu);
  const tese = classificarTese(linha, adversa);
  const etiquetas = normalizar(linha.Etiquetas);
  const distribuicao = dataIso(linha['Data de distribuição']) || dataIso(linha['Data de Criação']);

  return {
    numero: local.cnj?.formatado || String(linha['Número'] || '').trim() || null,
    cliente: String(linha.Cliente || '').replace(/\s*-\s*CPF.*$/i, '').trim() || null,
    uf: local.uf,
    municipio: local.municipio,
    ibge: local.ibge,
    lat: local.lat,
    lon: local.lon,
    fonteLocal: local.fonteLocal,
    origem: local.cnj?.origem ?? null,
    tribunal: local.tribunal,
    unidade: local.unidade,
    adversa,
    adversaEmpresa,
    tese,
    resultado: res.resultado,
    sentenca: res.sentenca,
    recurso: res.recurso,
    recorrente: res.recorrente,
    liminar: res.liminar,
    situacao: res.situacao,
    fonteResultado: res.fonteResultado,
    distribuicao,
    ultimoAndamento: dataIso(linha['Data do último histórico']),
    valorCausa: valorMonetario(linha['Valor da causa']),
    responsavel: responsavelCurto(linha['Responsável']),
    proBono: /pro bono/.test(etiquetas),
    tipo: normalizar(linha.Tipo) === 'caso' ? 'caso' : 'processo',
  };
}

/**
 * Classifica a planilha inteira. Depois da primeira passada, processos sem
 * comarca identificada herdam o município de outros processos da mesma unidade
 * de origem (mesmo J.TR.OOOO) na própria planilha.
 */
export function classificarPlanilha(linhas, indice, origens = {}) {
  const registros = linhas
    .filter((l) => l['Número'] || l['Título'])
    .map((l) => classificarLinha(l, indice, origens));

  const aprendidas = origensAprendidas(registros);
  for (const r of registros) {
    if (!r.municipio && r.origem && aprendidas.has(r.origem) && r.unidade !== 'Núcleo de Justiça 4.0') {
      const ref = aprendidas.get(r.origem);
      Object.assign(r, { municipio: ref.municipio, ibge: ref.ibge, lat: ref.lat, lon: ref.lon, fonteLocal: 'cnj' });
    }
  }
  registros.forEach((r, i) => { r.id = i + 1; });
  return registros;
}

/**
 * Unidades de origem cuja comarca veio escrita por extenso e é a mesma em todos
 * os processos da planilha. Código ambíguo (ex.: 4.01.3300, a Seção Judiciária
 * da Bahia, que recebe processos de Salvador e de Feira de Santana) fica de fora.
 */
export function origensAprendidas(registros) {
  const vistos = new Map();
  for (const r of registros) {
    if (!r.origem || !r.municipio || r.unidade === 'Núcleo de Justiça 4.0') continue;
    if (!['foro', 'vara', 'texto'].includes(r.fonteLocal)) continue;
    const atual = vistos.get(r.origem);
    if (!atual) vistos.set(r.origem, r);
    else if (atual.ibge !== r.ibge) vistos.set(r.origem, { conflito: true });
  }
  return new Map([...vistos].filter(([, r]) => !r.conflito));
}

/**
 * Remove tudo o que identifica cliente ou processo (base publicada no site):
 * nome, número, código de origem, valor da causa e datas exatas. A parte
 * adversa só é mantida quando é empresa — pessoa física vira "Pessoa física" —
 * e a distribuição fica reduzida ao mês.
 */
export function anonimizar(registro) {
  const {
    numero, cliente, origem, valorCausa, ultimoAndamento, adversaEmpresa, distribuicao, ...resto
  } = registro;
  return {
    ...resto,
    adversa: adversaEmpresa ? resto.adversa : 'Pessoa física',
    distribuicao: distribuicao ? distribuicao.slice(0, 7) : null,
  };
}
