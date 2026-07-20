#!/usr/bin/env python
"""Painel web simples para consultar a pauta de audiências da semana.

Rodar com:  python web/app.py
Depois abrir http://localhost:5000

Também expõe GET /api/audiencias (JSON, CORS aberto) — é o que o painel
client-side em webapp/ usa para importar a agenda ao vivo, já que o
navegador sozinho não pode buscar o feed do Google por CORS.

Fonte do calendário (nessa ordem de prioridade):
  PAUTACF_ICS_URL  — feed .ics público (ex.: URL "iCal" do Google Agenda)
  PAUTACF_ICS      — caminho de um arquivo .ics local
"""

import os
import sys
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ_PROJETO / "src"))

load_dotenv(RAIZ_PROJETO / ".env")

from pautacf.ics_parser import extrair_audiencias, filtrar_por_periodo

app = Flask(__name__)

ORIGEM_ICS = os.environ.get("PAUTACF_ICS_URL") or os.environ.get("PAUTACF_ICS")
if ORIGEM_ICS and not ORIGEM_ICS.startswith(("http://", "https://")):
    ORIGEM_ICS = str(RAIZ_PROJETO / ORIGEM_ICS)
ORIGEM_ICS = ORIGEM_ICS or str(RAIZ_PROJETO / "data" / "entrada" / "agenda.ics")


def _audiencia_para_dict(a) -> dict:
    """Formato consumido pelo painel client-side em webapp/ (js/app.js)."""
    link = a.observacoes if a.observacoes.startswith("http") else ""
    return {
        "data": a.data.isoformat(),
        "horario": a.horario_formatado,
        "horarioMinutos": a.hora_inicio.hour * 60 + a.hora_inicio.minute,
        "parteAutora": a.parte_autora,
        "parteRe": a.parte_re,
        "processo": a.numero_processo,
        "juizoVara": a.vara,
        "responsavel": a.responsavel,
        "status": a.status,
        "observacoes": "",
        "link": link,
    }


@app.route("/api/audiencias")
def api_audiencias():
    """JSON das audiências da fonte configurada (PAUTACF_ICS_URL/PAUTACF_ICS).

    Usado pelo botão "Importar da Agenda" do painel client-side em webapp/,
    que roda em outra origem (porta 8000) e não pode buscar o feed do Google
    diretamente por causa de CORS — este endpoint faz essa busca no servidor
    (sem essa restrição) e devolve o resultado já pronto em JSON. Só leitura,
    sem autenticação/credenciais, por isso o CORS aberto é aceitável aqui.
    """
    try:
        audiencias = extrair_audiencias(ORIGEM_ICS)
    except Exception as exc:
        resp = jsonify({"erro": f"Não foi possível ler a agenda ({ORIGEM_ICS}): {exc}"})
        resp.status_code = 502
    else:
        resp = jsonify({
            "audiencias": [_audiencia_para_dict(a) for a in audiencias],
            "origem": ORIGEM_ICS,
        })
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


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
    app.run(debug=True, use_reloader=False)
