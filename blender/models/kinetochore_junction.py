# Узел Spc24/25–MIS12–KNL1/ZWINT из PDB 8PPR (Yatskevich et al., 2024, CC0).
# Взаимные координаты цепей сохраняются. Одна единица = 1 нм.
# CENP-C anchor — совмещение CA MIS12 из 5LSK и 8PPR, не новая экспериментальная сборка.
import os, sys, json, re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy, numpy as np
from mathutils import Vector
import lib

# Общие чтение mmCIF и генератор поверхностей, без исполнения сборки старого набора.
source = os.path.join(os.path.dirname(__file__), 'kinetochore_pdb.py')
exec(compile(open(source, encoding='utf-8').read().split('# ---------- 1.')[0], source, 'exec'))
b = beads('8PPR')
foot = [p for e,ch,s,k,p in b if ch in ('E','F')]
mis = [p for e,ch,s,k,p in b if ch in ('A','B','C','D')]
neck = mean([p for e,ch,s,k,p in b if ch in ('E','F') and s <= min(t[2] for t in b if t[1] == ch) + 4])
ax = axes_of(mis + foot, mean(mis) - mean(foot))
frame = Frame(neck, ax[1], ax[0])
for name, chains, color, target in [
    ('kt_junction_foot', 'EF', 0xff9f2e, 1500),
    ('kt_junction_mis12', 'ABCD', 0xff5fa8, 2400),
    ('kt_junction_knl1', 'GH', 0x9a75ff, 1500),
]:
    blob(name, [(k,p) for e,ch,s,k,p in b if ch in chains], frame, color, target, 0.32)

def ca(name, chain):
    cols, result = [], {}
    tok = re.compile(r"'[^']*'|\"[^\"]*\"|\S+")
    for line in open(os.path.join(lib.ROOT,'models_raw','pdb',name+'.cif'), encoding='utf-8'):
        if line.startswith('_atom_site.'): cols.append(line.split('.',1)[1].strip())
        elif cols and line.startswith('ATOM'):
            row = dict(zip(cols, tok.findall(line)))
            if row['label_asym_id'] == chain and row['label_atom_id'].strip('"') == 'CA' and row['label_alt_id'] in ('.','A'):
                result[int(row['auth_seq_id'])] = np.array([float(row['Cartn_'+a]) * .1 for a in 'xyz'])
    return result

# MIS12: цепь A в 5LSK и B в 8PPR. Номера auth_seq_id относятся к исходному белку.
a, c = ca('5LSK','A'), ca('8PPR','B')
keys = sorted(set(a) & set(c))
if len(keys) < 30: raise RuntimeError('Недостаточно общих CA для MIS12')
x, y = np.array([a[k] for k in keys]), np.array([c[k] for k in keys])
mx, my = x.mean(0), y.mean(0)
u, _, vt = np.linalg.svd((x-mx).T @ (y-my))
fix = np.eye(3); fix[2,2] = np.linalg.det(u @ vt)
rot = u @ fix @ vt
rmsd = np.sqrt(np.mean(np.sum(((x-mx) @ rot + my - y)**2,axis=1)))
cp = ca('5LSK','E')
end = (cp[max(cp)] - mx) @ rot + my
anchor = frame.to(Vector(end))
print('OK RMSD MIS12 5LSK/8PPR, nm:', round(float(rmsd),3), 'CA:',len(keys))
meta = {'source':'8PPR', 'unit':'nm', 'neck':[0,0,0], 'cenpc':list(anchor),
        'mis12RmsdNm':float(rmsd), 'note':'CENP-C anchor transferred from 5LSK; flexible CENP-C paths and complete chromosome are illustrative reconstructions.'}
# Концы ДНК в собственных системах уже построенных деталей: линкеры должны
# начинаться на концах цепи, а не проходить через центр гистоновой катушки.
for key, pdb, chain, nucleosome in [('nucDnaEnds','3AN2','I',True),('ccanDnaEnds','7R5S','C',False)]:
    rows=beads(pdb)
    pts=[p for e,ch,s,k,p in rows]
    ax=axes_of(pts)
    fr=Frame(mean(pts),ax[0],ax[2]) if nucleosome else Frame(mean(pts),ax[1],ax[0])
    dna=[(s,p) for e,ch,s,k,p in rows if ch==chain and k=='bb']
    meta[key]=[list(fr.to(p)) for s,p in [min(dna,key=lambda x:x[0]),max(dna,key=lambda x:x[0])]]
os.makedirs(os.path.join(lib.ROOT,'app','models'), exist_ok=True)
with open(os.path.join(lib.ROOT,'app','models','kinetochore_junction.json'),'w',encoding='utf-8') as out:
    json.dump(meta,out,indent=2)
print('OK junction anchor CENP-C',list(anchor))
lib.export('kinetochore_junction')
lib.report('kinetochore_junction')
lib.preview('kinetochore_junction',800)
