# Митохондрия: наружная и внутренняя мембраны, кристы, гранулы матрикса, кольцевая ДНК.
# Запуск: tools\blender.ps1 blender\models\mito.py
import os, sys, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy
import lib

random.seed(4)
lib.reset()

L, R = 1.7, 0.72           # полудлина и радиус митохондрии


def capsule(name, scale, mat, levels=1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    lib.assign(o, mat)
    lib.smooth(o, levels)
    return o


outer = capsule('mito_outer', (L, R, R), lib.material('mito_outer', 0xff6a3d, alpha=0.3))
inner = capsule('mito_inner', (L - 0.1, R - 0.08, R - 0.08), lib.material('mito_inner', 0xffa060, alpha=0.25))

# Кристы — складки внутренней мембраны. Это одна сплошная мембрана: она вдаётся внутрь
# узкими извилистыми «шпильками» то сверху, то снизу и снова возвращается к краю.
# Складка — стенка, профиль которой лежит в плоскости XZ, а по глубине (Y) она
# доходит ровно до внутренней мембраны, поэтому срастается с ней.
import bmesh

cmat = lib.material('mito_cristae', 0xffc27a)
Li, Ri = L - 0.1, R - 0.08


def hz(x, z):
    # Половина глубины складки: насколько внутренняя мембрана «вмещает» её в этой точке.
    return Ri * math.sqrt(max(0.0, 1 - (x / Li) ** 2 - (z / Ri) ** 2))


def hairpin(xc, side, depth, w, wob):
    # Профиль складки: вниз по одной стороне, разворот, вверх по другой.
    edge = side * Ri * math.sqrt(max(0.0, 1 - (xc / Li) ** 2)) * 1.03
    tip = edge - side * depth
    pts = []
    n = 26
    for k in range(n + 1):                      # левая сторона
        t = k / n
        z = edge + (tip - edge) * t
        pts.append((xc - w / 2 + wob * math.sin(t * math.pi * 3.0), z))
    for k in range(1, 12):                      # разворот на конце складки
        a = math.pi * k / 12
        pts.append((xc - w / 2 * math.cos(a) + wob * math.sin(math.pi * 3.0), tip - side * w / 2 * math.sin(a)))
    for k in range(n + 1):                      # правая сторона
        t = 1 - k / n
        z = edge + (tip - edge) * t
        pts.append((xc + w / 2 + wob * math.sin(t * math.pi * 3.0), z))
    return pts


mesh = bpy.data.meshes.new('mito_cristae')
bm = bmesh.new()
n = 8
for i in range(n):
    xc = -Li + 0.42 + i * (2 * Li - 0.84) / (n - 1)
    side = 1 if i % 2 else -1
    span = 2 * Ri * math.sqrt(max(0.0, 1 - (xc / Li) ** 2))
    pts = hairpin(xc, side, span * random.uniform(0.62, 0.72), 0.085, random.uniform(0.045, 0.07))
    ring = []
    for (x, z) in pts:
        h = hz(x, z)
        ring.append((bm.verts.new((x, -h, z)), bm.verts.new((x, h, z))))
    for (a0, a1), (b0, b1) in zip(ring, ring[1:]):
        bm.faces.new((a0, b0, b1, a1))
bm.to_mesh(mesh)
bm.free()
cristae = bpy.data.objects.new('mito_cristae', mesh)
bpy.context.scene.collection.objects.link(cristae)
sol = cristae.modifiers.new('Solidify', 'SOLIDIFY')
sol.thickness, sol.offset = 0.028, 0
sub = cristae.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1
lib.assign(cristae, cmat)
for p in mesh.polygons:
    p.use_smooth = True

# Рибосомы митохондрии в матриксе.
gmat = lib.material('mito_ribosome', 0xfff1a8)
for i in range(26):
    while True:
        p = (random.uniform(-L, L) * 0.85, random.uniform(-R, R) * 0.7, random.uniform(-R, R) * 0.7)
        if (p[0] / (L - 0.25)) ** 2 + (p[1] / (R - 0.2)) ** 2 + (p[2] / (R - 0.2)) ** 2 < 1:
            break
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=random.uniform(0.025, 0.045), location=p)
    g = bpy.context.object
    g.name = f'mito_ribosome_{i}'
    lib.assign(g, gmat)

# Собственная кольцевая ДНК митохондрии.
dmat = lib.material('mito_dna', 0x2ec4d0)
for i, (x, rot) in enumerate([(-0.75, 20), (0.85, -35)]):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.012, major_segments=48, minor_segments=6,
                                     location=(x, 0.18, -0.05), rotation=(math.radians(rot), math.radians(60), 0))
    d = bpy.context.object
    d.name = f'mito_dna_{i}'
    lib.assign(d, dmat)

# Все кристы и гранулы объединяются по материалу — меньше объектов для телефона.
def join(prefix):
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
    objs[0].name = prefix

for prefix in ('mito_ribosome', 'mito_dna'):
    join(prefix)

lib.export('mito')
lib.preview('mito')


