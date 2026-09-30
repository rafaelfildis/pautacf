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
- **Exportação em dois eixos independentes**, escolhidos por filtro na própria barra:
  **Formato** (PDF ou JPEG) e **Plataforma** (A4 ou MOBILE). As quatro combinações são
  válidas, e o botão *Exportar* aplica a seleção sobre os registros que estão na tela.
  Padrão inicial: PDF em A4.
- **A plataforma prevalece sobre o tamanho da tela.** Pedir A4 num celular devolve o
  documento de computador — página A4, colunas completas, tipografia de leitura — e
  pedir MOBILE num computador devolve o documento de celular. A responsividade da
  interface nunca troca o tipo de documento escolhido.
- **Bloco OBSERVAÇÕES IMPORTANTES** nos documentos que contêm uma única audiência, com
  as orientações à parte (testar o link, documento com foto, 5 minutos de antecedência,
  consequência da ausência injustificada). Na pauta coletiva ele não aparece.
- **A audiência única não se anuncia como pauta.** Sai o título "PAUTA DE AUDIÊNCIAS" —
  do cabeçalho, do rodapé e dos metadados do arquivo — e o nome do escritório assume o
  lugar de título. Saem também os seis contadores do resumo executivo, que só fazem
  sentido numa pauta: "1 audiência, 0 prazos, 1 comarca" apenas repete o que o documento
  já é. A logomarca e o período permanecem.
- **Impressão e versão escrita** continuam disponíveis como ações, seguindo a mesma
  plataforma selecionada.
- **Modal de mais opções** com orientação do A4, papel da impressão, agrupamento (data,
  responsável, cidade ou cliente), política de CPF/CNPJ e documentos individualizados.
- **Pré-visualização** que respeita a plataforma escolhida: moldura de aparelho no
  MOBILE (360, 390 e 430 px) e folha reduzida proporcionalmente no A4.
- **Funciona offline** com a última cópia sincronizada.
- **Painel de processos** — botão no canto superior direito que abre o mapa dos
  processos por UF e comarca, com resultados e prioridade para tráfego pago (seção
  própria abaixo).
- **Tela de login** antes do painel principal, com login e senha únicos para o
  escritório. É uma camada de interface, não de segurança real — o site é
  estático, sem back-end, e a credencial fica no código-fonte (`assets/js/auth.js`).
  Ela impede o acesso casual à tela, mas não substitui controle de acesso de
  verdade para dados sensíveis. A sessão dura até o navegador (ou a aba) ser
  fechado; o botão **Sair**, no cabeçalho, encerra a sessão manualmente antes disso.

Nenhuma saída é captura da tela: todos os documentos são construídos a partir dos dados.

### Como executar

Os módulos ES exigem `http://` — não funciona abrindo o arquivo direto (`file://`):

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.

### Publicação

Em Settings → Pages, selecione a branch `main` e a pasta `/ (root)`. O painel fica
disponível em `https://rafaelfildis.github.io/pautacf/`.

### Configuração

Abra Configurações no cabeçalho para ajustar:

- Link da agenda — o endereço `webcal://` do Astrea (a conversão para `https://` é
  automática).
- Equipe — a lista de advogados que aparece no seletor de responsável.
- Backup — as atribuições ficam salvas apenas no navegador (`localStorage`), não são
  enviadas ao Astrea nem a nenhum servidor. Use o backup para levá-las a outro
  computador ou antes de limpar os dados de navegação.

### Estrutura

```
index.html                interface
assets/css/styles.css     identidade visual da tela
assets/css/documento.css  estilo dos documentos exportados (prévia e impressão)
assets/img/logo.png       logomarca oficial
assets/js/auth.js         tela de login (camada de interface, credencial fixa)
assets/js/ics.js          parser do calendário iCalendar do Astrea
assets/js/store.js        persistência local (responsáveis, modalidade, equipe)
assets/js/formato.js      constantes da marca, formatação, máscaras, agrupamento
assets/js/documento.js    modelo do documento, comum a todos os formatos
assets/js/doc-html.js     documentos HTML (prévia e impressão)
assets/js/pdf.js          PDF com texto nativo — A4 e MOBILE
assets/js/jpeg.js         JPEG — tabela em A4 e cards em MOBILE
assets/js/exportar.js     filtros de formato/plataforma, prévia, impressão e downloads
assets/js/app.js          controlador: filtros, tabela e sincronização
```

O fluxo é sempre o mesmo: a tela entrega os registros filtrados, `documento.js` monta
um modelo único (grupos, resumo, privacidade aplicada, bloco de observações) e cada
renderizador consome esse modelo. Nenhum formato depende do layout da tela.

Toda a exportação passa por um único ponto, `exportarPauta()` em `exportar.js`, que
recebe o formato, a plataforma e o destino (arquivo, prévia, impressão ou texto). Barra
da tela, modal e prévia são apenas maneiras diferentes de chamá-lo, o que impede que
Prévia e Exportar discordem entre si.

### Notas técnicas

- Sem dependências obrigatórias. A única biblioteca externa é o
  [jsPDF](https://github.com/parallax/jsPDF), carregado sob demanda apenas na
  exportação em PDF. Sem internet, o sistema recorre à impressão do navegador.
- Fuso horário. O Astrea entrega os horários em `America/Sao_Paulo`; o painel os
  interpreta como horário de parede, evitando o deslocamento de horas que aparecia em
  extrações anteriores.
- Semana forense. A semana vai de segunda a domingo.
- Prazos longos. Alguns prazos trazem o despacho inteiro no título; nas exportações
  cada célula é limitada a 5 linhas para não estourar a página.

### Decisões de layout dos documentos

- PDF com texto nativo. A exportação anterior desenhava a pauta num canvas e embutia a
  imagem: nada era selecionável nem pesquisável. Agora o texto é texto, os links são
  anotações reais e a nitidez independe do zoom.
- Página do PDF MOBILE: 110 × 260 mm. Num celular a folha ocupa a largura da tela,
  então uma página estreita faz o mesmo corpo de 11 pt aparecer maior — é o que
  dispensa o zoom. Mantidos os mínimos de 11 pt no corpo e 12 pt nos botões, um card
  ocupa cerca de 94 mm, o que resulta em 2 cards por página, não nos 3 a 5 sugeridos.
  Cabem 3 apenas reduzindo a fonte ou cortando campos; como as próprias regras pedem
  para não forçar a densidade nem diminuir a tipografia, a legibilidade prevaleceu.
  Quem preferir papel comum tem a opção A4 retrato no modal.
- JPEG dividido em partes. No MOBILE cada parte tem 1080 px de largura e no máximo
  4000 px de altura. No A4 são 2400 × 1700 px, a proporção da folha em paisagem, com a
  mesma tabela do PDF. A quebra respeita os limites de card ou de linha e nunca deixa
  cabeçalho de dia órfão.
- Etiqueta de modalidade sem ícone na tabela A4. A coluna é estreita e o emoji, largo:
  com ele, "PRESENCIAL" invadiria a coluna vizinha. Rótulos longos ainda reduzem a
  fonte em vez de vazar.
- CPF e CNPJ mascarados por padrão na plataforma MOBILE, que é a que circula por
  celular. O modal permite exibir ou ocultar.
- O documento A4 é diagramado em 1180 px fixos. A folha de estilo dos documentos é
  mobile first e dimensiona a tipografia em `vw`; num celular isso devolveria um layout
  de celular mesmo com A4 selecionado. A classe `.doc--fixo` volta os tamanhos para
  valores fixos e neutraliza os breakpoints, e a prévia reduz a folha inteira em vez de
  cortá-la.
- Nome do arquivo da audiência única identifica o cliente e a data da própria
  audiência, não o intervalo do filtro, e é truncado para não estourar o limite de
  caminho do Windows quando o feed não separa as partes.

### O que o feed do Astrea não exporta

A tela de evento do Astrea tem os campos "Endereço ou local", "Modalidade" e
"Responsável", mas nenhum deles vai para o `.ics`. O feed traz apenas `SUMMARY`,
`DESCRIPTION`, `DTSTART`, `DTEND`, `ORGANIZER`, `ATTENDEE` e `UID` — não existe uma
única propriedade `LOCATION` no arquivo inteiro.

Consequências práticas:

- Modalidade é preenchida no painel, com Virtual como padrão.
- Link da audiência é extraído por busca de URL na descrição — o que só funciona
  quando alguém digitou o link nas observações do evento, já que essas vão para a
  `DESCRIPTION`. Na agenda atual isso cobre 9 das 50 audiências; as demais são
  preenchidas à mão no painel e ficam salvas.
- Como cada secretaria escreve de um jeito ("Link da reunião:", "Acessando este
  link:", "Endereço:", ou a URL solta), a extração procura a URL em si e ignora o
  rótulo.

Levar o "Endereço ou local" para o painel automaticamente exigiria a API autenticada
do Astrea, não o feed público de calendário.

## Painel de processos (`processos.html`)

Aba de inteligência para a estratégia de **tráfego pago**: mostra onde estão os processos
do escritório, onde eles têm sido procedentes e quais cidades merecem verba. Acessível
pelo botão **Painel de processos**, no canto superior direito da pauta, e publicada em
`https://rafaelfildis.github.io/pautacf/processos.html`. Usa a mesma tela de login.

### O que o painel mostra

- **Mapa do Brasil** com as UFs coloridas por volume, êxito ajustado ou recomendação de
  tráfego, e uma bolha por comarca (área proporcional ao número de processos). Clicar
  numa UF aproxima o mapa e filtra o painel; clicar numa bolha filtra a comarca.
- **Onde investir em tráfego**: as oito comarcas (ou UFs) de maior índice de
  prioridade, com a recomendação — Escalar, Testar, Observar ou Cautela.
- **Ranking de localidades** por comarca ou por UF, ordenável, com decisões de mérito,
  procedentes, parciais, acordos, improcedentes, liminares, êxito bruto e ajustado.
  Exporta CSV e **copia as cidades recomendadas** no formato `Cidade, UF`, pronto para
  colar na segmentação por local do gerenciador de anúncios.
- **Gráficos**: resultados conhecidos por UF, matriz tese × UF, distribuições por mês
  (ritmo de captação) e volume por parte adversa.
- **Tabela de processos** do recorte, paginada e exportável.
- **Filtros** que escopam tudo: demandas de massa (consumidor, bancário e
  previdenciário, sem pro bono) ou todos os processos, UF, comarca, parte adversa, tese,
  resultado, período de distribuição e responsável.

### Base de dados

A base vem da **exportação de processos do Astrea** (planilha `Processos`, .xlsx).

- **Base publicada** — `assets/data/processos-base.json`, gerada pelo script abaixo e
  **anonimizada**: sem nome de cliente, CPF, número de processo, texto de andamento,
  valor da causa ou data exata (a distribuição fica reduzida ao mês); parte adversa
  pessoa física vira "Pessoa física". O repositório é público, e o painel só precisa de
  localidade, tese, parte adversa empresarial e resultado.
- **Base local** — o botão **Atualizar base** lê a planilha do Astrea direto no
  navegador (nada é enviado a servidor) e guarda a base completa, com cliente e número
  do processo, apenas naquele computador. Com ela o painel ganha busca por cliente e
  as colunas de cliente e número na tabela. O mesmo modal volta à base publicada ou
  apaga a local.

Para atualizar a base publicada:

```bash
node scripts/processos/gerar_base.mjs caminho/para/Processos.xlsx
```

O script usa o mesmo classificador da importação no navegador
(`assets/js/processos/classificar.js`) e também atualiza `assets/data/origens-cnj.json`,
o dicionário público de unidades de origem (J.TR.OOOO → município) aprendido dos
processos cuja comarca veio por extenso. Não versione a planilha: `*.xlsx` continua no
`.gitignore`.

### Como a planilha é interpretada

O Astrea não preenche "Decisão do processo" nem "Resultado do processo" na exportação.
O classificador reconstrói cada campo:

- **UF** pelo número CNJ (segmento J.TR); **comarca** pelo foro, pela vara, pela
  remessa ou pela origem citada no último andamento e, na falta deles, pelo código de
  origem já visto. O Núcleo de Justiça 4.0 do TJCE é unidade virtual: conta para o
  Ceará, sem bolha no mapa, salvo quando o acórdão revela a comarca de origem.
- **Resultado** pelas etiquetas do escritório (PROCEDENTE, IMPROCEDENTE, LIMINAR
  DEFERIDA, SOBRESTADO, Em fase de recurso) e pelo texto do último andamento, que muitas
  vezes traz a íntegra da sentença ou do acórdão. Acórdão que reforma a sentença
  prevalece; cliente exequente em cumprimento de sentença, ou condenação lançada no
  Astrea, conta como procedente.
- **Tese** pelo assunto CNJ cadastrado ("Tarifas", "Empréstimo consignado", Tema
  1.414/STJ = cartão consignado etc.); sem assunto específico contra banco, o processo
  entra como "Bancário — tese não cadastrada".

Na base atual (320 processos) a classificação automática foi conferida contra a leitura
integral de cada processo, feita em duas passadas independentes: localidade e liminar
coincidem em 100% dos casos e o resultado em 318 de 320 — as duas diferenças são de
nomenclatura (acordo e condenação sem teor da sentença).

### Índice de prioridade e recomendação

Com poucas decisões por comarca, a taxa bruta engana (1 procedente em 1 decisão vira
100%). A taxa de êxito — procedentes, parciais e acordos sobre as decisões de mérito — é
ajustada em direção à média do escopo, com peso de 4 decisões, e combinada com volume e
liminares:

```
êxito ajustado = (êxitos + 4 × média) ÷ (decisões + 4)
índice         = 100 × (0,55 × êxito ajustado + 0,30 × √processos/√maior volume + 0,15 × liminares/processos)
```

| Recomendação | Critério |
|---|---|
| ▲ Escalar | ≥ 3 decisões de mérito, êxito ≥ 60% e êxito ajustado acima da média |
| ◆ Testar | ≥ 3 processos, ou liminar deferida, ou êxito ≥ 50% nas decisões existentes |
| ● Observar | pouco volume e nenhum sinal de resultado |
| ▼ Cautela | ≥ 2 decisões de mérito e êxito abaixo de 40% |

O índice é calculado sobre o escopo inteiro e só depois recortado por UF e comarca, para
que filtrar uma UF não mude a nota de uma comarca. A precisão cresce com as etiquetas:
todo processo sentenciado etiquetado no Astrea como PROCEDENTE, PARCIALMENTE PROCEDENTE,
IMPROCEDENTE ou ACORDO vira uma decisão de mérito no cálculo.

### Estrutura

```
processos.html                    página do painel
assets/css/processos.css          componentes do painel (mapa, ranking, gráficos)
assets/js/processos/xlsx.js       leitor de .xlsx/.csv sem dependências
assets/js/processos/classificar.js  planilha do Astrea → registro do painel
assets/js/processos/dados.js      base, filtros, agregação, índice e recomendação
assets/js/processos/mapa.js       mapa SVG (coroplético por UF + bolhas por comarca)
assets/js/processos/graficos.js   barras, matriz tese × UF e colunas mensais
assets/js/processos/painel.js     controlador da página
assets/data/processos-base.json   base publicada, anonimizada
assets/data/origens-cnj.json      J.TR.OOOO → município (dado público)
assets/data/brasil-uf.json        contornos das UFs já projetados
assets/data/municipios.json       5.570 municípios do IBGE com coordenadas
scripts/processos/gerar_base.mjs  gera a base publicada a partir da planilha
scripts/processos/gerar_geo.py    gera os dois arquivos geográficos acima
```

Sem bibliotecas externas: mapa e gráficos são SVG/HTML desenhados a partir dos dados, e
a planilha é descompactada com `DecompressionStream`, nativo do navegador.

## Automação em Python (CLI)

Além do painel, o repositório mantém a automação que gera a planilha semanal no
modelo do escritório, envia por e-mail e monta o link do WhatsApp.

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

### Histórico

O painel anterior (`webapp/`, baseado em importação de planilha Excel) foi substituído
pelo painel na raiz, que lê a agenda direto do Astrea. Ele continua disponível no
histórico do Git.

---

## Lembrete de segurança

Essa tela de login é uma camada de interface, não uma proteção real: o site é
estático (sem back-end), então a senha fica visível a quem inspecionar o
código-fonte da página publicada. Ela impede o acesso casual de quem não
conhece a URL/credencial, mas não substitui um controle de acesso de verdade
para dados sensíveis de clientes.
