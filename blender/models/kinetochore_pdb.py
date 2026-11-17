# Детали кинетохора по экспериментальным данным банка белков RCSB PDB (данные — CC0):
#   3IZ0 — комплекс Ndc80 на микротрубочке (Alushin et al., 2010, криоэлектронная микроскопия):
#          тубулин в решётке микротрубочки и головка Ndc80 в том положении, в каком она его держит;
#   2VE7 — комплекс Ndc80, укороченный «бонсай» (Ciferri et al., 2008): отсюда ножка Spc24–Spc25;
#   5LSK — комплекс Mis12 с пептидом CENP-C (Petrovic et al., 2016);
#   7R5S — внутренний кинетохор CCAN на ДНК (Yatskevich et al., 2022);
#   3AN2 — центромерная нуклеосома с CENP-A (Tachiwana et al., 2011);
#   1GO4 — Mad1–Mad2 (Sironi et al., 2002);  4AEZ — комплекс контрольной точки MCC (Chao et al., 2012).
# Как у нуклеосомы и цитоскелета: шарик на аминокислоту (два на нуклеотид), шарики сливаются
# в гладкую поверхность. Единица модели — 1 нм. Каждая деталь лежит в начале координат в своей
# системе отсчёта (описана у детали); кинетохор из деталей собирает приложение (mitokinet.js).
# Запуск: tools\blender.ps1 blender\models\kinetochore_pdb.py
import os, sys, re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy
from mathutils import Vector, Matrix
import lib

lib.reset()
NM = 0.1   # 1 Å = 0,1 нм
BACKBONE = {'P', 'OP1', 'OP2', "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'", "C1'"}
DNA = {'DA', 'DT', 'DG', 'DC'}


def beads(name):
    # Шарики структуры: [(сущность, цепь, номер остатка, вид, точка в нм)], вид — res / bb / base.
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
    groups = {}
    for r in rows:
        if r[c['type_symbol']] == 'H' or r[c['label_alt_id']] not in ('.', 'A'):
            continue
        if 'pdbx_PDB_model_num' in c and r[c['pdbx_PDB_model_num']] != '1':
            continue
        kind = 'res'
        if r[c['label_comp_id']] in DNA:
            kind = 'bb' if r[c['label_atom_id']].strip('"') in BACKBONE else 'base'
        p = Vector((float(r[c['Cartn_x']]), float(r[c['Cartn_y']]), float(r[c['Cartn_z']]))) * NM
        groups.setdefault((r[c['label_entity_id']], r[c['label_asym_id']], int(r[c['label_seq_id']]), kind), []).append(p)
    return [(e, ch, seq, kind, sum(v, Vector()) / len(v)) for (e, ch, seq, kind), v in groups.items()]


def mean(points):
    return sum(points, Vector()) / len(points)


def axes_of(points, up_hint=None):
    # Главные оси облака точек: первая — самая длинная.
    m = mean(points)
    cov = [[0.0] * 3 for _ in range(3)]
    for p in points:
        d = p - m
        for i in range(3):
            for j in range(3):
                cov[i][j] += d[i] * d[j] / len(points)
    M, axes = Matrix(cov), []
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
    return axes


class Frame:
    # Система отсчёта детали: начало и оси X, Y, Z приложения (Y — вверх).
    def __init__(self, origin, x, y):
        self.o, self.y = origin, y.normalized()
        self.x = (x - self.y * x.dot(self.y)).normalized()
        self.z = self.x.cross(self.y)

    def to(self, p):
        d = p - self.o
        return Vector((d.dot(self.x), d.dot(self.y), d.dot(self.z)))

    def turn(self, v):
        return Vector((v.dot(self.x), v.dot(self.y), v.dot(self.z)))


RADIUS = {'res': 0.714, 'bb': 0.67, 'base': 0.59}
made = []


def blob(name, items, frame, color, target, resolution=0.6):
    # Гладкая поверхность из шариков items = [(вид, точка)] в системе отсчёта frame.
    mb = bpy.data.metaballs.new(name)
    mb.resolution = mb.render_resolution = resolution
    mb.threshold = 0.6
    for kind, p in items:
        q = frame.to(p)
        e = mb.elements.new()
        e.co = (q.x, -q.z, q.y)            # Blender: Z вверх, −Y к зрителю
        e.radius = RADIUS[kind]
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
    m.data.validate()                  # после упрощения сетки убираем вырожденные грани
    for poly in m.data.polygons:
        poly.use_smooth = True
    lib.assign(m, lib.material(name, color))
    made.append(m)
    print('OK деталь', name, 'шариков', len(items), 'граней', len(m.data.polygons))
    return m


def fmt(v):
    return '[' + ', '.join('%.2f' % x for x in v) + ']'


# ---------- 1. Тубулин в решётке микротрубочки и головка Ndc80 на нём (3IZ0) ----------
# Система отсчёта димера: начало — центр димера, Y — вдоль микротрубочки к плюс-концу
# (β-тубулин сверху), X — наружу от оси микротрубочки.
b = beads('3IZ0')
alpha = [p for e, ch, s, k, p in b if ch == 'A']
beta = [p for e, ch, s, k, p in b if ch == 'B']
ca, cb = mean(alpha), mean(beta)
center = mean(alpha + beta)
# Ось микротрубочки в файле: ищем среди осей координат ту, вдоль которой лежит димер.
along = cb - ca
axis = max((Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))), key=lambda a: abs(a.dot(along)))
if axis.dot(along) < 0:
    axis = -axis
radial = center - axis * center.dot(axis)
print('OK 3IZ0: димер вдоль оси', fmt(axis), 'длина α→β, нм: %.2f' % along.length, 'центр от оси, нм: %.2f' % radial.length)
ndc = [(e, ch, s, p) for e, ch, s, k, p in b if ch in ('C', 'D', 'E', 'F')]
# Если ось файла не проходит через начало координат, «наружу» — это в сторону Ndc80.
out_hint = mean([p for e, ch, s, p in ndc]) - center
if radial.length < 6 or radial.length > 16 or radial.dot(out_hint) < 0:
    radial = out_hint - axis * out_hint.dot(axis)
    print('OK 3IZ0: ось не в начале координат — «наружу» взято по положению Ndc80')
dimer = Frame(center, radial, axis)
blob('kt_tub_alpha', [('res', p) for p in alpha], dimer, 0x2fae4a, 170, 0.75)
blob('kt_tub_beta', [('res', p) for p in beta], dimer, 0x7dff5a, 170, 0.75)

# Два комплекса Ndc80 на одном димере: выбираем пары цепей (Ndc80-химера + Nuf2-химера).
chains = {}
for e, ch, s, p in ndc:
    chains.setdefault(ch, []).append((s, p))
pairs = []
for big in ('C', 'E'):
    small = min(('D', 'F'), key=lambda ch: (mean([p for s, p in chains[ch]]) - mean([p for s, p in chains[big]])).length)
    pairs.append((big, small))
for big, small in pairs:
    pts = [p for s, p in chains[big] + chains[small]]
    print('OK Ndc80', big + small, 'остатков', len(pts), 'центр в системе димера:', fmt(dimer.to(mean(pts))))
# Берём комплекс, который ближе к центру димера по высоте (внутри димера), как образец.
big, small = min(pairs, key=lambda pr: abs(dimer.to(mean([p for s, p in chains[pr[0]] + chains[pr[1]]])).y))
rod = [p for s, p in chains[big] + chains[small]]
rod_axis = axes_of(rod, up_hint=mean(rod) - center)[0]          # вдоль комплекса, от микротрубочки
proj = [(p - mean(rod)).dot(rod_axis) for p in rod]
print('OK Ndc80-бонсай: длина вдоль оси, нм: %.1f' % (max(proj) - min(proj)), 'ось в системе димера:', fmt(dimer.turn(rod_axis)))
# В 3IZ0 от комплекса есть только головка: домены CH белков Ndc80 и Nuf2 и начало двойной спирали.
# Шея — дальний от микротрубочки конец: оттуда у настоящего белка отходит длинная двойная
# спираль (её строит приложение), а на другом её конце — ножка из Spc24 и Spc25.
hi = max(proj)
neck = mean([p for p, t in zip(rod, proj) if t > hi - 0.9])
blob('kt_ndc80_head', [('res', p) for p in rod], dimer, 0xff4fa3, 420)
print('OK Ndc80: шея (откуда отходит спираль) в системе димера:', fmt(dimer.to(neck)), 'центр головки:', fmt(dimer.to(mean(rod))))

# Ножка — глобулярные домены Spc24 и Spc25 из «бонсай»-комплекса 2VE7 (Ciferri et al., 2008):
# в химерных цепях это остатки после 215-го (Ndc80–Spc25) и после 175-го (Nuf2–Spc24).
# Своя система: начало — там, где в ножку входит двойная спираль, Y — к дальнему концу ножки.
b = beads('2VE7')
whole = [p for e, ch, s, k, p in b if ch in ('A', 'C')]
foot = [p for e, ch, s, k, p in b if (ch == 'A' and s > 215) or (ch == 'C' and s > 175)]
fa = axes_of(whole, up_hint=mean(foot) - mean(whole))
fp = [(p - mean(whole)).dot(fa[0]) for p in foot]
start = mean([p for p, t in zip(foot, fp) if t < min(fp) + 0.9])
foot_frame = Frame(start, fa[1], fa[0])
blob('kt_ndc80_foot', [('res', p) for p in foot], foot_frame, 0xff9a3d, 300)
wp = [(p - mean(whole)).dot(fa[0]) for p in whole]
print('OK Ndc80-бонсай 2VE7: длина, нм: %.1f' % (max(wp) - min(wp)), 'ножка, остатков', len(foot), 'длина, нм: %.1f' % max(foot_frame.to(p).y for p in foot))

# ---------- 2. Комплекс Mis12 с пептидом CENP-C (5LSK) ----------
# Своя система: начало — центр, Y — вдоль комплекса.
b = beads('5LSK')
pts = [p for e, ch, s, k, p in b if ch in 'ABCDE']
ax = axes_of(pts)
f = Frame(mean(pts), ax[1], ax[0])
blob('kt_mis12', [('res', p) for p in pts], f, 0xffd23f, 420)
ys = [f.to(p).y for p in pts]
print('OK Mis12: длина, нм: %.1f' % (max(ys) - min(ys)))

# ---------- 3. Внутренний кинетохор CCAN на ДНК (7R5S) ----------
b = beads('7R5S')
SUB = {'1': 'hikm', '2': 'hikm', '4': 'hikm', '6': 'hikm', '5': 'ln', '7': 'ln',
       '8': 'opqur', '9': 'opqur', '10': 'opqur', '11': 'opqur', '12': 'opqur',
       '13': 'twsx', '14': 'twsx', '15': 'twsx', '16': 'twsx', '3': 'dna', '17': 'dna'}
pts = [p for e, ch, s, k, p in b if e in SUB]
ax = axes_of(pts)
f = Frame(mean(pts), ax[1], ax[0])
for sub, color, target in (('hikm', 0x4d8dff, 420), ('ln', 0x8f7bff, 260), ('opqur', 0x3fd0ff, 420), ('twsx', 0xb7a4ff, 260), ('dna', 0x00e5ff, 300)):
    blob('kt_ccan_' + sub, [(k, p) for e, ch, s, k, p in b if SUB.get(e) == sub], f, color, target, 0.7)
size = [max(f.to(p)[i] for p in pts) - min(f.to(p)[i] for p in pts) for i in range(3)]
print('OK CCAN: размеры, нм:', fmt(size))

# ---------- 4. Центромерная нуклеосома с CENP-A (3AN2) ----------
# Своя система: начало — центр, Y — ось «катушки» (вдоль неё нуклеосома самая тонкая).
b = beads('3AN2')
pts = [p for e, ch, s, k, p in b]
ax = axes_of(pts)
f = Frame(mean(pts), ax[0], ax[2])
blob('kt_nuc_cenpa', [(k, p) for e, ch, s, k, p in b if e == '1'], f, 0xff3b5c, 220, 0.7)
blob('kt_nuc_histone', [(k, p) for e, ch, s, k, p in b if e in ('2', '3', '4')], f, 0x9b4dff, 360, 0.7)
blob('kt_nuc_dna', [(k, p) for e, ch, s, k, p in b if e == '5'], f, 0x00e5ff, 420, 0.7)

# ---------- 5. Mad1–Mad2 (1GO4): два Mad1 и два Mad2 ----------
b = beads('1GO4')
by = {}
for e, ch, s, k, p in b:
    by.setdefault((e, ch), []).append(p)
mad1 = sorted([ch for (e, ch) in by if e == '2'])
mad2 = sorted([ch for (e, ch) in by if e == '1'])
pair = min(((a, c) for a in mad1 for c in mad1 if a < c), key=lambda pr: (mean(by[('2', pr[0])]) - mean(by[('2', pr[1])])).length)
core = mean(by[('2', pair[0])] + by[('2', pair[1])])
near = sorted(mad2, key=lambda ch: (mean(by[('1', ch)]) - core).length)[:2]
pts = by[('2', pair[0])] + by[('2', pair[1])] + by[('1', near[0])] + by[('1', near[1])]
ax = axes_of(pts)
f = Frame(mean(pts), ax[1], ax[0])
blob('kt_mad1', [('res', p) for ch in pair for p in by[('2', ch)]], f, 0x39ff8a, 300)
blob('kt_mad2', [('res', p) for ch in near for p in by[('1', ch)]], f, 0xe8ff00, 260)
print('OK Mad1–Mad2: цепи Mad1', pair, 'Mad2', near)

# ---------- 6. Комплекс контрольной точки MCC (4AEZ): Cdc20, Mad2, BubR1 (у дрожжей Mad3) ----------
b = beads('4AEZ')
pts = [p for e, ch, s, k, p in b if ch in 'ABC']
ax = axes_of(pts)
f = Frame(mean(pts), ax[1], ax[0])
blob('kt_mcc_cdc20', [('res', p) for e, ch, s, k, p in b if ch == 'A'], f, 0xff5e3a, 320)
blob('kt_mcc_mad2', [('res', p) for e, ch, s, k, p in b if ch == 'B'], f, 0xe8ff00, 200)
blob('kt_mcc_bubr1', [('res', p) for e, ch, s, k, p in b if ch == 'C'], f, 0xc04bff, 240)

lib.export('kinetochore_pdb')
lib.report('kinetochore_pdb')

# Для картинки-превью раскладываем детали в ряд (в файле модели они все в начале координат).
ROW = [['kt_tub_alpha', 'kt_tub_beta', 'kt_ndc80_head'], ['kt_ndc80_foot'], ['kt_mis12'],
       ['kt_ccan_hikm', 'kt_ccan_ln', 'kt_ccan_opqur', 'kt_ccan_twsx', 'kt_ccan_dna'],
       ['kt_nuc_cenpa', 'kt_nuc_histone', 'kt_nuc_dna'], ['kt_mad1', 'kt_mad2'], ['kt_mcc_cdc20', 'kt_mcc_mad2', 'kt_mcc_bubr1']]
for i, names in enumerate(ROW):
    for n in names:
        bpy.data.objects[n].location = ((i % 4 - 1.5) * 16, 0, (0.5 - i // 4) * 18)
lib.preview('kinetochore_pdb', 1100)
