#!/usr/bin/env python
"""Painel web simples para consultar a pauta de audiências da semana.

Rodar com:  python web/app.py
Depois abrir http://localhost:5000
"""

import sys
from datetime import date, timedelta
from pathlib import Path

from flask import Flask, render_template, request

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from pautacf.ics_parser import extrair_audiencias, filtrar_por_periodo

app = Flask(__name__)

CAMINHO_ICS_PADRAO = Path(
    __import__("os").environ.get("PAUTACF_ICS", "data/entrada/agenda.ics")
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
    if CAMINHO_ICS_PADRAO.exists():
        todas = extrair_audiencias(CAMINHO_ICS_PADRAO)
        audiencias = filtrar_por_periodo(todas, inicio, fim)
    else:
        erro = (
            f"Calendário não encontrado em '{CAMINHO_ICS_PADRAO}'. "
            "Defina a variável de ambiente PAUTACF_ICS ou exporte a agenda para esse caminho."
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
