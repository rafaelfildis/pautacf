# PAUTA CF — Painel Web (client-side)

Aplicação web completa e independente para transformar uma planilha Excel de
audiências em um painel interativo, com a identidade visual do escritório
**Calmon & Freitas Advogados** (navy `#01152F` + dourado `#E2CFAF`, fonte
Parkinsans/Inter — extraídos do site oficial do escritório).

Roda 100% no navegador — **sem banco de dados**, dados só existem durante a
sessão. A importação de Excel é 100% client-side (sem backend). Há também um
botão **"Importar da Agenda"** que busca direto do Google Calendar; como o
navegador sozinho não consegue (o Google bloqueia por CORS), esse botão usa o
backend Python já existente no projeto como ponte local — veja abaixo.

## Como usar

Abra `index.html` num servidor local (não em `file://`, pois algumas
bibliotecas de CDN e o `fetch` de fontes exigem HTTP) — por exemplo:

```bash
cd webapp
python -m http.server 8000
```

Depois acesse `http://localhost:8000` e arraste uma planilha `.xlsx`/`.xls`/`.csv`
para a área de importação (ou clique para selecionar).

### Importar direto da agenda (Google Calendar)

O painel busca a agenda **automaticamente ao abrir a página** — sem precisar
clicar em nada — em `http://localhost:5000/api/audiencias`, um endpoint JSON
adicionado ao Flask do projeto (`web/app.py`), que já sabe ler o feed `.ics`
público configurado em `PAUTACF_ICS_URL` (ver `.env`/`.env.example` na raiz).
Para isso funcionar, rode em outro terminal, antes de abrir o painel:

```bash
python web/app.py
```

Se esse servidor não estiver rodando, a tentativa automática falha em
silêncio (sem alarme) e o painel volta para a tela de importação manual de
planilha — que continua funcionando 100% no navegador, sem depender dele.

Quando os dados vêm da agenda, o painel se **atualiza sozinho a cada 5
minutos** (indicador "Sincronizado às HH:MM" no cabeçalho, com botão de
atualizar na hora ao lado). Ao importar uma planilha Excel manualmente, a
atualização automática é desligada — a planilha importada é o dado "oficial"
até você importar outra coisa.

## Detecção automática de colunas

O importador (`js/excel.js`) varre as primeiras linhas da planilha à procura
do cabeçalho (modelos com título/logo acima do cabeçalho são suportados) e
mapeia cada coluna pelo **nome**, não pela posição — reconhecendo variações
como "Autor"/"Cliente"/"Parte Autora", "Réu"/"Requerido"/"Parte Ré", "Juízo"/
"Vara"/"Foro", etc. A ordem das colunas na planilha não importa.

Campos derivados automaticamente quando não há coluna própria:
- **Cidade**: extraída do texto de Juízo/Vara (padrões "Comarca de X" ou
  "- CIDADE" no fim).
- **Tribunal**: inferido do segmento `J.TR` do número CNJ do processo.
- **Tipo** (Virtual/Presencial/Híbrida): "Virtual" se houver link de
  audiência, "Presencial" caso contrário — a menos que a planilha tenha uma
  coluna própria de tipo/modalidade.

## Limitações conhecidas / decisões de escopo

- **"Consultar Processo"** no painel de detalhes abre uma busca no Google
  pelo número do processo entre aspas — não existe um link oficial universal
  de consulta processual entre tribunais, então optei por essa alternativa
  segura em vez de inventar uma URL de tribunal que poderia estar errada.
- **Redimensionamento de colunas** é uma implementação própria (arraste na
  borda direita do cabeçalho), já que o DataTables não tem isso nativamente.
- **"Congelar cabeçalho"** e rolagem suave usam o `scrollY` nativo do
  DataTables (não é necessário nenhum plugin adicional).
- Edição de observações (`Editar Observações`) só persiste em memória
  durante a sessão — não há armazenamento permanente, por design.

## Estrutura

```
index.html
css/style.css      — design system (cores, tema claro/escuro, tabela, print)
js/excel.js         — importação .xlsx/.xls/.csv + detecção de colunas
js/filters.js        — busca, filtros rápidos/avançados, período, ordenação
js/charts.js          — 5 gráficos Chart.js (dia, responsável, comarca, tipo, status)
js/export.js           — PDF, Excel, CSV, JPEG/PNG e impressão (respeitam os filtros)
js/app.js                — orquestrador: estado, DOM, DataTables, calendário, atalhos
assets/logo.png, favicon.png — identidade visual oficial do escritório
```

## Atalhos de teclado

`Ctrl+F` foca a busca · `Ctrl+P` imprime · `Ctrl+S` exporta em PDF.
