# PAUTA CF

Sistema de acompanhamento e extração da pauta de audiências e prazos do escritório
**Calmon & Freitas Advogados**.

O painel sincroniza a agenda do **Astrea** pelo link de calendário, separa audiências
de tarefas, permite atribuir o advogado responsável por cada compromisso e exporta a
pauta em **PDF**, **JPEG** e **texto**.

> ⚠️ Nenhum dado real de cliente deve ser commitado neste repositório. Arquivos `.ics`,
> `.xlsx` e pautas geradas são ignorados pelo Git (veja `.gitignore`) — apenas os
> exemplos sintéticos em `data/exemplos/` são versionados.

---

## Painel web (principal)

Aplicação estática na raiz do repositório — sem instalação, build ou banco de dados.

### Funcionalidades

- **Sincronização direta com o Astrea**, sem servidor intermediário: o feed do Astrea
  envia `Access-Control-Allow-Origin: *`, então o navegador busca o calendário sozinho.
- **Separação entre audiências e tarefas.** O Astrea entrega as duas no mesmo feed, como
  `VEVENT`; a distinção está no `UID` (`astreaappointment…` × `astreatask…`) e não no
  formato da data. Audiências têm hora marcada, tarefas são de dia inteiro.
- **Filtros de período**: dia, semana, mês ou intervalo livre, com navegação para frente
  e para trás.
- **Filtros de refino**: busca textual, responsável, modalidade e tipo de compromisso.
- **Atribuição de responsável** por compromisso, com indicador do que ainda está sem
  advogado designado.
- **Modalidade e cidade editáveis** — o Astrea não fornece esses campos de forma
  padronizada, então a cidade é deduzida do foro e fica aberta a correção.
- **Exportação** em PDF (A4 paisagem, paginado), JPEG (imagem única) e versão escrita
  pronta para e-mail ou WhatsApp.
- **Funciona offline** com a última cópia sincronizada.

### Como executar

Os módulos ES exigem `http://` — não funciona abrindo o arquivo direto (`file://`):

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.

### Publicação

Em **Settings → Pages**, selecione a branch `main` e a pasta `/ (root)`.
O painel fica disponível em `https://rafaelfildis.github.io/pautacf/`.

### Configuração

Abra **Configurações** no cabeçalho para ajustar:

- **Link da agenda** — o endereço `webcal://` do Astrea (a conversão para `https://`
  é automática).
- **Equipe** — a lista de advogados que aparece no seletor de responsável.
- **Backup** — as atribuições ficam salvas apenas no navegador (`localStorage`), não são
  enviadas ao Astrea nem a nenhum servidor. Use o backup para levá-las a outro
  computador ou antes de limpar os dados de navegação.

### Estrutura

```
index.html              interface
assets/css/styles.css   identidade visual (marinho e dourado da logomarca)
assets/img/logo.png     logomarca oficial
assets/js/ics.js        parser do calendário iCalendar do Astrea
assets/js/store.js      persistência local (responsáveis, modalidade, equipe)
assets/js/export.js     motor de layout em canvas — PDF, JPEG e texto
assets/js/app.js        controlador: filtros, tabela e sincronização
```

### Notas técnicas

- **Sem dependências obrigatórias.** A única biblioteca externa é o
  [jsPDF](https://github.com/parallax/jsPDF), carregado sob demanda apenas na exportação
  em PDF. Sem internet, o sistema recorre à impressão do navegador.
- **Fuso horário.** O Astrea entrega os horários em `America/Sao_Paulo`; o painel os
  interpreta como horário de parede, evitando o deslocamento de horas que aparecia em
  extrações anteriores.
- **Semana forense.** A semana vai de segunda a domingo.
- **Prazos longos.** Alguns prazos trazem o despacho inteiro no título; nas exportações
  cada célula é limitada a 5 linhas para não estourar a página.

---

## Automação em Python (CLI)

Além do painel, o repositório mantém a automação que gera a planilha semanal no modelo
do escritório, envia por e-mail e monta o link do WhatsApp.

### Instalação

Requer Python 3.10+.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install -e .
```

Copie `.env.example` para `.env` e ajuste conforme necessário (equipe, SMTP, etc.).

### Gerar a pauta semanal

```bash
python scripts/gerar_pauta.py --inicio 2026-07-20 --fim 2026-07-24 --saida pautas/pauta_semana.xlsx
```

Omitindo `--inicio`/`--fim`, é usada a semana atual. Para enviar por e-mail e gerar o
link do WhatsApp:

```bash
python scripts/gerar_pauta.py --email --whatsapp
```

O envio de e-mail requer as variáveis `SMTP_*` e `PAUTACF_DESTINATARIOS` no `.env`.

### Painel Flask (legado)

```bash
python web/app.py
```

Exibe a pauta da semana em `http://localhost:5000`, com filtro via
`?inicio=AAAA-MM-DD&fim=AAAA-MM-DD`.

### Testes

```bash
pytest
```

Os testes usam apenas o calendário sintético em `data/exemplos/agenda_exemplo.ics`.

### Estrutura

```
src/pautacf/
  ics_parser.py     extrai audiências do .ics
  excel_export.py   gera a planilha no modelo Calmon & Freitas
  notify.py         e-mail (SMTP) e link do WhatsApp
  models.py         dataclass Audiencia
  config.py         equipe, regras de status, config de e-mail
scripts/gerar_pauta.py   CLI principal
web/app.py               painel Flask legado
data/exemplos/           calendário sintético para testes
tests/
```

---

## Histórico

O painel anterior (`webapp/`, baseado em importação de planilha Excel) foi substituído
pelo painel na raiz, que lê a agenda direto do Astrea. Ele continua disponível no
histórico do Git.
