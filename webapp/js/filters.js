/* =========================================================================
   filters.js — Busca, filtros rápidos/avançados, período e ordenação
   ========================================================================= */

const PautaFilters = (() => {
  const TRIBUNAL_POR_SEGMENTO = {
    "8.01": "TJAC", "8.02": "TJAL", "8.03": "TJAP", "8.04": "TJAM", "8.05": "TJBA",
    "8.06": "TJCE", "8.07": "TJDF", "8.08": "TJES", "8.09": "TJGO", "8.10": "TJMA",
    "8.11": "TJMT", "8.12": "TJMS", "8.13": "TJMG", "8.14": "TJPA", "8.15": "TJPB",
    "8.16": "TJPR", "8.17": "TJPE", "8.18": "TJPI", "8.19": "TJRJ", "8.20": "TJRN",
    "8.21": "TJRS", "8.22": "TJRO", "8.23": "TJRR", "8.24": "TJSC", "8.25": "TJSE",
    "8.26": "TJSP", "8.27": "TJTO",
    "5.01": "TRT1", "5.02": "TRT2", "5.03": "TRT3", "5.04": "TRT4", "5.05": "TRT5",
  };

  function tribunalDoProcesso(processo) {
    const m = String(processo || "").match(/\.(\d)\.(\d{2})\./);
    if (!m) return "Outro";
    const chave = `${m[1]}.${m[2]}`;
    return TRIBUNAL_POR_SEGMENTO[chave] || "Outro";
  }

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function startOfWeek(d) {
    const x = startOfDay(d);
    const dow = (x.getDay() + 6) % 7; // segunda = 0
    return addDays(x, -dow);
  }
  function endOfWeek(d) { return endOfDay(addDays(startOfWeek(d), 6)); }

  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }

  function periodoRapido(chave, hoje = new Date()) {
    switch (chave) {
      case "hoje":
        return [startOfDay(hoje), endOfDay(hoje)];
      case "amanha": {
        const amanha = addDays(hoje, 1);
        return [startOfDay(amanha), endOfDay(amanha)];
      }
      case "semana":
        return [startOfWeek(hoje), endOfWeek(hoje)];
      case "proxima-semana": {
        const proxima = addDays(startOfWeek(hoje), 7);
        return [proxima, endOfDay(addDays(proxima, 6))];
      }
      case "mes":
        return [startOfMonth(hoje), endOfMonth(hoje)];
      case "proximo-mes": {
        const proximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        return [proximoMes, endOfMonth(proximoMes)];
      }
      default:
        return null;
    }
  }

  function normalizarBusca(texto) {
    return String(texto ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  const CAMPOS_BUSCA = [
    "parteAutora", "parteRe", "processo", "juizoVara", "cidade", "responsavel",
    "observacoes", "status",
  ];

  function linhaCombina(row, termoBusca) {
    if (!termoBusca) return true;
    const termo = normalizarBusca(termoBusca);
    return CAMPOS_BUSCA.some((campo) => normalizarBusca(row[campo]).includes(termo));
  }

  function tipoNormalizado(tipo) {
    const t = normalizarBusca(tipo);
    if (t.startsWith("virtual") || t.startsWith("online")) return "online";
    if (t.startsWith("hibrid")) return "hibrida";
    return "presencial";
  }

  // O campo "responsavel" pode conter mais de um nome separado por vírgula
  // (ex.: agenda em que todo o escritório é convidado em toda audiência).
  function listaResponsaveis(row) {
    return String(row.responsavel || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
  }

  /**
   * state = {
   *   busca, periodoRapido, periodoCustom: {inicio, fim}, dataCalendario,
   *   responsavel: [], vara: [], cidade: [], tribunal: [], status: [], tipo: [],
   *   ordenarPor, ordenarDir
   * }
   */
  function aplicarFiltros(rows, state) {
    let resultado = rows;

    if (state.dataCalendario) {
      const alvo = startOfDay(state.dataCalendario).getTime();
      resultado = resultado.filter((r) => startOfDay(r.data).getTime() === alvo);
    } else if (state.periodoRapido === "personalizado" && state.periodoCustom?.inicio && state.periodoCustom?.fim) {
      const ini = startOfDay(state.periodoCustom.inicio).getTime();
      const fim = endOfDay(state.periodoCustom.fim).getTime();
      resultado = resultado.filter((r) => r.data.getTime() >= ini && r.data.getTime() <= fim);
    } else if (state.periodoRapido && state.periodoRapido !== "todos") {
      const intervalo = periodoRapido(state.periodoRapido);
      if (intervalo) {
        const [ini, fim] = intervalo;
        resultado = resultado.filter((r) => r.data >= ini && r.data <= fim);
      }
    }

    if (state.busca) {
      resultado = resultado.filter((r) => linhaCombina(r, state.busca));
    }

    const multi = (campo, valores) => {
      if (!valores || !valores.length) return;
      const set = new Set(valores);
      resultado = resultado.filter((r) => set.has(r[campo]));
    };
    if (state.responsavel && state.responsavel.length) {
      const set = new Set(state.responsavel);
      resultado = resultado.filter((r) => listaResponsaveis(r).some((n) => set.has(n)));
    }
    multi("juizoVara", state.vara);
    multi("cidade", state.cidade);
    multi("status", state.status);

    if (state.tribunal && state.tribunal.length) {
      const set = new Set(state.tribunal);
      resultado = resultado.filter((r) => set.has(tribunalDoProcesso(r.processo)));
    }

    if (state.tipo && state.tipo.length) {
      const set = new Set(state.tipo);
      resultado = resultado.filter((r) => set.has(tipoNormalizado(r.tipo)));
    }

    return resultado;
  }

  const COMPARADORES = {
    data: (a, b) => a.data - b.data || (a.horarioMinutos ?? 0) - (b.horarioMinutos ?? 0),
    horario: (a, b) => (a.horarioMinutos ?? 0) - (b.horarioMinutos ?? 0),
    cliente: (a, b) => normalizarBusca(a.parteAutora).localeCompare(normalizarBusca(b.parteAutora)),
    responsavel: (a, b) => normalizarBusca(a.responsavel).localeCompare(normalizarBusca(b.responsavel)),
    cidade: (a, b) => normalizarBusca(a.cidade).localeCompare(normalizarBusca(b.cidade)),
  };

  function ordenar(rows, campo = "data", direcao = "asc") {
    const cmp = COMPARADORES[campo] || COMPARADORES.data;
    const sinal = direcao === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => sinal * cmp(a, b));
  }

  function valoresUnicos(rows, campo) {
    return Array.from(new Set(rows.map((r) => r[campo]).filter(Boolean))).sort((a, b) =>
      normalizarBusca(a).localeCompare(normalizarBusca(b))
    );
  }

  function valoresUnicosResponsavel(rows) {
    const set = new Set();
    rows.forEach((r) => listaResponsaveis(r).forEach((n) => set.add(n)));
    return Array.from(set).sort((a, b) => normalizarBusca(a).localeCompare(normalizarBusca(b)));
  }

  return {
    aplicarFiltros, ordenar, valoresUnicos, valoresUnicosResponsavel, listaResponsaveis,
    tribunalDoProcesso, tipoNormalizado,
    startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays,
    periodoRapido,
  };
})();
