# ЭПС вокруг ядра, по учебной иллюстрации:
# шероховатая ЭПС — слои плоских мешочков-цистерн вокруг ядра (радиус ядра = 1) с толстыми стенками,
# видимым просветом на срезах, окнами-отверстиями, складками-перемычками между слоями и рибосомами;
# первый слой соединён с наружной мембраной ядра. Сбоку — гладкая ЭПС: сросшиеся ветвящиеся трубочки.
# Спереди (к зрителю, −Y) оставлен проём — через него видно ядро.
# Запуск: tools\blender.ps1 blender\models\er_nuclear.py
import os, sys, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion
import lib

random.seed(31)
lib.reset()

wall = lib.material('er_rough', 0xd03a6e)
lumen = lib.material('er_lumen', 0xffc2d6)
ribo = lib.material('er_ribosome', 0xffb25a)
smooth = lib.material('er_smooth', 0xff9a6b)

LAYERS = [1.1, 1.24, 1.38]          # радиусы цистерн
GAP = 1.9                           # ширина проёма спереди (рад)
PHI0 = -math.pi / 2 + GAP / 2       # проём центрирован на −Y
SPAN = 2 * math.pi - GAP


def point(r, phi, th):
    return Vector((r * math.sin(th) * math.cos(phi), r * math.sin(th) * math.sin(phi), r * math.cos(th)))


def radius(k, phi, th):
    return LAYERS[k] * (1 + 0.022 * math.sin(7 * phi + 2 * k) + 0.012 * math.sin(5 * th + k))


def edges(k, phi):
    # Верхний и нижний край цистерны неровные.
    return 0.62 + 0.12 * math.sin(3 * phi + k) + 0.05 * math.sin(9 * phi), 2.5 + 0.1 * math.sin(4 * phi + 2 * k) + 0.05 * math.cos(8 * phi)


# Окна (фенестры) в цистернах — круглые отверстия в случайных местах каждого слоя.
HOLE_R = 0.1
HOLES = [[(PHI0 + random.uniform(0.15, SPAN - 0.15), random.uniform(1.0, 2.2)) for _ in range(9)] for _ in LAYERS]


def hole_dist(k, phi, th):
    # Расстояние до ближайшего окна в «развёртке» слоя (по долготе учитываем сужение к полюсам).
    best = (9.0, 0.0, 0.0)
    for hp, ht in HOLES[k]:
        dp, dt = (phi - hp) * math.sin(th), th - ht
        d = math.hypot(dp, dt)
        if d < best[0]:
            best = (d, dp, dt)
    return best


def hole(k, phi, th):
    return hole_dist(k, phi, th)[0] < HOLE_R


def snap(k, phi, th):
    # Вершины возле окна подтягиваются точно на его край — отверстие получается круглым.
    d, dp, dt = hole_dist(k, phi, th)
    if HOLE_R * 0.45 < d < HOLE_R * 1.35:
        sc = HOLE_R / d
        return phi - dp / max(math.sin(th), 0.2) + dp * sc / max(math.sin(th), 0.2), th - dt + dt * sc
    return phi, th


def finish(o, mats, thick):
    for m in mats:
        o.data.materials.append(m)
    s = o.modifiers.new('Wall', 'SOLIDIFY')
    s.thickness, s.offset = thick, 0
    s.material_offset_rim = 1
    for p in o.data.polygons:
        p.use_smooth = True
    bpy.context.scene.collection.objects.link(o)


def sheet(name, k, p0, p1):
    # Цистерна-дуга на слое k между углами p0 и p1.
    bm = bmesh.new()
    nu = max(4, int((p1 - p0) / 0.06)); nv = 26
    grid = []
    for i in range(nu + 1):
        phi = p0 + (p1 - p0) * i / nu
        t0, t1 = edges(k, phi)
        grid.append([(phi, t0 + (t1 - t0) * j / nv) for j in range(nv + 1)])
    verts = [[bm.verts.new(point(radius(k, *snap(k, ph, th)), *snap(k, ph, th))) for ph, th in row] for row in grid]
    for i in range(nu):
        for j in range(nv):
            ph = (grid[i][j][0] + grid[i + 1][j + 1][0]) / 2
            th = (grid[i][j][1] + grid[i + 1][j + 1][1]) / 2
            if hole(k, ph, th):
                continue
            bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    finish(bpy.data.objects.new(name, mesh), (wall, lumen), 0.055)


def fold(name, r0, r1, phi, k):
    # Складка-перемычка между слоями: радиальная стенка — полости соседних цистерн сообщаются.
    bm = bmesh.new()
    t0, t1 = edges(k, phi)
    t0 += 0.25; t1 -= 0.3
    rows = []
    for i in range(5):
        r = r0 + (r1 - r0) * i / 4
        rows.append([bm.verts.new(point(r, phi + 0.02 * math.sin(i), t0 + (t1 - t0) * j / 18)) for j in range(19)])
    for i in range(4):
        for j in range(18):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    finish(bpy.data.objects.new(name, mesh), (wall, lumen), 0.05)


# Слои цистерн: каждый разбит на 3 дуги, в разрывах — складки к соседнему слою.
n = 0
for k in range(len(LAYERS)):
    cuts = [PHI0 + SPAN * f for f in (0, 0.33 + 0.04 * k, 0.67 - 0.03 * k, 1)]
    for a, b in zip(cuts, cuts[1:]):
        sheet(f'er_sheet_{n}', k, a + 0.04, b - 0.04)
        n += 1
    if k + 1 < len(LAYERS):
        for c in cuts[1:-1]:
            fold(f'er_fold_{k}_{c:.2f}', LAYERS[k], LAYERS[k + 1], c + 0.06 * (k + 1), k)
# Связь с ядром: складки от наружной мембраны ядра к первому слою.
for i in range(5):
    fold(f'er_fold_n{i}', 1.0, LAYERS[0], PHI0 + 0.3 + i * (SPAN - 0.6) / 4, 0)

# Рибосомы — на наружных и внутренних поверхностях цистерн.
bm = bmesh.new()
for _ in range(750):
    k = random.randrange(len(LAYERS))
    phi = PHI0 + random.uniform(0.05, SPAN - 0.05)
    t0, t1 = edges(k, phi)
    th = random.uniform(t0 + 0.03, t1 - 0.03)
    if hole(k, phi, th):
        continue
    r = radius(k, phi, th) + random.choice((-1, 1)) * 0.045
    bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.016, matrix=Matrix.Translation(point(r, phi, th)))
mesh = bpy.data.meshes.new('er_ribosome')
bm.to_mesh(mesh)
bm.free()
rib = bpy.data.objects.new('er_ribosome', mesh)
rib.data.materials.append(ribo)
bpy.context.scene.collection.objects.link(rib)

# Гладкая ЭПС — сросшиеся ветвящиеся трубочки (метаболы сливаются в «живую» сеть).
mb = bpy.data.metaballs.new('er_smooth')
mb.resolution = mb.render_resolution = 0.045
mb.threshold = 0.5
nodes = []
while len(nodes) < 16:
    phi = math.pi + random.uniform(-0.75, 0.55)
    th = random.uniform(1.45, 2.45)
    q = point(random.uniform(1.55, 2.15), phi, th)
    if all((q - o).length > 0.2 for o in nodes):
        nodes.append(q)
starts = [point(LAYERS[-1] + 0.03, math.pi + random.uniform(-0.5, 0.4), random.uniform(1.6, 2.3)) for _ in range(4)]
links = set()
for i, q in enumerate(nodes):
    for j in sorted(range(len(nodes)), key=lambda j: (nodes[j] - q).length)[1:3]:
        links.add((min(i, j), max(i, j)))
segs = [(nodes[i], nodes[j]) for i, j in links] + [(s, min(nodes, key=lambda q: (q - s).length)) for s in starts]
for a, b in segs:
    d = b - a
    e = mb.elements.new(type='CAPSULE')
    e.co = (a + b) / 2
    e.radius = 0.12
    e.size_x = d.length / 2
    e.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())
for q in nodes:
    e = mb.elements.new(type='BALL')
    e.co = q
    e.radius = 0.16
sm = bpy.data.objects.new('er_smooth', mb)
bpy.context.scene.collection.objects.link(sm)
sm.data.materials.append(smooth)
bpy.context.view_layer.objects.active = sm
sm.select_set(True)
bpy.ops.object.convert(target='MESH')
sm = bpy.context.view_layer.objects.active
sm.name = 'er_smooth'
for p in sm.data.polygons:
    p.use_smooth = True


def join(prefix, name):
    objs = [o for o in bpy.context.scene.objects if o.name.startswith(prefix)]
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name


join(('er_sheet_', 'er_fold_'), 'er_rough')

lib.export('er_nuclear')
lib.report('er_nuclear')
lib.preview('er_nuclear')

