"""Gera as bases geográficas do Painel de Processos.

Saídas (versionadas, dados públicos — nenhuma informação de cliente):
  assets/data/brasil-uf.json     contornos simplificados das 27 UFs, já projetados
                                 em coordenadas SVG, com a projeção usada
  assets/data/municipios.json    os 5.570 municípios do IBGE (código, nome, UF,
                                 latitude, longitude), para georreferenciar as comarcas

Fontes (baixar antes e informar a pasta):
  https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson
  https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv
  https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/estados.csv

Uso:
  python scripts/processos/gerar_geo.py <pasta-com-as-fontes>
"""

from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "assets" / "data"

# Projeção equiretangular com correção de latitude no centro do país. Para um
# mapa de referência (não de medição) ela preserva bem a silhueta do Brasil e é
# trivial de reproduzir no navegador para posicionar as comarcas.
LON_MIN, LON_MAX = -74.2, -34.6
LAT_MIN, LAT_MAX = -33.9, 5.4
LAT_REF = -15.0
LARGURA = 1000.0
COS_REF = math.cos(math.radians(LAT_REF))
ESCALA = LARGURA / ((LON_MAX - LON_MIN) * COS_REF)
ALTURA = (LAT_MAX - LAT_MIN) * ESCALA

TOLERANCIA = 0.035  # graus (~3,5 km) — Douglas-Peucker
AREA_MINIMA = 0.02  # graus² — descarta ilhotas invisíveis na escala do painel


def projetar(lon: float, lat: float) -> tuple[float, float]:
    return (lon - LON_MIN) * COS_REF * ESCALA, (LAT_MAX - lat) * ESCALA


def distancia_segmento(p, a, b) -> float:
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplificar(pontos, tol):
    if len(pontos) < 4:
        return pontos
    manter = [False] * len(pontos)
    manter[0] = manter[-1] = True
    pilha = [(0, len(pontos) - 1)]
    while pilha:
        i, j = pilha.pop()
        maior, indice = 0.0, -1
        for k in range(i + 1, j):
            d = distancia_segmento(pontos[k], pontos[i], pontos[j])
            if d > maior:
                maior, indice = d, k
        if maior > tol:
            manter[indice] = True
            pilha += [(i, indice), (indice, j)]
    return [p for p, m in zip(pontos, manter) if m]


def area(anel) -> float:
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(anel, anel[1:] + anel[:1]))) / 2


def caminho(poligonos) -> str:
    partes = []
    for poligono in poligonos:
        for anel in poligono:
            if area(anel) < AREA_MINIMA:
                continue
            anel = simplificar(anel, TOLERANCIA)
            if len(anel) < 4:
                continue
            pts = [projetar(lon, lat) for lon, lat in anel]
            partes.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
    return "".join(partes)


def main(pasta: Path) -> None:
    estados = {}
    with open(pasta / "estados.csv", encoding="utf-8-sig") as f:
        for linha in csv.DictReader(f):
            estados[linha["codigo_uf"]] = linha

    geo = json.loads((pasta / "brazil-states.geojson").read_text(encoding="utf-8"))
    ufs = []
    for feat in geo["features"]:
        props, geom = feat["properties"], feat["geometry"]
        poligonos = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        info = estados[props["codigo_ibg"]]
        cx, cy = projetar(float(info["longitude"]), float(info["latitude"]))
        ufs.append({
            "uf": props["sigla"],
            "nome": props["name"],
            "regiao": info["regiao"],
            "d": caminho(poligonos),
            "rotulo": [round(cx, 1), round(cy, 1)],
        })
    ufs.sort(key=lambda u: u["uf"])

    mapa = {
        "fonte": "click_that_hood (contornos) e IBGE via kelvins/municipios-brasileiros (centroides)",
        "projecao": {
            "tipo": "equiretangular",
            "lonMin": LON_MIN, "latMax": LAT_MAX, "latRef": LAT_REF,
            "escala": round(ESCALA, 6), "largura": LARGURA, "altura": round(ALTURA, 1),
        },
        "ufs": ufs,
    }
    (DESTINO / "brasil-uf.json").write_text(json.dumps(mapa, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    siglas = {c: e["uf"] for c, e in estados.items()}
    municipios = []
    with open(pasta / "municipios.csv", encoding="utf-8-sig") as f:
        for linha in csv.DictReader(f):
            municipios.append([
                int(linha["codigo_ibge"]), linha["nome"], siglas[linha["codigo_uf"]],
                round(float(linha["latitude"]), 4), round(float(linha["longitude"]), 4),
            ])
    municipios.sort(key=lambda m: m[0])
    (DESTINO / "municipios.json").write_text(json.dumps({
        "campos": ["ibge", "nome", "uf", "lat", "lon"],
        "municipios": municipios,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"{len(ufs)} UFs, {len(municipios)} municípios gravados em {DESTINO}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
