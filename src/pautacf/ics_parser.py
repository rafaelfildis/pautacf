"""Extrai audiências de um arquivo .ics (exportado do Outlook/Google Calendar).

Convenção recomendada para o título (SUMMARY) do evento na agenda, para que a
extração seja 100% confiável:

    AUDIÊNCIA: <número do processo> | <parte autora> x <parte ré> | <vara/juízo> | <responsável>

Exemplo:

    AUDIÊNCIA: 3002212-72.2026.8.06.0297 | FABRICIO GOMES x BANCO BMG SA | Núcleo de Justiça 4.0 | RAFAEL

Se o evento não seguir a convenção acima, o parser tenta heurísticas: número
CNJ do processo em qualquer lugar do texto (com ou sem pontuação), separador
" x " entre as partes no título, uma linha "Foro:"/"Vara:" ou "Cliente:" na
descrição (padrão comum em feeds de acompanhamento processual), nome de um
responsável conhecido e link de videoconferência na descrição/local. Campos
não encontrados ficam em branco para preenchimento manual na planilha gerada.

Eventos de dia inteiro (sem horário) são ignorados propositalmente: nos feeds
de tribunal costumam representar prazos processuais (ex.: "PROTOCOLO - 15
dias..."), não audiências marcadas.
"""

import re
import urllib.request
from pathlib import Path
from typing import Optional

from icalendar import Calendar

from .config import EQUIPE, PALAVRAS_AUDIENCIA, PALAVRAS_STATUS, STATUS_PADRAO
from .models import Audiencia

# Número CNJ formatado (NNNNNNN-DD.AAAA.J.TR.OOOO) ou os mesmos 20 dígitos sem pontuação
# (alguns sistemas de tribunal publicam o número "cru" na agenda).
RE_PROCESSO_FORMATADO = re.compile(r"\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}")
RE_PROCESSO_NUMERICO = re.compile(r"(?<!\d)\d{20}(?!\d)")
RE_LINK = re.compile(r"https?://\S+")
RE_PARTES = re.compile(r"\s+[xX]\s+")
# Linha "Foro: <vara/juízo>" ou "Vara: <...>", como publicado por sistemas de
# acompanhamento processual (ex.: descrição de eventos importados de tribunais).
RE_FORO = re.compile(r"(?im)^\s*(?:foro|vara)\s*:\s*(.+?)\s*$")
RE_CLIENTE = re.compile(r"(?im)^\s*cliente\s*:\s*(.+?)\s*$")


def _formatar_processo(numero: str) -> str:
    digitos = re.sub(r"\D", "", numero)
    if len(digitos) != 20:
        return numero.strip()
    return (
        f"{digitos[0:7]}-{digitos[7:9]}.{digitos[9:13]}."
        f"{digitos[13]}.{digitos[14:16]}.{digitos[16:20]}"
    )


def _extrair_numero_processo(texto: str) -> str:
    m = RE_PROCESSO_FORMATADO.search(texto)
    if m:
        return m.group(0)
    m = RE_PROCESSO_NUMERICO.search(texto)
    if m:
        return _formatar_processo(m.group(0))
    return ""


def _extrair_vara(texto: str) -> str:
    m = RE_FORO.search(texto)
    return m.group(1).strip() if m else ""


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
    return bool(_extrair_numero_processo(texto))


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


def _remover_numero_processo_do_nome(nome: str, numero_processo: str) -> str:
    """Remove o número do processo (formatado ou só os dígitos) do fim do nome da
    parte, quando o título do evento repete o número junto com o nome (comum em
    feeds de tribunal)."""
    if not nome or not numero_processo:
        return nome
    digitos = re.sub(r"\D", "", numero_processo)
    limpo = nome
    for variante in (numero_processo, digitos):
        if variante and limpo.rstrip().endswith(variante):
            limpo = limpo.rstrip()[: -len(variante)]
    return limpo.strip(" -")


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
        numero_processo = _extrair_numero_processo(texto_completo)
        parte_autora, parte_re = _separar_partes(
            summary.split("|")[0] if "|" in summary else summary
        )
        if not parte_autora:
            m_cliente = RE_CLIENTE.search(texto_completo)
            if m_cliente:
                parte_autora = m_cliente.group(1).strip()
        vara = _extrair_vara(texto_completo) or str(evento.get("location", "")).strip()
        responsavel = _extrair_responsavel(texto_completo)
        parte_autora = _remover_numero_processo_do_nome(parte_autora, numero_processo)
        parte_re = _remover_numero_processo_do_nome(parte_re, numero_processo)

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


def baixar_ics(url: str, timeout: int = 20) -> bytes:
    """Baixa o conteúdo de um feed .ics público (ex.: link 'Endereço público em formato
    iCal' de um calendário do Google Agenda)."""
    with urllib.request.urlopen(url, timeout=timeout) as resposta:
        return resposta.read()


def extrair_audiencias(origem_ics: Path | str) -> list[Audiencia]:
    """Retorna a lista de audiências encontradas em um calendário .ics.

    `origem_ics` pode ser o caminho de um arquivo local ou uma URL http(s) de um
    feed .ics público (ex.: a URL "iCal" pública de um calendário do Google Agenda).
    """
    origem_texto = str(origem_ics)
    if origem_texto.startswith(("http://", "https://")):
        conteudo = baixar_ics(origem_texto)
    else:
        conteudo = Path(origem_ics).read_bytes()

    calendario = Calendar.from_ical(conteudo)

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
