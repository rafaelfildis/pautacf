from datetime import date
from pathlib import Path

from pautacf.ics_parser import extrair_audiencias, filtrar_por_periodo

CAMINHO_EXEMPLO = Path(__file__).resolve().parent.parent / "data" / "exemplos" / "agenda_exemplo.ics"


def test_extrai_apenas_audiencias():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    # A reunião interna e o prazo processual (evento de dia inteiro) não devem ser extraídos.
    assert len(audiencias) == 6


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


def test_numero_de_processo_sem_pontuacao_e_formatado():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    carlos = [a for a in audiencias if a.parte_autora == "Carlos Teste Souza"][0]
    assert carlos.numero_processo == "0098765-43.2026.8.05.0001"


def test_vara_extraida_da_linha_foro():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    carlos = [a for a in audiencias if a.parte_autora == "Carlos Teste Souza"][0]
    assert carlos.vara == "5ª Vara Cível de Exemplo"


def test_evento_de_dia_inteiro_com_processo_e_ignorado():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    numeros = [a.numero_processo for a in audiencias]
    assert "0004567-89.2026.8.05.9999" not in numeros


def test_numero_de_processo_repetido_no_titulo_e_removido_do_nome_da_parte():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    ana = [a for a in audiencias if a.parte_autora == "Ana Teste"][0]
    assert ana.parte_re == "Banco Exemplo Tres S.A."
    assert ana.numero_processo == "0011223-45.2026.8.05.0002"


def test_titulo_com_nome_repetido_usa_trecho_mais_a_direita_como_parte_re():
    audiencias = extrair_audiencias(CAMINHO_EXEMPLO)
    bruno = [a for a in audiencias if a.parte_autora == "Bruno Teste"][0]
    assert bruno.parte_re == "BANCO AGIBANK S.A."
