#!/usr/bin/env python
"""CLI para gerar a pauta de audiências semanal a partir de um calendário .ics.

Exemplos de uso:

    python scripts/gerar_pauta.py --ics data/entrada/agenda.ics \
        --inicio 2026-07-20 --fim 2026-07-24 \
        --saida pautas/pauta_20260720.xlsx

    # Direto de um feed .ics público (ex.: URL "iCal" do Google Agenda):
    python scripts/gerar_pauta.py --ics "https://calendar.google.com/calendar/ical/.../public/basic.ics"

    # Sem --ics, usa PAUTACF_ICS_URL (ou PAUTACF_ICS) do .env. Também enviar por
    # e-mail e imprimir o link do WhatsApp:
    python scripts/gerar_pauta.py --email --whatsapp
"""

import argparse
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dotenv import load_dotenv

load_dotenv()

from pautacf.config import config_email
from pautacf.excel_export import gerar_pauta_excel
from pautacf.ics_parser import extrair_audiencias, filtrar_por_periodo
from pautacf.notify import enviar_email, gerar_link_whatsapp, montar_mensagem_whatsapp


def _data(valor: str) -> date:
    return datetime.strptime(valor, "%Y-%m-%d").date()


def main() -> None:
    hoje = date.today()
    inicio_semana = hoje - timedelta(days=hoje.weekday())
    fim_semana = inicio_semana + timedelta(days=6)

    ics_padrao = os.environ.get("PAUTACF_ICS_URL") or os.environ.get("PAUTACF_ICS")

    parser = argparse.ArgumentParser(description="Gera a pauta de audiências semanal.")
    parser.add_argument(
        "--ics",
        required=ics_padrao is None,
        default=ics_padrao,
        help="Caminho do .ics local ou URL de um feed .ics público. "
        "Se omitido, usa PAUTACF_ICS_URL/PAUTACF_ICS do .env.",
    )
    parser.add_argument("--inicio", type=_data, default=inicio_semana, help="Data inicial (AAAA-MM-DD)")
    parser.add_argument("--fim", type=_data, default=fim_semana, help="Data final (AAAA-MM-DD)")
    parser.add_argument("--saida", default=None, help="Caminho do .xlsx de saída")
    parser.add_argument("--email", action="store_true", help="Enviar a pauta por e-mail (ver .env)")
    parser.add_argument("--whatsapp", action="store_true", help="Imprimir link do WhatsApp com a pauta")
    args = parser.parse_args()

    saida = Path(args.saida) if args.saida else Path("pautas") / f"pauta_{args.inicio:%Y%m%d}_{args.fim:%Y%m%d}.xlsx"

    todas = extrair_audiencias(args.ics)
    audiencias = filtrar_por_periodo(todas, args.inicio, args.fim)

    caminho = gerar_pauta_excel(audiencias, args.inicio, args.fim, saida)
    print(f"Pauta gerada: {caminho} ({len(audiencias)} audiência(s))")

    if args.email:
        assunto = f"Pauta de Audiências — {args.inicio:%d/%m} a {args.fim:%d/%m/%Y}"
        corpo = montar_mensagem_whatsapp(audiencias, args.inicio, args.fim)
        enviar_email(config_email(), assunto, corpo, anexo=caminho)
        print("E-mail enviado.")

    if args.whatsapp:
        mensagem = montar_mensagem_whatsapp(audiencias, args.inicio, args.fim)
        print("\nLink do WhatsApp:")
        print(gerar_link_whatsapp(mensagem))


if __name__ == "__main__":
    main()
