from datetime import date
from pathlib import Path

from pautacf.ics_parser import extrair_audiencias, filtrar_por_periodo

CAMINHO_EXEMPLO = Path(__file__).resolve().parent.parent / "data" / "exemplos" / "agenda_exemplo.ics"


def test_extrai_apenas_audiencias():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    # A reunião interna (evento 4) não deve ser extraída.
    assert len(audiencias) == 3


def test_campos_estruturados_sao_extraidos_corretamente():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    primeira = audiencias[0]
    assert primeira.data == date(2026, 7, 20)
    assert primeira.numero_processo == "0001234-56.2026.8.05.0001"
    assert primeira.parte_autora == "JOÃO DA SILVA TESTE"
    assert primeira.parte_re == "BANCO EXEMPLO S.A."
    assert primeira.vara == "7ª VSJE do Consumidor"
    assert primeira.responsavel == "RAFAEL"
    assert "teams.microsoft.com" in primeira.observacoes


def test_status_redesignada_e_detectado():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    terceira = [a for a in audiencias if a.numero_processo == "0004567-89.2026.8.05.0079"][0]
    assert terceira.status == "REDESIGNADA"


def test_ordenacao_por_data_e_horario():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    datas_horarios = [a.chave_ordenacao() for a in audiencias]
    assert datas_horarios == sorted(datas_horarios)


def test_filtrar_por_periodo():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    filtradas = filtrar_por_periodo(audiencias, date(2026, 7, 20), date(2026, 7, 20))
    assert len(filtradas) == 2
    assert all(a.data == date(2026, 7, 20) for a in filtradas)
