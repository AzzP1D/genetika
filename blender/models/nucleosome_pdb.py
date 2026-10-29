# Нуклеосома по экспериментальным данным: структура PDB 1KX5 (Davey et al., 2002;
# рентгеноструктурный анализ, 1,9 Å) из банка белков RCSB PDB (данные — CC0).
# Скрипт читает координаты атомов из models_raw/pdb/1KX5.cif и строит гладкую «молекулярную
# поверхность» из метаболов: по одному шарику на аминокислоту, по два — на нуклеотид
# (остов и азотистое основание). Отдельный объект и материал — у ДНК и у каждого вида гистонов.
# Запуск: tools\blender.ps1 blender\models\nucleosome_pdb.py
import os, sys, re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy
from mathutils import Vector
import lib

lib.reset()

SRC = os.path.join(lib.ROOT, 'models_raw', 'pdb', '1KX5.cif')
SCALE = 0.02            # 1 Å → 0,02 единицы: нуклеосома (~110 Å) получается ~2,2 единицы
# Сущности структуры 1KX5 (раздел _entity файла): какая часть модели и её цвет.
GROUPS = {
    '1': 'nucs_dna', '2': 'nucs_dna',
    '3': 'nucs_h3', '4': 'nucs_h4', '5': 'nucs_h2a', '6': 'nucs_h2b',
}
COLORS = {'nucs_dna': 0x00e5ff, 'nucs_h3': 0x9b4dff, 'nucs_h4': 0xe06bff, 'nucs_h2a': 0xb6ff3a, 'nucs_h2b': 0xffc83d}
BACKBONE = {'P', 'OP1', 'OP2', "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'", "C1'"}

# --- чтение mmCIF: таблица _atom_site ---
cols, rows = [], []
tok = re.compile(r"'[^']*'|\"[^\"]*\"|\S+")
with open(SRC, encoding='utf-8') as f:
    for line in f:
        if line.startswith('_atom_site.'):
            cols.append(line.split('.', 1)[1].strip())
        elif cols and line.startswith(('ATOM', 'HETATM')):
            rows.append(tok.findall(line))
        elif cols and rows and line.startswith('#'):
            break
c = {n: i for i, n in enumerate(cols)}

# Группируем атомы: аминокислота — один шарик, нуклеотид — остов и основание.
beads = {}   # (группа, цепь, номер, доля) → список координат
for r in rows:
    g = GROUPS.get(r[c['label_entity_id']])
    if not g or r[c['type_symbol']] == 'H' or r[c['label_alt_id']] not in ('.', 'A'):
        continue
    atom = r[c['label_atom_id']].strip('"')
    p = Vector((float(r[c['Cartn_x']]), float(r[c['Cartn_y']]), float(r[c['Cartn_z']])))
    part = ('bb' if atom in BACKBONE else 'base') if g == 'nucs_dna' else 'res'
    beads.setdefault((g, r[c['label_asym_id']], r[c['label_seq_id']], part), []).append(p)

centers = {k: sum(v, Vector()) / len(v) for k, v in beads.items()}
mid = sum(centers.values(), Vector()) / len(centers)
print('OK атомов', len(rows), 'шариков', len(centers))

RADIUS = {'res': 3.4, 'bb': 3.2, 'base': 2.8}   # Å
for g in sorted(set(COLORS)):
    mb = bpy.data.metaballs.new(g)
    mb.resolution = mb.render_resolution = 1.4 * SCALE
    mb.threshold = 0.6
    for (gg, _, _, part), p in centers.items():
        if gg != g:
            continue
        e = mb.elements.new()
        e.co = (p - mid) * SCALE
        e.radius = RADIUS[part] * SCALE * 2.1   # шарики сливаются в гладкую поверхность
    obj = bpy.data.objects.new(g, mb)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    m = bpy.context.object
    m.name = g
    dec = m.modifiers.new('Lighter', 'DECIMATE')
    dec.ratio = 0.3
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for poly in m.data.polygons:
        poly.use_smooth = True
    lib.assign(m, lib.material(g, COLORS[g]))

lib.export('nucleosome_pdb')
lib.report('nucleosome_pdb')
lib.preview('nucleosome_pdb')
