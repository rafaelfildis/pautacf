# PAUTA CF — Painel Web (client-side)

Aplicação web completa e independente para transformar uma planilha Excel de
audiências em um painel interativo, com a identidade visual do escritório
**Calmon & Freitas Advogados** (navy `#01152F` + dourado `#E2CFAF`, fonte
Parkinsans/Inter — extraídos do site oficial do escritório).

Roda 100% no navegador: **sem backend, sem banco de dados**. Os dados existem
apenas durante a sessão (em memória) e são substituídos a cada nova
importação.

## Como usar

Abra `index.html` num servidor local (não em `file://`, pois algumas
bibliotecas de CDN e o `fetch` de fontes exigem HTTP) — por exemplo:

```bash
cd webapp
python -m http.server 8000
```

Depois acesse `http://localhost:8000` e arraste uma planilha `.xlsx`/`.xls`/`.csv`
para a área de importação (ou clique para selecionar).

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
