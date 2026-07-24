/* PAUTA CF — Parser de calendário iCalendar (RFC 5545) do Astrea.
 *
 * O feed do Astrea entrega audiências e tarefas no mesmo arquivo, todas como
 * VEVENT. A distinção confiável está no UID:
 *   UID:astreaappointment<id>  -> audiência (DTSTART com hora)
 *   UID:astreatask<id>         -> tarefa/prazo (DTSTART como dia inteiro)
 */

const RE_UNFOLD = /\r?\n[ \t]/g;
const RE_BLOCK = /BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g;

/** Desfaz o "line folding" do RFC 5545 (continuação começa com espaço/tab). */
function unfold(text) {
  return text.replace(RE_UNFOLD, '');
}

/** Reverte o escape de TEXT do RFC 5545. */
function unescapeText(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** Quebra "NOME;PARAM=X:valor" em { name, params, value }. */
function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(';');

  const params = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq > -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }

  return { name: name.toUpperCase(), params, value };
}

/**
 * Converte DTSTART/DTEND para Date.
 * Datas com TZID vêm em horário de parede de São Paulo; como o escritório opera
 * nesse fuso, interpretamos como horário local para evitar deslocamento.
 */
function parseDateValue(value, params) {
  const dateOnly = params.VALUE === 'DATE' || /^\d{8}$/.test(value);

  if (dateOnly) {
    const y = +value.slice(0, 4);
    const m = +value.slice(4, 6) - 1;
    const d = +value.slice(6, 8);
    return { date: new Date(y, m, d), allDay: true };
  }

  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return { date: null, allDay: false };

  const [, y, mo, d, h, mi, s, utc] = m;
  const date = utc
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s);

  return { date, allDay: false };
}

/**
 * Procura o link da audiência no texto livre da descrição.
 *
 * O campo "Endereço ou local" do Astrea não é exportado no .ics — quando o link
 * aparece, é porque foi digitado nas observações, e cada secretaria escreve de um
 * jeito ("Link da reunião:", "Acessando este link:", "Endereço:", ou a URL solta).
 * Por isso procuramos a URL em si, sem depender de rótulo.
 */
function extrairLink(text) {
  const m = text.match(/https?:\/\/[^\s<>"']+/);
  if (!m) return '';

  // Pontuação final costuma vir colada na URL quando ela encerra a frase.
  return m[0].replace(/[.,;:)\]]+$/, '');
}

/**
 * Extrai os campos estruturados da DESCRIPTION do Astrea, cujo formato é:
 *   AUTOR x RÉU
 *   Número:  <processo>
 *   Foro: <vara>
 *
 *   Cliente: <cliente>
 *
 *   <tipo da tarefa, quando houver>
 */
function parseDescription(description) {
  const out = { partes: '', processo: '', foro: '', cliente: '', detalhe: '', link: '' };
  if (!description) return out;

  const text = description.trim();

  out.link = extrairLink(text);

  const numero = text.match(/N[úu]mero:\s*(.+)/i);
  if (numero) out.processo = numero[1].trim();

  const foro = text.match(/Foro:\s*(.+)/i);
  if (foro) out.foro = foro[1].trim();

  const cliente = text.match(/Cliente:\s*(.+)/i);
  if (cliente) out.cliente = cliente[1].trim();

  // A primeira linha traz as partes, antes do rótulo "Número:".
  out.partes = text.split(/\n\s*N[úu]mero:/i)[0].trim();

  // O tipo da tarefa aparece depois do bloco "Cliente:". O link sai daqui porque
  // já tem campo próprio e só poluiria o rótulo do compromisso.
  if (cliente) {
    const after = text.slice(text.indexOf(cliente[0]) + cliente[0].length);
    out.detalhe = after.replace(/https?:\/\/[^\s<>"']+/g, '').replace(/\s+/g, ' ').trim();
  }

  return out;
}

/** Separa "AUTOR x RÉU" no primeiro " x " isolado. */
function splitPartes(partes) {
  if (!partes) return { autora: '', re: '' };

  const m = partes.match(/^([\s\S]+?)\s+[xX]\s+([\s\S]+)$/);
  if (!m) return { autora: partes.trim(), re: '' };

  return { autora: m[1].trim(), re: m[2].trim() };
}

/**
 * Deduz a cidade a partir do foro. O texto do Astrea não é padronizado, então
 * usamos heurísticas em cascata — o valor continua editável na interface.
 */
function deduzirCidade(foro) {
  if (!foro) return '';

  const comarca = foro.match(/comarca\s+d[eoa]s?\s+([^-–,/]+)/i);
  if (comarca) return titleCase(comarca[1].trim());

  const traco = foro.match(/[-–]\s*([^-–,]+?)\s*(?:\/[A-Za-z]{2})?\s*$/);
  if (traco) return titleCase(traco[1].trim());

  return '';
}

function titleCase(text) {
  const minor = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

  // O Astrea às vezes repete o nome da cidade ("... COMARCA DE SALVADOR SALVADOR").
  const palavras = text.toLowerCase().split(/\s+/).filter(Boolean);
  const semRepeticao = palavras.filter((p, i) => p !== palavras[i - 1]);

  return semRepeticao
    .map((word, i) =>
      minor.has(word) && i > 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');
}

/* Linguagem típica de despacho judicial com prazo a cumprir. */
const RE_PRAZO = /\bprazo\b|\bdias\b|\bintime-se\b|\bemende\b|\bapenas em\b|\bsob pena\b/i;

/* Tarefas do escritório são rótulos curtos ("RÉPLICA", "REPROTOCOLAR"); prazos
   vêm com o texto do despacho. Na agenda atual a maior tarefa tem 49 caracteres
   e o menor prazo tem 60, então o limite fica confortavelmente no meio. */
const TAMANHO_MAX_TAREFA = 55;

/**
 * Separa, dentro dos compromissos de dia inteiro do Astrea, o que é tarefa do
 * escritório do que é prazo determinado pelo juízo.
 * @returns {'tarefa'|'prazo'}
 */
function classificarTarefa(texto) {
  if (!texto) return 'tarefa';
  if (RE_PRAZO.test(texto)) return 'prazo';
  return texto.length > TAMANHO_MAX_TAREFA ? 'prazo' : 'tarefa';
}

/** Rótulo curto do compromisso: o trecho antes de " - " no SUMMARY. */
function tituloCurto(summary) {
  const idx = summary.indexOf(' - ');
  const head = idx > -1 ? summary.slice(0, idx) : summary;
  return head.replace(/\s+/g, ' ').trim();
}

/**
 * Converte o texto .ics completo numa lista de compromissos normalizados.
 * @param {string} icsText
 * @returns {Array<object>}
 */
export function parseICS(icsText) {
  const text = unfold(icsText);
  const eventos = [];

  RE_BLOCK.lastIndex = 0;
  let block;

  while ((block = RE_BLOCK.exec(text)) !== null) {
    const props = {};
    const attendees = [];

    for (const rawLine of block[1].split(/\r?\n/)) {
      const line = parseLine(rawLine);
      if (!line) continue;

      if (line.name === 'ATTENDEE') {
        const cn = line.params.CN;
        if (cn) attendees.push(cn.replace(/^"|"$/g, ''));
        continue;
      }

      props[line.name] = { value: line.value, params: line.params };
    }

    const uid = props.UID?.value || '';
    const summary = unescapeText(props.SUMMARY?.value || '').replace(/\s+/g, ' ').trim();
    const description = unescapeText(props.DESCRIPTION?.value || '');

    const start = props.DTSTART
      ? parseDateValue(props.DTSTART.value, props.DTSTART.params)
      : { date: null, allDay: false };

    if (!start.date) continue;

    const end = props.DTEND
      ? parseDateValue(props.DTEND.value, props.DTEND.params)
      : { date: null, allDay: start.allDay };

    const campos = parseDescription(description);
    const partes = splitPartes(campos.partes);

    // Sem DESCRIPTION estruturada (tarefas soltas), o SUMMARY é a única fonte.
    const semEstrutura = !campos.processo && !campos.foro;

    const ehTarefa = uid.startsWith('astreatask');
    const detalhe = campos.detalhe || (semEstrutura ? summary : '');

    eventos.push({
      uid,
      tipo: ehTarefa ? 'tarefa' : 'audiencia',
      // 'audiencia' | 'tarefa' | 'prazo' — o filtro da interface usa este campo.
      subtipo: ehTarefa ? classificarTarefa(detalhe) : 'audiencia',
      inicio: start.date,
      fim: end.date,
      diaInteiro: start.allDay,
      titulo: tituloCurto(summary) || '(sem título)',
      resumo: summary,
      parteAutora: semEstrutura ? '' : partes.autora,
      parteRe: semEstrutura ? '' : partes.re,
      processo: campos.processo,
      foro: campos.foro,
      cliente: campos.cliente,
      cidade: deduzirCidade(campos.foro),
      link: campos.link,
      detalhe: campos.detalhe,
      organizador: (props.ORGANIZER?.params.CN || '').replace(/^"|"$/g, ''),
      participantes: attendees,
      atualizadoEm: props['LAST-MODIFIED']?.value || '',
    });
  }

  eventos.sort((a, b) => a.inicio - b.inicio);
  return eventos;
}
