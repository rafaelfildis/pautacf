/* =========================================================================
   app.js — Orquestrador principal do PAUTA CF (dashboard client-side)
   ========================================================================= */

(() => {
  "use strict";

  const STATE = {
    rows: [],
    filteredSorted: [],
    busca: "",
    periodoRapido: "todos",
    periodoCustom: { inicio: null, fim: null },
    dataCalendario: null,
    calendarioMesRef: new Date(),
    responsavel: [], vara: [], cidade: [], tribunal: [], status: [], tipo: [],
    ordenarPor: "data", ordenarDir: "asc",
    meta: { arquivoNome: "" },
    origem: null, // 'excel' | 'agenda'
    ultimaAtualizacao: null,
  };

  const INTERVALO_AUTO_ATUALIZACAO_MS = 5 * 60 * 1000; // 5 minutos
  let timerAutoAtualizacao = null;

  let table = null;
  const $ = window.jQuery;

  const el = (id) => document.getElementById(id);

  /* ----------------------------- Utilidades ----------------------------- */

  function normalizarBusca(t) {
    return String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function classeStatus(status) {
    const s = normalizarBusca(status);
    if (s.includes("cancelad")) return "cancelada";
    if (s.includes("redesignad") || s.includes("remarcad")) return "redesignada";
    if (s.includes("confirmad")) return "confirmada";
    if (s.includes("realizad") || s.includes("encerrad")) return "realizada";
    if (s.includes("andamento")) return "andamento";
    return "default";
  }

  function classeTipo(tipo) {
    const t = PautaFilters.tipoNormalizado(tipo);
    return t === "online" ? "virtual" : t;
  }

  function rotuloTipo(tipo) {
    const t = PautaFilters.tipoNormalizado(tipo);
    return t === "online" ? "Virtual" : t === "hibrida" ? "Híbrida" : "Presencial";
  }

  function formatarDataBR(d) {
    return d instanceof Date ? d.toLocaleDateString("pt-BR") : "";
  }

  function toast(mensagem, tipo = "info") {
    const icones = { info: "fa-circle-info", success: "fa-circle-check", error: "fa-triangle-exclamation" };
    const cores = { info: "text-primary", success: "text-success", error: "text-danger" };
    const id = "t" + Date.now();
    const html = `
      <div class="toast align-items-center border-0 shadow" role="alert" id="${id}">
        <div class="toast-header">
          <i class="fa-solid ${icones[tipo] || icones.info} me-2 ${cores[tipo] || ""}"></i>
          <strong class="me-auto">PAUTA CF</strong>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">${mensagem}</div>
      </div>`;
    el("toastContainer").insertAdjacentHTML("beforeend", html);
    const node = el(id);
    const t = new bootstrap.Toast(node, { delay: 4000 });
    t.show();
    node.addEventListener("hidden.bs.toast", () => node.remove());
  }

  function mostrarCarregando(texto) {
    el("loadingLabel").textContent = texto || "Processando…";
    el("loadingOverlay").classList.remove("d-none");
  }
  function esconderCarregando() {
    el("loadingOverlay").classList.add("d-none");
  }

  /* ----------------------------- Tema ----------------------------- */

  function initTema() {
    const salvo = localStorage.getItem("pautacf_theme");
    if (salvo) document.documentElement.setAttribute("data-theme", salvo);
    el("btnTheme").addEventListener("click", () => {
      const atual = document.documentElement.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const novo = atual === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", novo);
      localStorage.setItem("pautacf_theme", novo);
      if (STATE.rows.length) PautaCharts.renderAll(STATE.filteredSorted);
    });
  }

  /* ----------------------------- Importação ----------------------------- */

  function initImportacao() {
    const dropzone = el("dropzone");
    const fileInput = el("fileInput");

    ["dragenter", "dragover"].forEach((ev) =>
      dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); })
    );
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file) processarArquivo(file);
    });
    dropzone.addEventListener("click", (e) => {
      if (e.target.closest("#btnSelecionarArquivo, #btnImportAgendaEmpty")) return;
      fileInput.click();
    });
    el("btnSelecionarArquivo").addEventListener("click", () => fileInput.click());
    el("btnImportHeader").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) processarArquivo(fileInput.files[0]);
      fileInput.value = "";
    });

    el("btnImportAgenda").addEventListener("click", () => processarAPI());
    el("btnImportAgendaEmpty").addEventListener("click", (e) => { e.stopPropagation(); processarAPI(); });
  }

  function aplicarNovosDados(rows, origemLabel, avisos, origemTipo) {
    STATE.rows = rows;
    STATE.meta.arquivoNome = origemLabel;
    STATE.origem = origemTipo;
    STATE.ultimaAtualizacao = new Date();
    resetarFiltros();
    popularOpcoesFiltro();
    el("emptyState").classList.add("d-none");
    el("dashboard").classList.remove("d-none");
    el("dashboard").classList.add("fade-in");
    renderizarTudo();
    renderizarIndicadorAtualizacao();

    if (origemTipo === "agenda") iniciarAutoAtualizacao();
    else pararAutoAtualizacao();

    const avisoTxt = avisos && avisos.length ? ` (${avisos.join(" ")})` : "";
    return { avisoTxt };
  }

  function renderizarIndicadorAtualizacao() {
    const box = el("syncStatus");
    if (!box) return;
    if (STATE.origem !== "agenda" || !STATE.ultimaAtualizacao) {
      box.classList.add("d-none");
      return;
    }
    box.classList.remove("d-none");
    const hora = STATE.ultimaAtualizacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    el("syncStatusLabel").textContent = `Sincronizado às ${hora}`;
  }

  async function processarArquivo(file) {
    mostrarCarregando("Lendo e processando a planilha…");
    try {
      await new Promise((r) => setTimeout(r, 120)); // deixa o spinner aparecer
      const resultado = await PautaExcel.importarArquivo(file);
      if (!resultado.rows.length) throw new Error("Nenhuma audiência válida foi encontrada na planilha.");
      const { avisoTxt } = aplicarNovosDados(resultado.rows, `Planilha "${file.name}"`, resultado.avisos, "excel");
      toast(`Planilha "${file.name}" importada: ${resultado.rows.length} audiência(s).${avisoTxt}`, "success");
    } catch (err) {
      console.error(err);
      toast(err.message || "Falha ao importar a planilha.", "error");
    } finally {
      esconderCarregando();
    }
  }

  const API_AUDIENCIAS_URL = "http://localhost:5000/api/audiencias";

  /**
   * @param {{silencioso?: boolean, comToastSucesso?: boolean}} opts
   *   silencioso: não mostra overlay de carregamento nem toast de erro (usado
   *   na tentativa automática ao abrir e nas atualizações periódicas).
   */
  async function processarAPI(opts = {}) {
    const { silencioso = false, comToastSucesso = true } = opts;
    if (!silencioso) mostrarCarregando("Buscando a agenda no servidor local…");
    try {
      const resultado = await PautaExcel.importarDeAPI(API_AUDIENCIAS_URL);
      if (!resultado.rows.length) throw new Error("Nenhuma audiência retornada pela agenda.");
      const { avisoTxt } = aplicarNovosDados(resultado.rows, "Agenda (Google Calendar)", resultado.avisos, "agenda");
      if (comToastSucesso) {
        toast(`Agenda sincronizada: ${resultado.rows.length} audiência(s).${avisoTxt}`, "success");
      }
      return true;
    } catch (err) {
      console.warn("[PAUTA CF] Falha ao importar da agenda:", err.message);
      if (!silencioso) toast(err.message || "Falha ao importar da agenda.", "error");
      return false;
    } finally {
      if (!silencioso) esconderCarregando();
    }
  }

  function iniciarAutoAtualizacao() {
    pararAutoAtualizacao();
    timerAutoAtualizacao = setInterval(() => {
      processarAPI({ silencioso: true, comToastSucesso: false });
    }, INTERVALO_AUTO_ATUALIZACAO_MS);
  }

  function pararAutoAtualizacao() {
    if (timerAutoAtualizacao) {
      clearInterval(timerAutoAtualizacao);
      timerAutoAtualizacao = null;
    }
  }

  function resetarFiltros() {
    STATE.busca = ""; el("searchInput").value = "";
    STATE.periodoRapido = "todos";
    STATE.periodoCustom = { inicio: null, fim: null };
    STATE.dataCalendario = null;
    STATE.responsavel = []; STATE.vara = []; STATE.cidade = []; STATE.tribunal = []; STATE.status = []; STATE.tipo = [];
    STATE.ordenarPor = "data"; STATE.ordenarDir = "asc";
    document.querySelectorAll(".quick-filter-btn[data-periodo]").forEach((b) => b.classList.toggle("active", b.dataset.periodo === "todos"));
    ["filtroResponsavel", "filtroVara", "filtroCidade", "filtroTribunal", "filtroStatus"].forEach((id) => {
      Array.from(el(id).options).forEach((o) => (o.selected = false));
    });
    ["modOnline", "modPresencial", "modHibrida"].forEach((id) => (el(id).checked = false));
  }

  /* ----------------------------- Filtros: UI ----------------------------- */

  function initFiltrosUI() {
    let buscaTimeout;
    el("searchInput").addEventListener("input", (e) => {
      clearTimeout(buscaTimeout);
      buscaTimeout = setTimeout(() => {
        STATE.busca = e.target.value;
        renderizarTudo();
      }, 180);
    });

    document.querySelectorAll(".quick-filter-btn[data-periodo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".quick-filter-btn[data-periodo]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        STATE.periodoRapido = btn.dataset.periodo;
        STATE.dataCalendario = null;
        renderizarTudo();
      });
    });

    el("btnAplicarPeriodo").addEventListener("click", () => {
      const ini = el("periodoInicio").value;
      const fim = el("periodoFim").value;
      if (!ini || !fim) { toast("Selecione as duas datas do período.", "error"); return; }
      STATE.periodoRapido = "personalizado";
      STATE.periodoCustom = { inicio: new Date(ini + "T00:00:00"), fim: new Date(fim + "T00:00:00") };
      STATE.dataCalendario = null;
      document.querySelectorAll(".quick-filter-btn[data-periodo]").forEach((b) => b.classList.remove("active"));
      renderizarTudo();
    });

    el("btnLimparFiltros").addEventListener("click", () => {
      resetarFiltros();
      renderizarTudo();
      toast("Filtros limpos.", "info");
    });

    ["filtroResponsavel", "filtroVara", "filtroCidade", "filtroTribunal", "filtroStatus"].forEach((id) => {
      el(id).addEventListener("change", (e) => {
        const campo = id.replace("filtro", "").toLowerCase().replace("cidade", "cidade");
        const mapaCampo = { filtroresponsavel: "responsavel", filtrovara: "vara", filtrocidade: "cidade", filtrotribunal: "tribunal", filtrostatus: "status" };
        const chave = mapaCampo[id.toLowerCase()];
        STATE[chave] = Array.from(e.target.selectedOptions).map((o) => o.value);
        renderizarTudo();
      });
    });

    ["modOnline", "modPresencial", "modHibrida"].forEach((id) => {
      el(id).addEventListener("change", () => {
        const map = { modOnline: "online", modPresencial: "presencial", modHibrida: "hibrida" };
        STATE.tipo = ["modOnline", "modPresencial", "modHibrida"].filter((i) => el(i).checked).map((i) => map[i]);
        renderizarTudo();
      });
    });

    el("ordenarPor").addEventListener("change", (e) => {
      const [campo, dir] = e.target.value.split("-");
      STATE.ordenarPor = campo; STATE.ordenarDir = dir;
      renderizarTudo();
    });
  }

  function popularOpcoesFiltro() {
    const preencherComLista = (id, valores) => {
      const select = el(id);
      const anteriores = new Set(Array.from(select.selectedOptions).map((o) => o.value));
      select.innerHTML = "";
      valores.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v; opt.textContent = v; opt.selected = anteriores.has(v);
        select.appendChild(opt);
      });
    };
    const preencher = (id, campo) => preencherComLista(id, PautaFilters.valoresUnicos(STATE.rows, campo));

    preencherComLista("filtroResponsavel", PautaFilters.valoresUnicosResponsavel(STATE.rows));
    preencher("filtroVara", "juizoVara");
    preencher("filtroCidade", "cidade");
    preencher("filtroStatus", "status");

    const selectTribunal = el("filtroTribunal");
    selectTribunal.innerHTML = "";
    Array.from(new Set(STATE.rows.map((r) => PautaFilters.tribunalDoProcesso(r.processo)))).sort().forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      selectTribunal.appendChild(opt);
    });
  }

  function construirFilterState(ignorarData = false) {
    return {
      busca: STATE.busca,
      periodoRapido: ignorarData ? "todos" : STATE.periodoRapido,
      periodoCustom: STATE.periodoCustom,
      dataCalendario: ignorarData ? null : STATE.dataCalendario,
      responsavel: STATE.responsavel, vara: STATE.vara, cidade: STATE.cidade,
      tribunal: STATE.tribunal, status: STATE.status, tipo: STATE.tipo,
    };
  }

  /* ----------------------------- Tabela (DataTables) ----------------------------- */

  function badgeStatus(status) {
    return `<span class="badge-status ${classeStatus(status)}">${status || "—"}</span>`;
  }
  function badgeTipo(tipo) {
    return `<span class="badge-tipo ${classeTipo(tipo)}">${rotuloTipo(tipo)}</span>`;
  }
  function celulaLink(link) {
    if (!link) return "";
    return `<a href="${link}" target="_blank" rel="noopener" class="link-pill" onclick="event.stopPropagation()"><i class="fa-solid fa-video"></i> Entrar</a>`;
  }
  function truncar(txt, n = 60) {
    if (!txt) return "";
    return txt.length > n ? `${txt.slice(0, n)}…` : txt;
  }

  const COLUNAS_TABELA = [
    { data: "data", title: "Data", width: "95px", render: (d) => formatarDataBR(d) },
    { data: "horario", title: "Horário", width: "90px" },
    { data: "parteAutora", title: "Parte Autora" },
    { data: "parteRe", title: "Parte Ré" },
    { data: "processo", title: "Processo", width: "150px" },
    { data: "juizoVara", title: "Juízo / Vara" },
    { data: "cidade", title: "Cidade", width: "120px" },
    { data: "responsavel", title: "Responsável", width: "120px" },
    { data: "tipo", title: "Tipo", width: "95px", render: (t) => badgeTipo(t) },
    { data: "status", title: "Status", width: "115px", render: (s) => badgeStatus(s) },
    { data: "observacoes", title: "Observações", render: (o) => truncar(o) },
    { data: "link", title: "Link", width: "90px", orderable: false, render: (l) => celulaLink(l) },
  ];

  function initTabela() {
    table = $("#pautaTable").DataTable({
      columns: COLUNAS_TABELA,
      data: [],
      scrollY: "56vh",
      scrollX: true,
      scrollCollapse: true,
      deferRender: true,
      pageLength: 25,
      lengthMenu: [10, 25, 50, 100],
      order: [],
      language: {
        search: "", searchPlaceholder: "Filtrar linhas…",
        lengthMenu: "Mostrar _MENU_ audiências",
        info: "_START_–_END_ de _TOTAL_", infoEmpty: "Nenhuma audiência", infoFiltered: "",
        paginate: { first: "«", last: "»", next: "›", previous: "‹" },
        emptyTable: "Nenhuma audiência encontrada para os filtros aplicados.",
        zeroRecords: "Nenhuma audiência encontrada para os filtros aplicados.",
      },
      dom: '<"top"f>rt<"bottom"lip>',
      initComplete: function () {
        $("#pautaTable_filter").hide(); // busca própria já cobre isso
        // Usa a API do próprio callback: nesse momento a variável de módulo
        // `table` ainda não foi atribuída (a atribuição só ocorre quando
        // .DataTable(...) retorna, e initComplete roda antes disso).
        popularMenuColunas(this.api());
        adicionarAlcasRedimensionamento();
      },
    });

    $("#pautaTable tbody").on("click", "tr", function () {
      const rowData = table.row(this).data();
      if (rowData) abrirDetalhe(rowData);
    });
  }

  function popularMenuColunas(dt) {
    const menu = el("colMenu");
    menu.innerHTML = "";
    dt.columns().every(function (idx) {
      const titulo = COLUNAS_TABELA[idx].title;
      const div = document.createElement("div");
      div.className = "form-check";
      div.innerHTML = `<input class="form-check-input" type="checkbox" checked id="col_${idx}"><label class="form-check-label" for="col_${idx}">${titulo}</label>`;
      menu.appendChild(div);
      div.querySelector("input").addEventListener("change", (e) => {
        dt.column(idx).visible(e.target.checked);
      });
    });
  }

  function adicionarAlcasRedimensionamento() {
    const ths = document.querySelectorAll("#pautaTable_wrapper .dataTables_scrollHead thead th");
    ths.forEach((th) => {
      if (th.querySelector(".col-resize-handle")) return;
      th.style.position = "relative";
      const handle = document.createElement("span");
      handle.className = "col-resize-handle";
      th.appendChild(handle);
      let startX, startWidth;
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        startX = e.pageX; startWidth = th.offsetWidth;
        document.body.style.cursor = "col-resize";
        function onMove(ev) {
          const novaLargura = Math.max(50, startWidth + (ev.pageX - startX));
          th.style.width = novaLargura + "px";
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.style.cursor = "";
          table.columns.adjust();
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
  }

  /* ----------------------------- Detalhe (offcanvas) ----------------------------- */

  function abrirDetalhe(row) {
    const campos = [
      ["Data", formatarDataBR(row.data)], ["Horário", row.horario],
      ["Parte Autora", row.parteAutora], ["Parte Ré", row.parteRe],
      ["Número do Processo", row.processo], ["Juízo / Vara", row.juizoVara],
      ["Cidade", row.cidade], ["Responsável", row.responsavel || "Não atribuído"],
      ["Tipo", rotuloTipo(row.tipo)], ["Status", row.status],
    ];
    const camposHtml = campos.map(([l, v]) => `
      <div class="detail-field"><div class="label">${l}</div><div class="value">${v || "—"}</div></div>`).join("");

    el("detailBody").innerHTML = `
      ${camposHtml}
      <div class="detail-field">
        <div class="label">Observações</div>
        <div class="value" id="obsView">${row.observacoes || "—"}</div>
        <textarea class="form-control mt-2 d-none" id="obsEdit" rows="3">${row.observacoes || ""}</textarea>
      </div>
      ${row.link ? `<div class="mt-3"><a href="${row.link}" target="_blank" rel="noopener" class="btn btn-gold w-100"><i class="fa-solid fa-video me-2"></i>Entrar na Audiência</a></div>` : ""}
      <div class="detail-actions">
        <button class="btn btn-gold-outline btn-sm" id="btnCopyProcesso"><i class="fa-regular fa-copy me-1"></i>Copiar Processo</button>
        <button class="btn btn-gold-outline btn-sm" id="btnCopyLink" ${row.link ? "" : "disabled"}><i class="fa-regular fa-copy me-1"></i>Copiar Link</button>
        <button class="btn btn-gold-outline btn-sm" id="btnOpenProcesso"><i class="fa-solid fa-magnifying-glass me-1"></i>Consultar Processo</button>
        <button class="btn btn-gold-outline btn-sm" id="btnOpenLink" ${row.link ? "" : "disabled"}><i class="fa-solid fa-arrow-up-right-from-square me-1"></i>Abrir Link</button>
        <button class="btn btn-navy btn-sm" id="btnEditObs" style="grid-column:1/-1;"><i class="fa-solid fa-pen me-1"></i>Editar Observações</button>
      </div>
    `;

    el("btnCopyProcesso").addEventListener("click", () => copiar(row.processo, "Número do processo copiado."));
    el("btnCopyLink").addEventListener("click", () => copiar(row.link, "Link copiado."));
    el("btnOpenProcesso").addEventListener("click", () => {
      window.open(`https://www.google.com/search?q=%22${encodeURIComponent(row.processo)}%22`, "_blank", "noopener");
    });
    el("btnOpenLink").addEventListener("click", () => row.link && window.open(row.link, "_blank", "noopener"));
    el("btnEditObs").addEventListener("click", () => {
      const view = el("obsView"), edit = el("obsEdit");
      if (edit.classList.contains("d-none")) {
        view.classList.add("d-none"); edit.classList.remove("d-none"); edit.focus();
        el("btnEditObs").innerHTML = '<i class="fa-solid fa-check me-1"></i>Salvar Observações';
      } else {
        row.observacoes = edit.value.trim();
        view.textContent = row.observacoes || "—";
        view.classList.remove("d-none"); edit.classList.add("d-none");
        el("btnEditObs").innerHTML = '<i class="fa-solid fa-pen me-1"></i>Editar Observações';
        renderizarTabela();
        toast("Observações atualizadas.", "success");
      }
    });

    new bootstrap.Offcanvas(el("detailPanel")).show();
  }

  function copiar(texto, msgOk) {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => toast(msgOk, "success")).catch(() => toast("Não foi possível copiar.", "error"));
  }

  /* ----------------------------- Calendário ----------------------------- */

  function renderizarCalendario() {
    const ref = STATE.calendarioMesRef;
    el("calMonthLabel").textContent = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const semData = PautaFilters.aplicarFiltros(STATE.rows, construirFilterState(true));
    const contagemPorDia = new Map();
    semData.forEach((r) => {
      const chave = PautaFilters.startOfDay(r.data).getTime();
      contagemPorDia.set(chave, (contagemPorDia.get(chave) || 0) + 1);
    });

    const primeiroDia = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const offset = (primeiroDia.getDay() + 6) % 7; // segunda = 0
    const diasNoMes = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    const hoje = PautaFilters.startOfDay(new Date()).getTime();
    const selecionado = STATE.dataCalendario ? PautaFilters.startOfDay(STATE.dataCalendario).getTime() : null;

    let html = ["S", "T", "Q", "Q", "S", "S", "D"].map((d) => `<div class="dow">${d}</div>`).join("");
    for (let i = 0; i < offset; i++) html += `<div class="calendar-day empty"></div>`;
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const data = new Date(ref.getFullYear(), ref.getMonth(), dia);
      const chave = data.getTime();
      const qtd = contagemPorDia.get(chave) || 0;
      const classes = ["calendar-day"];
      if (qtd > 0) classes.push("has-events");
      if (chave === hoje) classes.push("today");
      if (chave === selecionado) classes.push("selected");
      html += `<div class="${classes.join(" ")}" data-ts="${chave}" title="${qtd} audiência(s)">${dia}</div>`;
    }
    el("calendarGrid").innerHTML = html;

    el("calendarGrid").querySelectorAll(".calendar-day:not(.empty)").forEach((elDia) => {
      elDia.addEventListener("click", () => {
        const ts = Number(elDia.dataset.ts);
        STATE.dataCalendario = STATE.dataCalendario && PautaFilters.startOfDay(STATE.dataCalendario).getTime() === ts ? null : new Date(ts);
        document.querySelectorAll(".quick-filter-btn[data-periodo]").forEach((b) => b.classList.remove("active"));
        renderizarTudo();
      });
    });
  }

  function initCalendarioNav() {
    el("calPrev").addEventListener("click", () => {
      STATE.calendarioMesRef = new Date(STATE.calendarioMesRef.getFullYear(), STATE.calendarioMesRef.getMonth() - 1, 1);
      renderizarCalendario();
    });
    el("calNext").addEventListener("click", () => {
      STATE.calendarioMesRef = new Date(STATE.calendarioMesRef.getFullYear(), STATE.calendarioMesRef.getMonth() + 1, 1);
      renderizarCalendario();
    });
    el("btnLimparDataCalendario").addEventListener("click", () => {
      STATE.dataCalendario = null;
      renderizarTudo();
    });
  }

  /* ----------------------------- Cards / indicadores ----------------------------- */

  function renderizarResumo() {
    const todas = STATE.rows;
    const hoje = PautaFilters.startOfDay(new Date());
    const fimHoje = PautaFilters.endOfDay(new Date());
    const [semIni, semFim] = [PautaFilters.startOfWeek(new Date()), PautaFilters.endOfWeek(new Date())];
    const [mesIni, mesFim] = [PautaFilters.startOfMonth(new Date()), PautaFilters.endOfMonth(new Date())];

    const contarNoIntervalo = (ini, fim) => todas.filter((r) => r.data >= ini && r.data <= fim).length;

    el("statTotal").textContent = todas.length;
    el("statHoje").textContent = contarNoIntervalo(hoje, fimHoje);
    el("statSemana").textContent = contarNoIntervalo(semIni, semFim);
    el("statMes").textContent = contarNoIntervalo(mesIni, mesFim);

    const agora = new Date();
    const proxima = todas
      .filter((r) => r.data > agora || (PautaFilters.startOfDay(r.data).getTime() === hoje.getTime()))
      .sort((a, b) => a.data - b.data || (a.horarioMinutos ?? 0) - (b.horarioMinutos ?? 0))
      .find((r) => {
        const dt = new Date(r.data);
        if (r.horarioMinutos != null) dt.setHours(0, r.horarioMinutos, 0, 0);
        return dt >= agora || PautaFilters.startOfDay(r.data).getTime() > hoje.getTime();
      });
    el("statProxima").textContent = proxima ? `${formatarDataBR(proxima.data)} ${proxima.horario || ""}` : "—";

    // Indicadores
    const online = todas.filter((r) => PautaFilters.tipoNormalizado(r.tipo) === "online").length;
    const presencial = todas.filter((r) => PautaFilters.tipoNormalizado(r.tipo) === "presencial").length;
    const encerradas = todas.filter((r) => classeStatus(r.status) === "realizada").length;
    const emAndamento = todas.filter((r) => classeStatus(r.status) === "andamento").length;
    const semanaCount = contarNoIntervalo(semIni, semFim);
    const mesCount = contarNoIntervalo(mesIni, mesFim);

    const indicadores = [
      ["fa-list-check", todas.length, "Total de audiências"],
      ["fa-video", online, "Audiências online"],
      ["fa-building", presencial, "Audiências presenciais"],
      ["fa-circle-check", encerradas, "Encerradas"],
      ["fa-spinner", emAndamento, "Em andamento"],
      ["fa-calendar-week", semanaCount, "Nesta semana"],
      ["fa-calendar", mesCount, "Neste mês"],
      ["fa-hourglass-half", proxima ? formatarDataBR(proxima.data) : "—", "Próxima audiência"],
    ];
    el("indicatorsGrid").innerHTML = indicadores.map(([icone, num, lbl]) => `
      <div class="surface indicator-pill"><i class="fa-solid ${icone}"></i><div><div class="num">${num}</div><div class="lbl">${lbl}</div></div></div>
    `).join("");
  }

  function renderizarMeta() {
    if (!STATE.rows.length) return;
    const datas = STATE.rows.map((r) => r.data).sort((a, b) => a - b);
    const ini = formatarDataBR(datas[0]);
    const fim = formatarDataBR(datas[datas.length - 1]);
    el("metaPeriodo").textContent = ini === fim ? ini : `${ini} — ${fim}`;
    el("metaTotal").textContent = `${STATE.filteredSorted.length} de ${STATE.rows.length} audiências`;
    el("tabelaContagem").textContent = `${STATE.filteredSorted.length} audiência(s)`;
  }

  /* ----------------------------- Render geral ----------------------------- */

  function renderizarTabela() {
    table.clear();
    table.rows.add(STATE.filteredSorted);
    table.draw();
  }

  function renderizarTudo() {
    const filtradas = PautaFilters.aplicarFiltros(STATE.rows, construirFilterState());
    STATE.filteredSorted = PautaFilters.ordenar(filtradas, STATE.ordenarPor, STATE.ordenarDir);

    renderizarTabela();
    renderizarResumo();
    renderizarMeta();
    renderizarCalendario();
    PautaCharts.renderAll(STATE.filteredSorted);
  }

  /* ----------------------------- Exportação / impressão ----------------------------- */

  function metaExport() {
    const datas = STATE.rows.map((r) => r.data).sort((a, b) => a - b);
    const periodo = datas.length ? `${formatarDataBR(datas[0])} a ${formatarDataBR(datas[datas.length - 1])}` : "";
    return { nomeEscritorio: "Calmon & Freitas Advogados", periodo };
  }

  function initExportacao() {
    document.querySelectorAll("[data-export]").forEach((link) => {
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!STATE.filteredSorted.length) { toast("Não há audiências para exportar com os filtros atuais.", "error"); return; }
        const tipo = link.dataset.export;
        try {
          mostrarCarregando("Gerando exportação…");
          await new Promise((r) => setTimeout(r, 60));
          if (tipo === "pdf") await PautaExport.exportarPDF(STATE.filteredSorted, metaExport());
          else if (tipo === "excel") PautaExport.exportarExcel(STATE.filteredSorted);
          else if (tipo === "csv") PautaExport.exportarCSV(STATE.filteredSorted);
          else if (tipo === "jpeg" || tipo === "png") await PautaExport.exportarImagem("tableSnapshotArea", tipo, metaExport());
          toast("Exportação concluída.", "success");
        } catch (err) {
          console.error(err);
          toast("Falha ao exportar.", "error");
        } finally {
          esconderCarregando();
        }
      });
    });

    el("btnSnapshotImg").addEventListener("click", () => document.querySelector('[data-export="png"]').click());
    el("btnPrint").addEventListener("click", () => {
      if (!STATE.rows.length) { toast("Importe uma planilha antes de imprimir.", "error"); return; }
      PautaExport.imprimir(STATE.filteredSorted, metaExport());
    });
  }

  /* ----------------------------- Atalhos de teclado ----------------------------- */

  function initAtalhos() {
    document.addEventListener("keydown", (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "f") {
        if (STATE.rows.length) { e.preventDefault(); el("searchInput").focus(); }
      } else if (ctrl && e.key.toLowerCase() === "p") {
        if (STATE.rows.length) { e.preventDefault(); el("btnPrint").click(); }
      } else if (ctrl && e.key.toLowerCase() === "s") {
        if (STATE.rows.length) { e.preventDefault(); document.querySelector('[data-export="pdf"]').click(); }
      }
    });
  }

  /* ----------------------------- Init ----------------------------- */

  function initSync() {
    const btn = el("btnSyncAgora");
    if (btn) btn.addEventListener("click", () => processarAPI());
    window.addEventListener("beforeunload", pararAutoAtualizacao);
  }

  function init() {
    initTema();
    initImportacao();
    initFiltrosUI();
    initTabela();
    initCalendarioNav();
    initExportacao();
    initAtalhos();
    initSync();
    renderizarCalendario();
    // Tenta buscar a agenda automaticamente ao abrir; se o backend local não
    // estiver rodando, falha em silêncio e mostra a tela de importação manual.
    processarAPI({ silencioso: true, comToastSucesso: true });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
