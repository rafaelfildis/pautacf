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
- **Separação entre audiências, tarefas e prazos.** O Astrea entrega tudo no mesmo feed,
  como `VEVENT`; a distinção entre audiência e compromisso de dia inteiro está no `UID`
  (`astreaappointment…` × `astreatask…`), não no formato da data.
  Dentro dos compromissos de dia inteiro, tarefas do escritório ("RÉPLICA",
  "REPROTOCOLAR") são separadas dos prazos determinados pelo juízo por linguagem de
  despacho (*prazo*, *dias*, *intime-se*, *sob pena*) e por extensão do texto — a maior
  tarefa tem 49 caracteres e o menor prazo tem 60. O filtro permite ver cada grupo
  isolado ou combinado.
- **Filtros de período**: dia, semana, mês ou intervalo livre, com navegação para frente
  e para trás.
- **Filtros de refino**: busca textual, responsável, modalidade e tipo de compromisso.
- **Atribuição de responsável** por compromisso, com indicador do que ainda está sem
  advogado designado.
- **Modalidade, cidade e link editáveis** — o Astrea não fornece esses campos de forma
  padronizada, então a cidade é deduzida do foro, a modalidade já vem como *Virtual*
  (troque nas exceções) e o link é extraído do texto quando existe.
- **Seis formatos de saída**, cada um com documento próprio — nenhum é captura da tela:
  PDF completo (A4 paisagem, texto nativo), PDF MOBILE (cards em página estreita),
  impressão completa, impressão MOBILE, JPEG vertical para WhatsApp e versão escrita.
- **Modal de exportação** com orientação, papel, agrupamento (data, responsável, cidade
  ou cliente), política de CPF/CNPJ e geração de documentos individualizados.
- **Pré-visualização** em moldura de aparelho, alternando entre 360, 390 e 430 px.
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
index.html                interface
assets/css/styles.css     identidade visual da tela
assets/css/documento.css  estilo dos documentos exportados (prévia e impressão)
assets/img/logo.png       logomarca oficial
assets/js/ics.js          parser do calendário iCalendar do Astrea
assets/js/store.js        persistência local (responsáveis, modalidade, equipe)
assets/js/formato.js      constantes da marca, formatação, máscaras, agrupamento
assets/js/documento.js    modelo do documento, comum a todos os formatos
assets/js/doc-html.js     documentos HTML (prévia e impressão)
assets/js/pdf.js          PDF com texto nativo — completo e MOBILE
assets/js/jpeg.js         JPEG vertical em partes
assets/js/exportar.js     modal, prévia, impressão e downloads
assets/js/app.js          controlador: filtros, tabela e sincronização
```

O fluxo é sempre o mesmo: a tela entrega os registros filtrados, `documento.js`
monta um modelo único (grupos, resumo, privacidade aplicada) e cada renderizador
consome esse modelo. Nenhum formato depende do layout da tela.

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

### Decisões de layout dos documentos

- **PDF com texto nativo.** A exportação anterior desenhava a pauta num canvas e
  embutia a imagem: nada era selecionável nem pesquisável. Agora o texto é texto,
  os links são anotações reais e a nitidez independe do zoom.
- **Página do PDF MOBILE: 110 × 260 mm.** Num celular a folha ocupa a largura da tela,
  então uma página estreita faz o mesmo corpo de 11 pt aparecer maior — é o que
  dispensa o zoom. Mantidos os mínimos de 11 pt no corpo e 12 pt nos botões, um card
  ocupa cerca de 94 mm, o que resulta em **2 cards por página**, não nos 3 a 5
  sugeridos. Cabem 3 apenas reduzindo a fonte ou cortando campos; como as próprias
  regras pedem para não forçar a densidade nem diminuir a tipografia, a legibilidade
  prevaleceu. Quem preferir papel comum tem a opção *A4 retrato* no modal.
- **JPEG dividido em partes.** Cada parte tem 1080 px de largura e no máximo 4000 px de
  altura; a quebra respeita os limites dos cards e nunca deixa cabeçalho de dia órfão.
- **CPF e CNPJ mascarados por padrão** em PDF MOBILE, impressão MOBILE e JPEG, que são
  os formatos que circulam por celular. O modal permite exibir ou ocultar.

### O que o feed do Astrea não exporta

A tela de evento do Astrea tem os campos **"Endereço ou local"**, **"Modalidade"** e
**"Responsável"**, mas **nenhum deles vai para o `.ics`**. O feed traz apenas
`SUMMARY`, `DESCRIPTION`, `DTSTART`, `DTEND`, `ORGANIZER`, `ATTENDEE` e `UID` — não
existe uma única propriedade `LOCATION` no arquivo inteiro.

Consequências práticas:

- **Modalidade** é preenchida no painel, com *Virtual* como padrão.
- **Link da audiência** é extraído por busca de URL na descrição — o que só funciona
  quando alguém digitou o link nas *observações* do evento, já que essas vão para a
  `DESCRIPTION`. Na agenda atual isso cobre 9 das 50 audiências; as demais são
  preenchidas à mão no painel e ficam salvas.
- Como cada secretaria escreve de um jeito ("Link da reunião:", "Acessando este link:",
  "Endereço:", ou a URL solta), a extração procura a URL em si e ignora o rótulo.

Levar o "Endereço ou local" para o painel automaticamente exigiria a API autenticada do
Astrea, não o feed público de calendário.

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
