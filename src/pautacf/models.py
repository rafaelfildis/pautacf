"""Modelos de dados do PAUTA CF."""

from dataclasses import dataclass
from datetime import date, time
from typing import Optional


@dataclass
class Audiencia:
    data: date
    hora_inicio: time
    hora_fim: Optional[time]
    parte_autora: str
    parte_re: str
    numero_processo: str
    vara: str
    responsavel: str
    status: str
    observacoes: str

    @property
    def horario_formatado(self) -> str:
        if self.hora_fim:
            return f"{self.hora_inicio:%H:%M} - {self.hora_fim:%H:%M}"
        return f"{self.hora_inicio:%H:%M}"

    @property
    def data_formatada(self) -> str:
        return f"{self.data:%d/%m/%Y}"

    def chave_ordenacao(self):
        return (self.data, self.hora_inicio)
