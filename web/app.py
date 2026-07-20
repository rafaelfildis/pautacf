#!/usr/bin/env python
"""Painel web simples para consultar a pauta de audiências da semana.

Rodar com:  python web/app.py
Depois abrir http://localhost:5000

Fonte do calendário (nessa ordem de prioridade):
  PAUTACF_ICS_URL  — feed .ics público (ex.: URL "iCal" do Google Agenda)
  PAUTACF_ICS      — caminho de um arquivo .ics local
"""

import os
import sys
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, render_template, request

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

load_dotenv()

from pautacf.ics_parser import extrair_audiencias, filtrar_por_periodo

app = Flask(__name__)

ORIGEM_ICS = os.environ.get("PAUTACF_ICS_URL") or os.environ.get(
    "PAUTACF_ICS", "data/entrada/agenda.ics"
)


@app.route("/")
def index():
    hoje = date.today()
    inicio_semana = hoje - timedelta(days=hoje.weekday())
    fim_semana = inicio_semana + timedelta(days=6)

    inicio = date.fromisoformat(request.args.get("inicio", inicio_semana.isoformat()))
    fim = date.fromisoformat(request.args.get("fim", fim_semana.isoformat()))

    audiencias = []
    erro = None
    eh_url = ORIGEM_ICS.startswith(("http://", "https://"))
    if eh_url or Path(ORIGEM_ICS).exists():
        try:
            todas = extrair_audiencias(ORIGEM_ICS)
            audiencias = filtrar_por_periodo(todas, inicio, fim)
        except Exception as exc:  # falha de rede/parsing ao vivo
            erro = f"Não foi possível ler o calendário ({ORIGEM_ICS}): {exc}"
    else:
        erro = (
            f"Calendário não encontrado em '{ORIGEM_ICS}'. "
            "Defina PAUTACF_ICS_URL (feed .ics público) ou PAUTACF_ICS (arquivo local) no .env."
        )

    return render_template(
        "pauta.html",
        audiencias=audiencias,
        inicio=inicio,
        fim=fim,
        erro=erro,
    )


if __name__ == "__main__":
    app.run(debug=True)
