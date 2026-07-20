/* =========================================================================
   excel.js — Importação de planilha (.xlsx/.xls/.csv) via SheetJS
   Detecta automaticamente a linha de cabeçalho e mapeia colunas por nome,
   independente da ordem em que aparecem na planilha.
   ========================================================================= */

const PautaExcel = (() => {
  // Alias de cabeçalho -> campo canônico. Comparação é feita sem acentos,
  // minúscula e com espaços colapsados.
  const ALIASES = {
    data: ["data", "date", "dia"],
    horario: ["horario", "hora", "horario inicio", "hora inicio", "horario/hora"],
    parteAutora: [
      "parte autora", "nome da parte autora", "autor", "autora", "cliente",
      "reclamante", "requerente", "demandante",
    ],
    parteRe: [
      "parte re", "nome da parte re", "reu", "re", "requerido", "reclamado",
      "demandado", "parte contraria", "parte contrária",
    ],
    processo: [
      "processo", "numero do processo", "no processo", "n processo",
      "num processo", "numero processo", "nº processo", "nº do processo",
    ],
    juizoVara: ["juizo", "vara", "juizo vara", "juizo / vara", "foro", "orgao julgador"],
    cidade: ["cidade", "comarca", "municipio"],
    responsavel: ["responsavel", "advogado", "advogado responsavel", "adv responsavel"],
    tipo: ["tipo", "modalidade", "tipo de audiencia", "categoria"],
    status: ["status", "situacao"],
    observacoes: ["observacoes", "obs", "observacoes / link", "observacoes/link", "notas"],
    link: ["link", "link da audiencia", "url", "endereco", "endereço"],
  };

  const COLUNAS_OBRIGATORIAS = ["data"];

  function normalizar(texto) {
    return String(texto ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[ºª°]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function encontrarCampo(cabecalho) {
    const norm = normalizar(cabecalho);
    if (!norm) return null;
    for (const [campo, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(norm)) return campo;
    }
    // correspondência parcial (ex.: "Nº do Processo (CNJ)")
    for (const [campo, aliases] of Object.entries(ALIASES)) {
      if (aliases.some((a) => norm.includes(a))) return campo;
    }
    return null;
  }

  // Procura, dentre as primeiras linhas da planilha, a que mais se parece
  // com um cabeçalho de colunas (modelos costumam ter título/logo acima).
  function localizarLinhaCabecalho(linhas, maxVarredura = 20) {
    let melhorLinha = 0;
    let melhorPontuacao = -1;
    for (let i = 0; i < Math.min(maxVarredura, linhas.length); i++) {
      const linha = linhas[i] || [];
      const campos = new Set(linha.map(encontrarCampo).filter(Boolean));
      if (campos.size > melhorPontuacao) {
        melhorPontuacao = campos.size;
        melhorLinha = i;
      }
    }
    return { linha: melhorLinha, pontuacao: melhorPontuacao };
  }

  function excelSerialParaData(valor) {
    // Excel conta dias a partir de 1899-12-30 (com o bug do ano bissexto de 1900)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = Math.round(valor * 86400000);
    return new Date(epoch.getTime() + ms);
  }

  function parseData(valor) {
    if (valor == null || valor === "") return null;
    if (valor instanceof Date && !isNaN(valor)) return valor;
    if (typeof valor === "number") return excelSerialParaData(valor);
    const texto = String(valor).trim();
    let m = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = texto.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(texto);
    return isNaN(d) ? null : d;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function parseHorario(valor) {
    if (valor == null || valor === "") return { texto: "", minutos: null };
    if (valor instanceof Date && !isNaN(valor)) {
      const texto = `${pad2(valor.getHours())}:${pad2(valor.getMinutes())}`;
      return { texto, minutos: valor.getHours() * 60 + valor.getMinutes() };
    }
    if (typeof valor === "number") {
      // fração do dia (0-1)
      const totalMin = Math.round(valor * 24 * 60);
      const h = Math.floor(totalMin / 60) % 24;
      const min = totalMin % 60;
      return { texto: `${pad2(h)}:${pad2(min)}`, minutos: h * 60 + min };
    }
    const texto = String(valor).trim();
    const m = texto.match(/(\d{1,2})[:h](\d{2})/);
    const minutos = m ? (+m[1] % 24) * 60 + +m[2] : null;
    return { texto, minutos };
  }

  function extrairLink(...valores) {
    for (const v of valores) {
      if (!v) continue;
      const m = String(v).match(/https?:\/\/\S+/);
      if (m) return m[0].replace(/[),.;]+$/, "");
    }
    return "";
  }

  function inferirTipo(row) {
    if (row.tipo) return row.tipo;
    if (row.link) return "Virtual";
    return "Presencial";
  }

  function inferirCidade(row) {
    if (row.cidade) return row.cidade;
    const fonte = row.juizoVara || "";
    let m = fonte.match(/comarca de ([a-zà-ú çãõéê'\- ]+)/i);
    if (m) return tituloCase(m[1].split(/[-–(]/)[0].trim());
    m = fonte.match(/-\s*([A-ZÀ-Ú][A-ZÀ-Ú çãõéê'\-]{2,})$/);
    if (m) return tituloCase(m[1].trim());
    return "";
  }

  function tituloCase(texto) {
    return texto
      .toLowerCase()
      .replace(/(^|\s)([a-zà-ú])/g, (_, sep, c) => sep + c.toUpperCase());
  }

  function gerarId(row, indice) {
    return `${row.processo || "sem-processo"}-${row.data ? row.data.getTime() : "sd"}-${indice}`;
  }

  /**
   * Lê um arquivo (File ou ArrayBuffer) e retorna { rows, colunasDetectadas, avisos }
   */
  async function importarArquivo(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const nomeAba = workbook.SheetNames[0];
    const planilha = workbook.Sheets[nomeAba];
    const matriz = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: true, defval: "" });

    if (!matriz.length) throw new Error("A planilha está vazia.");

    const { linha: linhaCabecalho, pontuacao } = localizarLinhaCabecalho(matriz);
    if (pontuacao <= 0) {
      throw new Error(
        "Não foi possível identificar as colunas da planilha. Verifique se há um " +
          "cabeçalho com nomes como Data, Horário, Processo, etc."
      );
    }

    const cabecalhos = matriz[linhaCabecalho];
    const mapaColunas = cabecalhos.map(encontrarCampo);
    const colunasDetectadas = {};
    mapaColunas.forEach((campo, idx) => {
      if (campo) colunasDetectadas[campo] = cabecalhos[idx];
    });

    const linhasDados = matriz.slice(linhaCabecalho + 1);
    const rows = [];
    const avisos = [];

    linhasDados.forEach((linha, idx) => {
      if (!linha || linha.every((c) => c === "" || c == null)) return;

      const bruto = {};
      mapaColunas.forEach((campo, i) => {
        if (campo) bruto[campo] = linha[i];
      });

      const data = parseData(bruto.data);
      if (!data) return; // linha sem data válida não é uma audiência

      const { texto: horarioTexto, minutos: horarioMinutos } = parseHorario(bruto.horario);
      const link = bruto.link ? extrairLink(bruto.link) : extrairLink(bruto.observacoes);
      const observacoes = bruto.observacoes ? String(bruto.observacoes).trim() : "";

      const row = {
        data,
        horario: horarioTexto,
        horarioMinutos,
        parteAutora: (bruto.parteAutora || "").toString().trim(),
        parteRe: (bruto.parteRe || "").toString().trim(),
        processo: (bruto.processo || "").toString().trim(),
        juizoVara: (bruto.juizoVara || "").toString().trim(),
        responsavel: (bruto.responsavel || "").toString().trim(),
        status: (bruto.status || "Em andamento").toString().trim() || "Em andamento",
        observacoes,
        link,
      };
      row.cidade = inferirCidade(row);
      row.tipo = inferirTipo({ ...row, tipo: bruto.tipo });
      row.id = gerarId(row, idx);
      rows.push(row);
    });

    if (!rows.length) {
      avisos.push("Nenhuma linha com data válida foi encontrada abaixo do cabeçalho.");
    }
    if (!colunasDetectadas.processo) avisos.push('Coluna "Número do Processo" não identificada.');
    if (!colunasDetectadas.parteAutora) avisos.push('Coluna "Parte Autora" não identificada.');

    rows.sort((a, b) => a.data - b.data || (a.horarioMinutos ?? 0) - (b.horarioMinutos ?? 0));

    return { rows, colunasDetectadas, avisos, planilhaNome: nomeAba, arquivoNome: file.name };
  }

  return { importarArquivo, normalizar, ALIASES };
})();
