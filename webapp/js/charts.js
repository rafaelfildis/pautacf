/* =========================================================================
   charts.js — Estatísticas com Chart.js (paleta navy/dourado)
   ========================================================================= */

const PautaCharts = (() => {
  const PALETA = [
    "#e2cfaf", "#01152f", "#c9a769", "#5b7fa6", "#8a6d3b",
    "#9aa3b2", "#3d5a80", "#f0e4d0", "#0a2c52", "#b08d57",
  ];

  const instancias = {};

  function corTexto() {
    return getComputedStyle(document.documentElement).getPropertyValue("--text-secondary").trim() || "#667085";
  }
  function corGrid() {
    return getComputedStyle(document.documentElement).getPropertyValue("--border-color").trim() || "#e2e5ea";
  }

  function contarPor(rows, chave) {
    const mapa = new Map();
    rows.forEach((r) => {
      const v = (r[chave] || "Não informado").toString();
      mapa.set(v, (mapa.get(v) || 0) + 1);
    });
    return mapa;
  }

  function destruir(id) {
    if (instancias[id]) {
      instancias[id].destroy();
      delete instancias[id];
    }
  }

  function baseOptions(extra = {}) {
    return Object.assign(
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: corTexto(), font: { family: "Inter" } } },
          tooltip: { backgroundColor: "#01152f", titleColor: "#e2cfaf", bodyColor: "#fff" },
        },
        scales: {
          x: { ticks: { color: corTexto() }, grid: { color: corGrid() } },
          y: { ticks: { color: corTexto() }, grid: { color: corGrid() }, beginAtZero: true },
        },
      },
      extra
    );
  }

  function porDia(canvasId, rows) {
    destruir(canvasId);
    const mapa = new Map();
    rows.forEach((r) => {
      const chave = r.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      mapa.set(chave, (mapa.get(chave) || 0) + 1);
    });
    const entradas = Array.from(mapa.entries()).sort((a, b) => {
      const [da, ma] = a[0].split("/").map(Number);
      const [db, mb] = b[0].split("/").map(Number);
      return ma - mb || da - db;
    });
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instancias[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: entradas.map((e) => e[0]),
        datasets: [{ label: "Audiências", data: entradas.map((e) => e[1]), backgroundColor: "#e2cfaf", borderRadius: 6, maxBarThickness: 36 }],
      },
      options: baseOptions({ plugins: { legend: { display: false }, tooltip: baseOptions().plugins.tooltip } }),
    });
  }

  function porCampoBarraHorizontal(canvasId, rows, campo, cor = "#01152f") {
    destruir(canvasId);
    const mapa = contarPor(rows, campo);
    const entradas = Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instancias[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: entradas.map((e) => e[0]),
        datasets: [{ label: "Audiências", data: entradas.map((e) => e[1]), backgroundColor: cor, borderRadius: 6 }],
      },
      options: baseOptions({
        indexAxis: "y",
        plugins: { legend: { display: false } },
      }),
    });
  }

  function porCampoPizza(canvasId, rows, campo) {
    destruir(canvasId);
    const mapa = contarPor(rows, campo);
    const entradas = Array.from(mapa.entries());
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instancias[canvasId] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: entradas.map((e) => e[0]),
        datasets: [{ data: entradas.map((e) => e[1]), backgroundColor: PALETA, borderColor: getComputedStyle(document.documentElement).getPropertyValue("--bg-surface") || "#fff", borderWidth: 2 }],
      },
      options: baseOptions({
        scales: undefined,
        plugins: { legend: { position: "bottom", labels: { color: corTexto(), boxWidth: 12, font: { size: 11 } } } },
      }),
    });
  }

  function renderAll(rows) {
    porDia("chartPorDia", rows);
    porCampoBarraHorizontal("chartPorResponsavel", rows, "responsavel", "#e2cfaf");
    porCampoBarraHorizontal("chartPorComarca", rows, "cidade", "#01152f");
    porCampoPizza("chartPorTipo", rows, "tipo");
    porCampoPizza("chartPorStatus", rows, "status");
  }

  function destruirTodos() {
    Object.keys(instancias).forEach(destruir);
  }

  return { renderAll, destruirTodos };
})();
