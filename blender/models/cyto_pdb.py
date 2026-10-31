# Кирпичики цитоскелета по экспериментальным данным банка белков RCSB PDB (данные — CC0):
#   α- и β-тубулин — димер из структуры 1JFF (Löwe et al., 2001, электронная кристаллография);
#   актин — молекула из структуры 1J6Z (Otterbein et al., 2001, рентгеноструктурный анализ);
#   головка кинезина (моторный домен, цепь A) — из структуры 3KIN (Kozielski et al., 1997).
# Как и у нуклеосомы: по шарику на аминокислоту, шарики сливаются в гладкую поверхность.
# Единица модели — 1 нм. Димер тубулина повёрнут так, что его длинная ось — вверх (ось Y
# приложения), β-тубулин сверху (к плюс-концу микротрубочки), центр димера в начале координат.
# Нити из этих кирпичиков собирает приложение (cytoskeleton.js) по известной геометрии.
# Запуск: tools\blender.ps1 blender\models\cyto_pdb.py
import os, sys, re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy
from mathutils import Vector, Matrix
import lib

lib.reset()
SCALE = 0.1   # 1 Å = 0,1 нм


def residues(name, entities, chain=None):
    # Центры аминокислот из mmCIF: {сущность: [координаты в Å]}; chain — взять только эту цепь
    cols, rows = [], []
    tok = re.compile(r"'[^']*'|\"[^\"]*\"|\S+")
    with open(os.path.join(lib.ROOT, 'models_raw', 'pdb', name + '.cif'), encoding='utf-8') as f:
        for line in f:
            if line.startswith('_atom_site.'):
                cols.append(line.split('.', 1)[1].strip())
            elif cols and line.startswith('ATOM'):
                rows.append(tok.findall(line))
            elif cols and rows and line.startswith('#'):
                break
    c = {n: i for i, n in enumerate(cols)}
    res = {}
    for r in rows:
        e = r[c['label_entity_id']]
        if e not in entities or r[c['type_symbol']] == 'H' or r[c['label_alt_id']] not in ('.', 'A'):
            continue
        if chain and r[c['label_asym_id']] != chain:
            continue
        p = Vector((float(r[c['Cartn_x']]), float(r[c['Cartn_y']]), float(r[c['Cartn_z']])))
        res.setdefault((e, r[c['label_asym_id']], r[c['label_seq_id']]), []).append(p)
    out = {}
    for (e, _, _), v in res.items():
        out.setdefault(e, []).append(sum(v, Vector()) / len(v))
    return out


def frame(points, up_hint=None):
    # Главные оси облака точек (метод главных компонент): самая длинная — первая.
    n = len(points)
    m = sum(points, Vector()) / n
    cov = [[0.0] * 3 for _ in range(3)]
    for p in points:
        d = p - m
        for i in range(3):
            for j in range(3):
                cov[i][j] += d[i] * d[j] / n
    # Степенной метод для трёх осей по очереди.
    axes = []
    M = Matrix(cov)
    for _ in range(3):
        v = Vector((1, 0.3, 0.2))
        for _ in range(200):
            v = M @ v
            for a in axes:
                v -= a * v.dot(a)
            v.normalize()
        axes.append(v)
    if up_hint is not None and axes[0].dot(up_hint) < 0:
        axes[0] = -axes[0]
    axes[2] = axes[0].cross(axes[1])
    return m, axes


def blob(name, points, center, axes, color, target=420):
    # Поверхность из метаболов в собственной системе координат (оси → X, Y, Z приложения).
    mb = bpy.data.metaballs.new(name)
    mb.resolution = mb.render_resolution = 0.55
    mb.threshold = 0.6
    for p in points:
        d = (p - center) * SCALE
        x, y, z = d.dot(axes[1]), d.dot(axes[0]), d.dot(axes[2])   # длинная ось — вверх (Y)
        e = mb.elements.new()
        e.co = (x, -z, y)                                         # Blender: Z вверх, −Y к зрителю
        e.radius = 0.34 * 2.1
    obj = bpy.data.objects.new(name, mb)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    m = bpy.context.object
    m.name = name
    dec = m.modifiers.new('Lighter', 'DECIMATE')
    dec.ratio = min(1.0, target / max(1, len(m.data.polygons)))
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for poly in m.data.polygons:
        poly.use_smooth = True
    lib.assign(m, lib.material(name, color))
    return m


# --- тубулин: димер α (сущность 1) + β (сущность 2) в общей системе координат ---
tub = residues('1JFF', {'1', '2'})
alpha, beta = tub['1'], tub['2']
ca = sum(alpha, Vector()) / len(alpha)
cb = sum(beta, Vector()) / len(beta)
center, axes = frame(alpha + beta, up_hint=cb - ca)      # β — к плюс-концу, вверх
print('OK тубулин: остатков', len(alpha), '+', len(beta), ', длина димера, нм:', round((cb - ca).length * SCALE * 2, 1))
blob('tub_alpha', alpha, center, axes, 0x2fae4a)
blob('tub_beta', beta, center, axes, 0x7dff5a)

# --- актин: одна молекула, центр в начале координат ---
act = residues('1J6Z', {'1'})['1']
c_act, ax_act = frame(act)
print('OK актин: остатков', len(act))
blob('actin_mono', act, c_act, ax_act, 0xff2b4a, target=380)

# --- кинезин: одна головка (моторный домен) ---
kin = residues('3KIN', {'1'}, chain='A')['1']
c_kin, ax_kin = frame(kin)
print('OK кинезин: остатков', len(kin))
blob('kin_head', kin, c_kin, ax_kin, 0x00e5ff, target=380)

lib.export('cyto_pdb')
lib.report('cyto_pdb')
lib.preview('cyto_pdb')
