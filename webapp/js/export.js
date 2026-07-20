/* =========================================================================
   export.js — PDF, Excel, CSV, JPEG/PNG e impressão (respeita os filtros)
   ========================================================================= */

const PautaExport = (() => {
  const CABECALHOS = [
    ["data", "Data"], ["horario", "Horário"], ["parteAutora", "Parte Autora"],
    ["parteRe", "Parte Ré"], ["processo", "Processo"], ["juizoVara", "Juízo / Vara"],
    ["cidade", "Cidade"], ["responsavel", "Responsável"], ["tipo", "Tipo"],
    ["status", "Status"], ["observacoes", "Observações"], ["link", "Link"],
  ];

  function formatarData(d) {
    return d instanceof Date ? d.toLocaleDateString("pt-BR") : "";
  }

  function paraLinhaExportacao(row) {
    const obj = {};
    CABECALHOS.forEach(([campo, rotulo]) => {
      obj[rotulo] = campo === "data" ? formatarData(row.data) : row[campo] || "";
    });
    return obj;
  }

  function nomeArquivo(prefixo, extensao) {
    const agora = new Date();
    const ts = agora.toISOString().slice(0, 10);
    return `${prefixo}_${ts}.${extensao}`;
  }

  function baixarBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function baixarDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function exportarExcel(rows) {
    const dados = rows.map(paraLinhaExportacao);
    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = CABECALHOS.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pauta");
    XLSX.writeFile(wb, nomeArquivo("pauta_audiencias", "xlsx"));
  }

  function exportarCSV(rows) {
    const dados = rows.map(paraLinhaExportacao);
    const ws = XLSX.utils.json_to_sheet(dados);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    baixarBlob(blob, nomeArquivo("pauta_audiencias", "csv"));
  }

  async function exportarPDF(rows, meta) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    doc.setFillColor(1, 21, 47);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 55, "F");
    doc.setTextColor(226, 207, 175);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("PAUTA DE AUDIÊNCIAS", 32, 26);
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${meta.nomeEscritorio || "Calmon & Freitas Advogados"}`, 32, 41);
    doc.setTextColor(226, 207, 175);
    doc.text(`${meta.periodo || ""}   •   Total: ${rows.length} audiência(s)`, doc.internal.pageSize.getWidth() - 32, 41, { align: "right" });

    const colunas = CABECALHOS.filter(([c]) => c !== "link").map(([, rotulo]) => rotulo);
    const linhas = rows.map((r) => CABECALHOS.filter(([c]) => c !== "link").map(([campo]) => (campo === "data" ? formatarData(r.data) : r[campo] || "")));

    doc.autoTable({
      head: [colunas],
      body: linhas,
      startY: 68,
      styles: { fontSize: 7.5, cellPadding: 5, textColor: [27, 36, 48] },
      headStyles: { fillColor: [1, 21, 47], textColor: [226, 207, 175], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 247, 249] },
      margin: { left: 24, right: 24 },
    });

    doc.save(nomeArquivo("pauta_audiencias", "pdf"));
  }

  function montarPrintArea(rows, meta) {
    const area = document.getElementById("printArea");
    if (!area) return;
    const linhas = rows
      .map(
        (r) => `
      <tr>
        <td>${formatarData(r.data)}</td>
        <td>${r.horario || ""}</td>
        <td>${r.parteAutora || ""}</td>
        <td>${r.parteRe || ""}</td>
        <td>${r.processo || ""}</td>
        <td>${r.juizoVara || ""}</td>
        <td>${r.responsavel || ""}</td>
        <td>${r.status || ""}</td>
      </tr>`
      )
      .join("");

    area.innerHTML = `
      <div class="print-header">
        <img src="assets/logo.png" alt="Logo" />
        <div>
          <h1>PAUTA DE AUDIÊNCIAS — ${meta.nomeEscritorio || "Calmon & Freitas Advogados"}</h1>
          <div class="print-meta">Período: ${meta.periodo || ""} &nbsp;•&nbsp; Impresso em ${new Date().toLocaleString("pt-BR")} &nbsp;•&nbsp; ${rows.length} audiência(s)</div>
        </div>
      </div>
      <table class="print-table">
        <thead>
          <tr><th>Data</th><th>Horário</th><th>Parte Autora</th><th>Parte Ré</th><th>Processo</th><th>Juízo/Vara</th><th>Responsável</th><th>Status</th></tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>`;
  }

  function imprimir(rows, meta) {
    montarPrintArea(rows, meta);
    window.print();
  }

  async function exportarImagem(elementId, formato, meta) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.add("exporting-snapshot");
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bg-surface") || "#ffffff",
      useCORS: true,
    });
    el.classList.remove("exporting-snapshot");
    const mime = formato === "jpeg" ? "image/jpeg" : "image/png";
    const dataUrl = canvas.toDataURL(mime, 0.95);
    baixarDataUrl(dataUrl, nomeArquivo("pauta_audiencias", formato === "jpeg" ? "jpg" : "png"));
  }

  return { exportarExcel, exportarCSV, exportarPDF, imprimir, exportarImagem, montarPrintArea };
})();
