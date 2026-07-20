"""Extrai audiências de um arquivo .ics (exportado do Outlook/Google Calendar).

Convenção recomendada para o título (SUMMARY) do evento na agenda, para que a
extração seja 100% confiável:

    AUDIÊNCIA: <número do processo> | <parte autora> x <parte ré> | <vara/juízo> | <responsável>

Exemplo:

    AUDIÊNCIA: 3002212-72.2026.8.06.0297 | FABRICIO GOMES x BANCO BMG SA | Núcleo de Justiça 4.0 | RAFAEL

Se o evento não seguir a convenção acima, o parser tenta heurísticas (procura
o número CNJ do processo em qualquer lugar do texto, separador " x " entre as
partes, nome de um responsável conhecido, link de videoconferência na
descrição/local). Campos que não forem encontrados ficam em branco para
preenchimento manual na planilha gerada.
"""

import re
from pathlib import Path
from typing import Optional

from icalendar import Calendar

from .config import EQUIPE, PALAVRAS_AUDIENCIA, PALAVRAS_STATUS, STATUS_PADRAO
from .models import Audiencia

RE_PROCESSO = re.compile(r"\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}")
RE_LINK = re.compile(r"https?://\S+")
RE_PARTES = re.compile(r"\s+[xX]\s+")


def _texto_evento(evento) -> str:
    partes = [
        str(evento.get("summary", "")),
        str(evento.get("description", "")),
        str(evento.get("location", "")),
    ]
    return "\n".join(p for p in partes if p)


def _eh_audiencia(texto: str) -> bool:
    texto_lower = texto.lower()
    if any(p in texto_lower for p in PALAVRAS_AUDIENCIA):
        return True
    return bool(RE_PROCESSO.search(texto))


def _extrair_status(texto: str) -> str:
    texto_lower = texto.lower()
    for status, palavras in PALAVRAS_STATUS.items():
        if any(p in texto_lower for p in palavras):
            return status
    return STATUS_PADRAO


def _extrair_responsavel(texto: str) -> str:
    for nome in EQUIPE:
        if re.search(rf"\b{re.escape(nome)}\b", texto, re.IGNORECASE):
            return nome
    return ""


def _extrair_link(texto: str) -> str:
    m = RE_LINK.search(texto)
    return m.group(0) if m else ""


def _parse_convencao_estruturada(summary: str) -> Optional[dict]:
    if "|" not in summary or ":" not in summary.split("|", 1)[0]:
        return None
    try:
        _, resto = summary.split(":", 1)
        campos = [c.strip() for c in resto.split("|")]
        if len(campos) < 4:
            return None
        processo, partes, vara, responsavel = campos[:4]
        autora, re_ = _separar_partes(partes)
        return {
            "numero_processo": processo.strip(),
            "parte_autora": autora,
            "parte_re": re_,
            "vara": vara.strip(),
            "responsavel": responsavel.strip(),
        }
    except ValueError:
        return None


def _separar_partes(texto: str) -> tuple[str, str]:
    partes = RE_PARTES.split(texto, maxsplit=1)
    if len(partes) == 2:
        return partes[0].strip(), partes[1].strip()
    return texto.strip(), ""


def _evento_para_audiencia(evento) -> Optional[Audiencia]:
    dtstart = evento.get("dtstart")
    if dtstart is None:
        return None
    inicio = dtstart.dt
    if not hasattr(inicio, "hour"):
        # Evento de dia inteiro (sem horário) não é uma audiência.
        return None

    dtend = evento.get("dtend")
    fim = dtend.dt if dtend is not None else None

    summary = str(evento.get("summary", ""))
    texto_completo = _texto_evento(evento)

    estruturado = _parse_convencao_estruturada(summary)
    if estruturado:
        numero_processo = estruturado["numero_processo"]
        parte_autora = estruturado["parte_autora"]
        parte_re = estruturado["parte_re"]
        vara = estruturado["vara"]
        responsavel = estruturado["responsavel"] or _extrair_responsavel(
            texto_completo
        )
    else:
        m_processo = RE_PROCESSO.search(texto_completo)
        numero_processo = m_processo.group(0) if m_processo else ""
        parte_autora, parte_re = _separar_partes(
            summary.split("|")[0] if "|" in summary else summary
        )
        vara = str(evento.get("location", "")).strip()
        responsavel = _extrair_responsavel(texto_completo)

    return Audiencia(
        data=inicio.date(),
        hora_inicio=inicio.time(),
        hora_fim=fim.time() if fim else None,
        parte_autora=parte_autora,
        parte_re=parte_re,
        numero_processo=numero_processo,
        vara=vara,
        responsavel=responsavel,
        status=_extrair_status(texto_completo),
        observacoes=_extrair_link(texto_completo),
    )


def extrair_audiencias(caminho_ics: Path | str) -> list[Audiencia]:
    """Lê um arquivo .ics e retorna a lista de audiências encontradas."""
    caminho_ics = Path(caminho_ics)
    calendario = Calendar.from_ical(caminho_ics.read_bytes())

    audiencias = []
    for evento in calendario.walk("VEVENT"):
        texto = _texto_evento(evento)
        if not _eh_audiencia(texto):
            continue
        audiencia = _evento_para_audiencia(evento)
        if audiencia:
            audiencias.append(audiencia)

    audiencias.sort(key=lambda a: a.chave_ordenacao())
    return audiencias


def filtrar_por_periodo(
    audiencias: list[Audiencia], data_inicio, data_fim
) -> list[Audiencia]:
    """Filtra audiências dentro do período [data_inicio, data_fim], inclusive."""
    return [a for a in audiencias if data_inicio <= a.data <= data_fim]
