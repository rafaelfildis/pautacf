"""Distribuição da pauta semanal: e-mail (SMTP) e link do WhatsApp."""

import smtplib
from datetime import date
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote

from .config import ConfigEmail
from .models import Audiencia


def montar_mensagem_whatsapp(
    audiencias: list[Audiencia], data_inicio: date, data_fim: date
) -> str:
    """Monta o texto da pauta para compartilhar no WhatsApp."""
    linhas = [
        f"*PAUTA DE AUDIÊNCIAS — {data_inicio:%d/%m} a {data_fim:%d/%m/%Y}*",
        f"Total: {len(audiencias)} audiência(s)",
        "",
    ]
    dia_atual = None
    for aud in audiencias:
        if aud.data != dia_atual:
            dia_atual = aud.data
            linhas.append(f"\n📅 *{aud.data_formatada}*")
        linhas.append(
            f"⏰ {aud.horario_formatado} — {aud.parte_autora} x {aud.parte_re}"
            f" ({aud.numero_processo}) — {aud.responsavel or 'a definir'}"
        )
    return "\n".join(linhas)


def gerar_link_whatsapp(mensagem: str, telefone: str | None = None) -> str:
    """Gera um link wa.me com a mensagem pré-preenchida (sem precisar de API/credenciais).

    Se `telefone` for informado (formato internacional, ex: 5571999999999),
    o link abre a conversa diretamente com esse contato.
    """
    base = f"https://wa.me/{telefone}" if telefone else "https://wa.me"
    return f"{base}?text={quote(mensagem)}"


def enviar_email(
    config: ConfigEmail,
    assunto: str,
    corpo: str,
    anexo: Path | None = None,
) -> None:
    """Envia a pauta por e-mail via SMTP. Requer configuração em .env (ver README)."""
    if not config.servidor or not config.usuario or not config.destinatarios:
        raise RuntimeError(
            "Configuração de e-mail incompleta. Preencha SMTP_SERVIDOR, "
            "SMTP_USUARIO, SMTP_SENHA e PAUTACF_DESTINATARIOS no arquivo .env."
        )

    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = config.remetente or config.usuario
    msg["To"] = ", ".join(config.destinatarios)
    msg.set_content(corpo)

    if anexo and anexo.exists():
        dados = anexo.read_bytes()
        msg.add_attachment(
            dados,
            maintype="application",
            subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=anexo.name,
        )

    with smtplib.SMTP(config.servidor, config.porta) as smtp:
        smtp.starttls()
        smtp.login(config.usuario, config.senha)
        smtp.send_message(msg)
