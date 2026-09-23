# Mapa de Processos — Calmon & Freitas Advogados

Módulo do sistema PAUTA CF, alcançado pelo botão **Mapa de Processos** no cabeçalho da
pauta. Painel estático (HTML + JSON) com a distribuição geográfica dos processos da
carteira: mapa do Brasil por estado e consulta filtrável por comarca, vara, parte
contrária e situação.

No ar em `https://rafaelfildis.github.io/pautacf/mapa/`. Este arquivo documenta o
dicionário de dados e as regras de derivação; a visão geral do módulo está no
`README.md` da raiz do repositório.

Base: 324 registros · 13 estados · 123 comarcas · última atualização dos dados: 23/09/2026.

---

## 1. Estrutura da pasta

```
mapa/
├── index.html                          página principal (carrega os dados via HTTP)
├── data/
│   ├── processos.json                  base normalizada — é o que o painel lê
│   ├── br-uf.json                      geometria do mapa (paths SVG das 27 UFs)
│   ├── processos.csv                   mesma base em CSV (;  UTF-8 BOM, abre no Excel)
│   ├── agregado_uf.csv                 contagem por estado
│   └── agregado_comarca.csv            contagem por comarca
├── standalone/
│   └── carteira-standalone.html        versão única, com os dados embutidos
├── build/
│   ├── gerar_dados.py                  regera data/processos.json a partir do .xlsx
│   └── gerar_mapa.py                   regera data/br-uf.json a partir de um GeoJSON
├── fonte/
│   └── Processo.xlsx                   planilha original (NÃO versionada — ver abaixo)
└── README.md
```

> `fonte/Processo.xlsx` fica fora do repositório: `*.xlsx` está no `.gitignore` da raiz,
> junto com as demais fontes que carregam dado de cliente. Coloque a planilha nesse
> caminho na sua máquina para regerar os dados.

## 2. Como publicar

> **Publicado como parte do PAUTA CF.** O módulo vive em `mapa/` dentro do repositório
> e sobe junto com a pauta pelo GitHub Pages — não há passo de publicação próprio.
> A página herda a marca de sessão da pauta (`pautacf.sessao.v1`) e devolve à tela de
> acesso quem chega sem ela; os arquivos de `data/`, porém, são servidos diretamente
> pelo host e não passam por essa verificação.
>
> O que segue vale para levar o painel a outro destino.

O painel é **100% estático**: não precisa de banco, backend nem build. Basta servir a pasta.

- **Servidor web / intranet / S3 / Netlify / Vercel:** suba o conteúdo da pasta
  (`index.html` + `data/`) na raiz do site. Nada mais é necessário.
- **Subpasta de um sistema existente** (ex.: `https://seusistema.com.br/painel/`):
  funciona igual — todos os caminhos são relativos.
- **Teste local:**

  ```bash
  cd <raiz do repositório>
  python3 -m http.server 8000
  # a pauta em http://localhost:8000 e o mapa em http://localhost:8000/mapa/
  ```

- **Sem servidor nenhum:** abra `standalone/carteira-standalone.html` com dois cliques.
  Esse arquivo já tem os dados dentro e funciona direto do disco, por e-mail ou pendrive.

> `index.html` usa `fetch()` para ler `data/`. Navegador não permite `fetch` em `file://`,
> por isso a versão standalone existe. Se abrir o `index.html` direto do disco,
> a própria página avisa e indica o caminho alternativo.

**Dependências externas:** apenas a fonte IBM Plex (Google Fonts). Se o ambiente não tiver
saída para a internet, remova as três linhas `<link ...fonts.g...>` do topo do `index.html` —
a página cai para a fonte do sistema sem quebrar o layout.

## 3. Dicionário de dados (`data/processos.json`)

Array de objetos, um por processo. Campos:

| campo | tipo | descrição |
|---|---|---|
| `n` | texto | número do processo (padrão CNJ; alguns vêm sem máscara da exportação) |
| `uf` | texto \| null | UF derivada do código do tribunal no número CNJ |
| `com` | texto | comarca (`"Não informada"` quando a planilha não traz Foro nem Vara) |
| `cli` | texto | cliente representado |
| `reu` | texto | parte contrária, como consta na planilha |
| `gr` | texto | grupo normalizado da parte contrária (ex.: `Banco Agibank`, `Banco BMG`) |
| `vara` | texto | juízo / vara / unidade jurisdicional |
| `sis` | texto | sistema de tramitação (`PJE TJCE`, `EPROC TJRS`, …) ou `—` |
| `flags` | lista | situações: `LIMINAR DEFERIDA`, `SOBRESTADO`, `Em fase de recurso`, `PRO BONO - …` |
| `resp` | texto | responsável pelo processo |
| `dist` | `AAAA-MM-DD` \| null | data de distribuição (ou de criação, quando ausente) |
| `ano` | texto | ano de distribuição |
| `ult` | `AAAA-MM-DD` \| null | data do último andamento |
| `mov` | texto | descrição do último andamento (truncada em 200 caracteres) |
| `url` | texto | link direto para os autos, quando a planilha traz |

### Regras de derivação aplicadas

1. **UF** — extraída das posições `J` e `TR` do número CNJ
   (`NNNNNNN-DD.AAAA.J.TR.OOOO`), e não do endereço do cliente.
   `J=8` → tribunal estadual, `TR` = código da UF. Os 10 processos do **TRF1** (`J=4`)
   e 1 do **TRT5** (`J=5`) foram alocados na **Bahia**, onde tramitam.
2. **Comarca** — extraída dos campos `Foro` e `Vara` da planilha, nesta ordem de regras:
   `Comarca de X` → padrão `Vara ... - CIDADE` (TJBA) → `Cidade - Juizado Especial` (TJMG) →
   nome de cidade em caixa alta isolado → `Subseção Judiciária de X` (JF) →
   `Vara do Trabalho de X`.
3. **Consolidações** — as varas do Sistema dos Juizados de Salvador (`VSJE …`) viram
   **Salvador**; o **Núcleo de Justiça 4.0** do TJCE é mantido como unidade virtual,
   por não ter comarca física.
4. **Grupo da parte contrária** — casamento por palavra-chave no nome do réu
   (`AGIBANK` → `Banco Agibank`, `BMG` → `Banco BMG`, e assim por diante).

### Limitações conhecidas

- **6 processos** não têm `Foro` nem `Vara` na exportação e aparecem como
  `"Não informada"`: 3 de SE, 1 de PE, 1 de BA e 1 cadastro do tipo "Caso" sem número.
- **1 registro** (o cadastro de "Caso") não tem número de processo, logo fica fora do mapa.
- **58 processos** estão sem nenhuma etiqueta na origem — inclusive os 11 previdenciários
  da Justiça Federal. Como `LIMINAR DEFERIDA` depende de etiquetagem manual, o indicador
  de liminares representa o que foi marcado no sistema, não necessariamente o universo real.
- Quatro números vêm **sem máscara** na exportação (sequência bruta de 20 dígitos);
  o painel formata na exibição, mas o dado bruto permanece como veio.

## 4. Como atualizar os dados

Exporte a planilha atualizada do sistema, substitua `fonte/Processo.xlsx` e rode:

```bash
pip install openpyxl
cd mapa
python3 build/gerar_dados.py                 # usa fonte/Processo.xlsx
python3 build/gerar_dados.py /caminho/outra.xlsx
```

O script regrava `data/processos.json`. A página lê o arquivo novo no próximo carregamento —
não há passo de compilação.

Se quiser continuar usando a versão standalone, gere-a de novo embutindo o JSON atualizado
nas duas tags `<script type="application/json">` do arquivo, ou simplesmente use o `index.html`.

O mapa (`data/br-uf.json`) é fixo e só precisa ser regerado se a geometria mudar.
`build/gerar_mapa.py` espera um GeoJSON das 27 unidades da federação com a sigla no
campo `SIGLA` das propriedades, salvo como `br_states.json` no diretório de execução;
ele simplifica as geometrias e projeta em Mercator para o `viewBox` do SVG.

## 5. Integração com outro sistema

Se o destino for um BI ou banco de dados em vez de página estática, use
`data/processos.csv` (separador `;`, UTF-8 com BOM) ou o próprio JSON.
A coluna `situacoes` do CSV traz as etiquetas separadas por `; ` na mesma célula —
se o destino exigir colunas booleanas, o desmembramento é direto a partir dela.
