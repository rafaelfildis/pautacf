"""Configuração do PAUTA CF: equipe, palavras-chave e parâmetros de e-mail."""

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()

# Nomes da equipe usados para identificar o RESPONSÁVEL em cada audiência.
# Pode ser sobrescrito pela variável de ambiente PAUTACF_EQUIPE (separada por vírgula).
EQUIPE = [
    nome.strip()
    for nome in os.environ.get(
        "PAUTACF_EQUIPE", "JOSELTON,RAFAEL,NATHALIA,LARISSA"
    ).split(",")
    if nome.strip()
]

# Palavras que, se presentes no resumo/descrição do evento, indicam mudança de status.
PALAVRAS_STATUS = {
    "CANCELADA": ["cancelad"],
    "REDESIGNADA": ["redesignad", "remarcad"],
    "ADIADA": ["adiad"],
    "REALIZADA": ["realizad"],
}
STATUS_PADRAO = "Em andamento"

# Palavras-chave para reconhecer um evento de calendário como audiência.
PALAVRAS_AUDIENCIA = ["audiência", "audiencia", "aud."]

NOME_ESCRITORIO = "CALMON & FREITAS ADVOGADOS"
SUBTITULO_PAUTA = (
    "AGENDA SEMANAL | AUDIÊNCIAS VIRTUAIS E PRESENCIAIS"
)

# --- E-mail (opcional, usado por pautacf.notify) ---


@dataclass
class ConfigEmail:
    servidor: str = os.environ.get("SMTP_SERVIDOR", "")
    porta: int = int(os.environ.get("SMTP_PORTA", "587"))
    usuario: str = os.environ.get("SMTP_USUARIO", "")
    senha: str = os.environ.get("SMTP_SENHA", "")
    remetente: str = os.environ.get("SMTP_REMETENTE", "")
    destinatarios: list = field(
        default_factory=lambda: [
            e.strip()
            for e in os.environ.get("PAUTACF_DESTINATARIOS", "").split(",")
            if e.strip()
        ]
    )


def config_email() -> ConfigEmail:
    return ConfigEmail()
