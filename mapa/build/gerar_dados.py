import openpyxl, re, json, collections, datetime

import sys, os
BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=sys.argv[1] if len(sys.argv)>1 else os.path.join(BASE,'fonte','Processo.xlsx')
wb=openpyxl.load_workbook(SRC, data_only=True); ws=wb['Processos']
rows=list(ws.iter_rows(values_only=True)); hdr=rows[0]
data=[dict(zip(hdr,r)) for r in rows[1:] if any(r)]

TR={'01':'AC','02':'AL','03':'AP','04':'AM','05':'BA','06':'CE','07':'DF','08':'ES','09':'GO','10':'MA','11':'MT','12':'MS','13':'MG','14':'PA','15':'PB','16':'PR','17':'PE','18':'PI','19':'RJ','20':'RN','21':'RS','22':'RO','23':'RR','24':'SC','25':'SE','26':'SP','27':'TO'}
UFNOME={'AC':'Acre','AL':'Alagoas','AP':'Amapá','AM':'Amazonas','BA':'Bahia','CE':'Ceará','DF':'Distrito Federal','ES':'Espírito Santo','GO':'Goiás','MA':'Maranhão','MT':'Mato Grosso','MS':'Mato Grosso do Sul','MG':'Minas Gerais','PA':'Pará','PB':'Paraíba','PR':'Paraná','PE':'Pernambuco','PI':'Piauí','RJ':'Rio de Janeiro','RN':'Rio Grande do Norte','RS':'Rio Grande do Sul','RO':'Rondônia','RR':'Roraima','SC':'Santa Catarina','SE':'Sergipe','SP':'São Paulo','TO':'Tocantins'}

def tc(s):
    small={'de','da','do','das','dos','e','del'}
    toks=re.split(r'(\s+|-)', s.strip().lower()); out=[]
    for i,p in enumerate(toks):
        if not p.strip() or p=='-': out.append(p); continue
        out.append(p if (p in small and i>0) else p[0].upper()+p[1:])
    return re.sub(r'\s+',' ', ''.join(out)).strip()

ALIAS={'P Alegre':'Porto Alegre','Sao Paulo':'São Paulo','São João del':'São João del-Rei'}

def comarca(d):
    txt=[str(c).strip() for c in (d.get('Foro'), d.get('Vara')) if c]
    for t in txt:
        m=re.search(r'[Cc]omarca\s+de\s+(.+?)(?:\s*[-–—/(\[]|$)', t, re.I)
        if m: return tc(m.group(1))
    for t in txt:
        T=t.upper()
        m=re.match(r'^V\b[^,]*\bDE\s+([A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][A-ZÁÂÃÀÉÊÍÓÔÕÚÇ\s]+)$', T)
        if m and len(T.split())>4: return tc(m.group(1))
        if re.match(r'^SALVADOR', T) or re.search(r'\bVSJE\b', T): return 'Salvador'
        if re.search(r'SE[CÇ][AÃ]O JUDICI[AÁ]RIA DA BAHIA', T): return 'Salvador'
        m=re.search(r'Subse[cç][aã]o Judici[aá]ria de (.+?)(?:\s*-\s*[A-Z]{2})?$', t, re.I)
        if m: return tc(m.group(1))
        m=re.search(r'Vara do Trabalho de (.+)$', t, re.I)
        if m: return tc(m.group(1))
        if re.match(r'^[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ\s\.]{3,}$', t) and not re.search(r'JUIZADO|VARA|JUSTI|UNIDADE|CONSUMIDOR|REGI', T):
            return tc(re.sub(r'\s*-\s*[A-Z]{2}$','',t))
        m=re.search(r'^(.+?)\s+[-–]\s+Juizado Especial', t, re.I)
        if m: return tc(m.group(1).replace('del-Rei','del-Rei'))
        m=re.search(r'^(?:\d+[ªº°]?\s*)?(?:V(?:ara)?\.?\s|Juizado|JUIZADO).*?\s[-–]\s*([A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][A-Za-zÁÂÃÀÉÊÍÓÔÕÚÇáâãàéêíóôõúç\.\s]+?)(?:\s*/\s*[A-Z]{2})?$', t)
        if m and not re.search(r'CONSUMIDOR|MATUTINO|VESPERTINO|COMUNS', m.group(1).upper()):
            return tc(m.group(1))
        m=re.search(r'Juizado Especial (?:C[ií]vel )?d[eo] (.+?)$', t, re.I)
        if m: return tc(m.group(1))
        m=re.search(r'\bDE ([A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][A-ZÁÂÃÀÉÊÍÓÔÕÚÇ\s]+)$', t)
        if m: return tc(m.group(1))
        if re.search(r'N[uú]cleo de Justi[cç]a 4\.0', t, re.I): return 'Núcleo de Justiça 4.0 (virtual)'
        if re.search(r'JEC Central', t, re.I): return 'São Paulo'
        if re.search(r'Titular TR\s*-\s*Belo Horizonte', t, re.I): return 'Belo Horizonte'
    return None

def parte_contraria(d):
    s=d.get('Outros envolvidos')
    if not s: return 'Não informada'
    for chunk in str(s).split('),'):
        chunk=chunk.strip()
        m=re.match(r'^(.*?)\s*\((R[ée]u|Requerido|PARTE|Executado)\)?$', chunk+')' if not chunk.endswith(')') else chunk, re.I)
        if m:
            nome=m.group(1)
            break
    else:
        nome=str(s).split('(')[0]
    nome=re.sub(r'\s*-\s*CNPJ.*$','',nome, flags=re.I).strip()
    return nome or 'Não informada'

def grupo(nome):
    n=nome.upper()
    for k,v in [('AGIBANK','Banco Agibank'),('BMG','Banco BMG'),('BANCO PAN','Banco Pan'),('SANTANDER','Santander'),
                ('AYMOR','Aymoré (Santander)'),('BRADESCO','Bradesco'),('ITA','Itaú'),('MASTER','Banco Master'),
                ('CAPITAL CONSIG','Capital Consig'),('C6','C6 Bank'),('CREFISA','Crefisa'),('DAYCOVAL','Daycoval'),
                ('BANCO DO BRASIL','Banco do Brasil'),('CAIXA','Caixa Econômica'),('OLE','Banco Olé'),('SAFRA','Safra'),
                ('MERCADO','Mercado Pago/Livre'),('NUBANK','Nubank'),('INSS','INSS'),('FACEBOOK','Meta/Facebook'),
                ('BANRISUL','Banrisul'),('INTER','Banco Inter'),('CETELEM','Cetelem'),('FINANCEIRA','Outras financeiras')]:
        if k in n: return v
    return 'Outros'

def money(v):
    if not v: return 0.0
    s=re.sub(r'[^\d,.-]','',str(v)).replace('.','').replace(',','.')
    try: return float(s)
    except: return 0.0

def dt(v):
    if not v: return None
    s=str(v).strip()
    m=re.match(r'^(\d{2})/(\d{2})/(\d{4})$', s)
    if m: return f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
    return None

recs=[]
for d in data:
    n=re.sub(r'\D','',str(d.get('Número') or ''))
    num=str(d.get('Número') or '').strip()
    uf=None; just='Estadual'
    if len(n)==20:
        j=n[13]; trc=n[14:16]
        if j=='8': uf=TR.get(trc)
        elif j=='4': uf='BA'; just='Federal'
        elif j=='5': uf='BA'; just='Trabalhista'
    c=comarca(d) or 'Não informada'
    c=ALIAS.get(c,c)
    tags=[t.strip() for t in str(d.get('Etiquetas') or '').split(',') if t.strip()]
    sistema=next((t for t in tags if re.match(r'^(PJE|EPROC|PROJUDI|ESAJ|PORTAL|PJe)', t, re.I)), '—')
    flags=[t for t in tags if t!=sistema]
    pc=parte_contraria(d)
    dist=dt(d.get('Data de distribuição')) or dt(d.get('Data de Criação'))
    recs.append({
      'n': num, 'uf': uf, 'ufn': UFNOME.get(uf,'Não identificado'), 'com': c,
      'cli': re.sub(r'\s*-\s*CPF.*$','',str(d.get('Cliente') or '')).strip(),
      'reu': pc, 'gr': grupo(pc), 'vara': (d.get('Vara') or d.get('Foro') or '—'),
      'foro': d.get('Foro') or '—', 'just': just,
      'papel': (d.get('Papel do cliente') or '—'),
      'sis': sistema, 'flags': flags,
      'resp': d.get('Responsável') or '—',
      'dist': dist, 'ano': (dist or '')[:4] or '—',
      'vc': money(d.get('Valor da causa')),
      'ult': dt(d.get('Data do último histórico')),
      'mov': (str(d.get('Descrição do último histórico') or '—')[:300]),
      'url': d.get('URL do Processo') or '',
    })

print('total', len(recs))
print('sem uf', sum(1 for r in recs if not r['uf']))
print('sem comarca', sum(1 for r in recs if r['com']=='Não informada'))
cu=collections.Counter(r['uf'] for r in recs)
print(sorted(cu.items(), key=lambda x:-x[1]))
print()
print('grupos', collections.Counter(r['gr'] for r in recs).most_common())
print('flags', collections.Counter(f for r in recs for f in r['flags']).most_common())
print('anos', sorted(collections.Counter(r['ano'] for r in recs).items()))
# comarcas check BA
for uf in ['BA','CE','RS','MG']:
    cs=collections.Counter(r['com'] for r in recs if r['uf']==uf)
    print(uf, len(cs), cs.most_common(6))
json.dump(recs, open(os.path.join(BASE,'data','processos.json'),'w'), ensure_ascii=False, indent=1)
print('gravado em data/processos.json')
