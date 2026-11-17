# Когезия сестёр: экспериментальные домены, не атомная модель целого кольца.
# 7NJ1 — human separase–securin (Yu et al., 2021; RCSB PDB CC0).
# 6WG3 — human cohesin–NIPBL–DNA (Shi et al., 2020; CC0).
# 6WG3 — инженерный комплекс загрузки с некливажными заменами RAD21:
# берём только глобулярные домены. Мишень RAD21 и длинные плечи реконструирует JS.
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
for entity,name,color in [('1','coh_smc1',0x6e8cff),('2','coh_smc3',0x927aff)]:
    # N- и C-концы SMC сходятся в ATPase-головке, длинные coiled coils сюда не входят.
    pts=[p for e,ch,s,k,p in b if e==entity and (s<170 or s>1040)]
    ax=axes_of(pts);f=Frame(mean(pts),ax[1],ax[0])
    blob(name,[('res',p) for p in pts],f,color,1000,.35)
    print('OK head',name,'residues',len(pts))
lib.export('cohesion_pdb');lib.report('cohesion_pdb')
with open(os.path.join(lib.ROOT,'app/models/cohesion_pdb.json'),'w',encoding='utf-8') as out:json.dump(meta,out,indent=2)
# Экспортированные части центрированы; на превью разложены для проверки формы.
for name,at in [('coh_smc1',(-13,0,0)),('coh_smc3',(13,0,0))]:bpy.data.objects[name].location=at
lib.preview('cohesion_pdb',900)
