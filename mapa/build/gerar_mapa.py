import json, math
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

import os
BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
g=json.load(open('br_states.json'))  # GeoJSON das 27 UFs (ver README)
feats={f['properties']['SIGLA']: shape(f['geometry']) for f in g['features']}

TOL=0.035
W=1000.0
def merc(lon, lat):
    x = lon
    y = math.degrees(math.log(math.tan(math.pi/4 + math.radians(lat)/2)))
    return x, y

# bounds
bs=[gm.bounds for gm in feats.values()]
minx=min(b[0] for b in bs); miny=min(b[1] for b in bs); maxx=max(b[2] for b in bs); maxy=max(b[3] for b in bs)
x0,y0 = merc(minx, miny); x1,y1 = merc(maxx, maxy)
sx = W/(x1-x0); H = (y1-y0)*sx
print('bbox', minx,miny,maxx,maxy, 'H', H)

def proj(lon,lat):
    x,y = merc(lon,lat)
    return (x-x0)*sx, (y1-y)*sx

def ring_path(coords):
    pts=[]
    for lon,lat in coords:
        x,y = proj(lon,lat)
        pts.append((round(x,1), round(y,1)))
    # dedupe consecutive
    out=[pts[0]]
    for p in pts[1:]:
        if p!=out[-1]: out.append(p)
    if len(out)<3: return None
    d='M'+f'{out[0][0]} {out[0][1]}'+''.join(f'L{p[0]} {p[1]}' for p in out[1:])+'Z'
    return d

result={}
centroids={}
for uf,geom in feats.items():
    s=geom.simplify(TOL, preserve_topology=True)
    polys = list(s.geoms) if s.geom_type=='MultiPolygon' else [s]
    polys = sorted(polys, key=lambda p:-p.area)
    keep=[p for p in polys if p.area > polys[0].area*0.004 or p.area>0.35]
    d=''
    for p in keep:
        r=ring_path(list(p.exterior.coords))
        if r: d+=r
    result[uf]=d
    c = max(polys, key=lambda p:p.area).representative_point()
    cx,cy = proj(c.x, c.y)
    centroids[uf]=[round(cx,1), round(cy,1)]

tot=sum(len(v) for v in result.values())
print('path chars total', tot)
json.dump({'width':round(W), 'height':round(H,1), 'paths':result, 'labels':centroids}, open(os.path.join(BASE,'data','br-uf.json'),'w'), ensure_ascii=False)
