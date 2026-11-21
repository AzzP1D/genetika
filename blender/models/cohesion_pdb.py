# Когезия сестёр: экспериментальные домены, не атомная модель целого кольца.
# 7NJ1 — human separase–securin (Yu et al., 2021; RCSB PDB CC0).
# 6WG3 — human cohesin–NIPBL–DNA (Shi et al., 2020; CC0).
# 6WG3 — инженерный комплекс загрузки с некливажными заменами RAD21:
# используем измеренные части, достраиваем отсутствующие участки для анимации.
import os, sys, json, re
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..'))
import bpy
from mathutils import Vector
import lib
source=os.path.join(os.path.dirname(__file__),'kinetochore_pdb.py')
exec(compile(open(source,encoding='utf-8').read().split('# ---------- 1.')[0],source,'exec'))

b=beads('7NJ1')
sep=[p for e,ch,s,k,p in b if e=='1']
# Каталитический Cys2029: номер исходной последовательности, не номер в укороченной цепи.
cols=[]; active=None;tok=re.compile(r"'[^']*'|\"[^\"]*\"|\S+")
for line in open(os.path.join(lib.ROOT,'models_raw/pdb/7NJ1.cif'),encoding='utf-8'):
    if line.startswith('_atom_site.'):cols.append(line.split('.',1)[1].strip())
    elif cols and line.startswith('ATOM'):
        a=dict(zip(cols,tok.findall(line)))
        if a['label_asym_id']=='A' and a['auth_seq_id']=='2029' and a['label_atom_id'].strip('"')=='CA':
            active=Vector(tuple(float(a['Cartn_'+v])*.1 for v in 'xyz'));break
if active is None:raise RuntimeError('Cys2029 CA missing')
center=mean(sep);axes=axes_of(sep)
frame=Frame(center,active-center,axes[0])
blob('coh_separase',[('res',p) for p in sep],frame,0x32ffc0,3500,.3)
blob('coh_securin',[(k,p) for e,ch,s,k,p in b if e=='2'],frame,0xf4dd4c,700,.3)
meta={'unit':'nm','separaseSource':'7NJ1','cohesinSource':'6WG3','activeSite':list(frame.to(active)),
      'reconstruction':'Ring, flexible RAD21, DNA arrangement and catalysis animation are illustrative; 6WG3 is a loading complex with cleavage-resistant RAD21 mutations.'}
print('OK separase active site (nm)',meta['activeSite'])

b=beads('6WG3')
head_frames={}
for entity,name,color in [('1','coh_smc1',0x6e8cff),('2','coh_smc3',0x927aff)]:
    # N- и C-концы SMC сходятся в ATPase-головке, длинные coiled coils сюда не входят.
    pts=[p for e,ch,s,k,p in b if e==entity and (s<170 or s>1040)]
    ax=axes_of(pts);f=Frame(mean(pts),ax[1],ax[0])
    head_frames[entity]=f
    blob(name,[('res',p) for p in pts],f,color,1000,.35)
    print('OK head',name,'residues',len(pts))
# Обе цепи шарнира экспортируем в одной системе координат 6WG3.
hinge_sets=[sorted((s,p) for e,ch,s,k,p in b if e==entity and lo<=s<=hi)
            for entity,lo,hi in [('1',491,655),('2',493,683)]]
tips=[mean([rows[0][1],rows[-1][1]]) for rows in hinge_sets]
hinge_center=mean([p for rows in hinge_sets for s,p in rows])
hinge_frame=Frame(hinge_center,tips[1]-tips[0],hinge_center-mean(tips))
for i,rows in enumerate(hinge_sets):
    blob('coh_hinge'+str(i+1),[('res',p) for s,p in rows],hinge_frame,[0x6e8cff,0x927aff][i],1400,.28)
meta['hingeTips']=[list(hinge_frame.to(p)) for p in tips]
# Концевые участки RAD21 сохраняют общие координаты со своими головками.
meta['rad21Tips']=[]
for name,entity,lo,hi,tail in [('coh_rad21c','1',558,630,558),('coh_rad21n','2',10,92,92)]:
    rows=[(s,p) for e,ch,s,k,p in b if e=='3' and lo<=s<=hi]
    f=head_frames[entity]
    blob(name,[('res',p) for s,p in rows],f,0xff5e7a,700,.27)
    meta['rad21Tips'].append(list(f.to(next(p for s,p in rows if s==tail))))
# STAG1: экспериментальная форма, положение в раскрытой учебной сборке условное.
pts=[p for e,ch,s,k,p in b if e=='4']
ax=axes_of(pts);f=Frame(mean(pts),ax[1],ax[0])
blob('coh_stag1',[('res',p) for p in pts],f,0xd5a3ff,1300,.35)
# Нуклеосома из уже имеющейся 1KX5: гистоны и две непрерывные цепи ДНК.
nuc=beads('1KX5')
hist=[p for e,ch,s,k,p in nuc if k=='res']
ax=axes_of(hist);f=Frame(mean(hist),ax[0],ax[2])
blob('coh_histones',[('res',p) for p in hist],f,0xc08bff,1100,.3)
chains=sorted(set(ch for e,ch,s,k,p in nuc if k=='bb'))
meta['nucleosomeSource']='1KX5'
meta['nucleosomeStrands']=[ [list(f.to(p)) for e,ch,s,k,p in sorted(nuc,key=lambda v:v[2]) if ch==chain and k=='bb'] for chain in chains ]
meta['reconstruction']='Open cohesin architecture, SMC coiled coils, unresolved RAD21 linker, chromatin linkers, assembly placement and cleavage motion are illustrative. Hinge, RAD21 terminal interfaces, STAG1 and heads: 6WG3; nucleosome histones and DNA backbone: 1KX5; inhibited separase: 7NJ1.'
lib.export('cohesion_pdb');lib.report('cohesion_pdb')
with open(os.path.join(lib.ROOT,'app/models/cohesion_pdb.json'),'w',encoding='utf-8') as out:json.dump(meta,out,indent=2)
# Экспортированные части центрированы; на превью разложены для проверки формы.
for name,at in [('coh_smc1',(-13,0,0)),('coh_smc3',(13,0,0)),('coh_rad21c',(-13,0,0)),('coh_rad21n',(13,0,0)),('coh_hinge1',(0,0,14)),('coh_hinge2',(0,0,14))]:bpy.data.objects[name].location=at
lib.preview('cohesion_pdb',900)
