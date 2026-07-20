# PAUTA CF

Automação da **pauta de audiências semanal** do escritório **Calmon & Freitas Advogados**.

O projeto lê os compromissos de audiência de um calendário exportado (Outlook/Google
Calendar, formato `.ics`) e gera automaticamente:

- uma planilha **Excel** (`.xlsx`) no modelo já usado pelo escritório (título, período,
  total, colunas DATA / HORÁRIO / PARTE AUTORA / PARTE RÉ / PROCESSO / VARA /
  RESPONSÁVEL / STATUS / OBSERVAÇÕES-LINK, agrupada por dia);
- uma mensagem pronta e um link para compartilhar a pauta no **WhatsApp**;
- o envio automático da pauta por **e-mail**;
- um **painel web** simples para consultar a pauta da semana no navegador.

> ⚠️ Nenhum dado real de cliente deve ser commitado neste repositório. Arquivos `.ics`
> e `.xlsx` com dados reais são ignorados pelo Git (veja `.gitignore`) — apenas os
> exemplos sintéticos em `data/exemplos/` são versionados.

## Como funciona a extração das audiências

O parser (`src/pautacf/ics_parser.py`) lê todo evento do `.ics` e considera como
audiência qualquer evento cujo título/descrição contenha a palavra "audiência" ou um
número de processo no padrão CNJ.

Para que os campos sejam extraídos com 100% de confiabilidade, use esta convenção no
**título (assunto)** do evento na agenda:

```
AUDIÊNCIA: <número do processo> | <parte autora> x <parte ré> | <vara/juízo> | <responsável>
```

Exemplo:

```
AUDIÊNCIA: 3002212-72.2026.8.06.0297 | FABRICIO GOMES x BANCO BMG SA | Núcleo de Justiça 4.0 | RAFAEL
```

Coloque o link da videoconferência (Teams, Webex, Lifesize etc.) na descrição ou local
do evento — ele é detectado automaticamente e vai para a coluna "Observações / Link".

Se um evento não seguir essa convenção, o parser tenta heurísticas (procura o número
do processo em qualquer lugar do texto, separador `x` entre as partes, nome de um
responsável cadastrado em `PAUTACF_EQUIPE`). Campos não encontrados ficam em branco
para preenchimento manual.

Palavras como "cancelada", "redesignada"/"remarcada", "adiada" e "realizada" no
evento atualizam automaticamente a coluna STATUS.

## Instalação

Requer Python 3.10+.

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
pip install -e .
```

Copie `.env.example` para `.env` e ajuste conforme necessário (equipe, SMTP, etc.).

## Uso — gerar a pauta semanal

1. No Outlook ou Google Calendar, exporte a agenda como `.ics`.
2. Rode:

```bash
python scripts/gerar_pauta.py --ics caminho/da/agenda.ics \
    --inicio 2026-07-20 --fim 2026-07-24 \
    --saida pautas/pauta_semana.xlsx
```

Se `--inicio`/`--fim` forem omitidos, é usada a semana atual (segunda a domingo).

Para também enviar por e-mail e gerar o link do WhatsApp:

```bash
python scripts/gerar_pauta.py --ics caminho/da/agenda.ics --email --whatsapp
```

O envio de e-mail requer as variáveis `SMTP_*` e `PAUTACF_DESTINATARIOS` no `.env`.
O link do WhatsApp (`wa.me`) não precisa de nenhuma credencial — basta abrir o link
para enviar a mensagem pronta pelo WhatsApp Web ou app.

## Uso — painel web

```bash
set PAUTACF_ICS=caminho\da\agenda.ics   # Windows (cmd)
python web/app.py
```

Depois acesse http://localhost:5000 — a pauta da semana atual é exibida em uma
tabela, com filtro de período via `?inicio=AAAA-MM-DD&fim=AAAA-MM-DD` na URL.

## Testes

```bash
pytest
```

Os testes usam apenas o calendário sintético em `data/exemplos/agenda_exemplo.ics`
(dados fictícios, sem nenhuma informação real de cliente).

## Estrutura do projeto

```
src/pautacf/
  ics_parser.py     # extrai audiências do .ics
  excel_export.py   # gera a planilha no modelo Calmon & Freitas
  notify.py         # e-mail (SMTP) e link do WhatsApp
  models.py         # dataclass Audiencia
  config.py         # equipe, regras de status, config de e-mail
scripts/
  gerar_pauta.py    # CLI principal
web/
  app.py            # painel web (Flask)
data/exemplos/
  agenda_exemplo.ics  # calendário sintético para testes/demonstração
tests/
```

## Roadmap

- [ ] Integração direta com a API do Google Calendar / Microsoft Graph (hoje é feito
      via exportação manual do `.ics`).
- [ ] Envio automático via WhatsApp Business API (hoje é gerado apenas o link
      `wa.me` com a mensagem pronta, pois a API oficial exige aprovação de conta
      comercial).
- [ ] Agendamento automático (ex: rodar toda sexta-feira e enviar a pauta da semana
      seguinte) via Tarefas Agendadas do Windows ou cron.
