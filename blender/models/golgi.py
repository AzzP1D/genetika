# Комплекс Гольджи по схеме из учебника (рис. 13.2):
# стопка объёмных изогнутых цистерн, разрезанных вдоль — виден просвет с содержимым;
# цис-полюс сверху (выпуклый), к нему подходит пузырёк от ЭПС;
# транс-полюс снизу (вогнутый) — от краёв цистерн отпочковываются пузырьки.
# Модель строится в плоскости XY (Y — вверх, Z — к зрителю), в конце поворачивается для экспорта.
# Запуск: tools\blender.ps1 blender\models\golgi.py
import os, sys, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy, bmesh
from mathutils import Vector, Matrix
import lib

random.seed(13)
lib.reset()

MATS = {name: lib.material(name, color) for name, color in [
    ('golgi_wall', 0xff5f9e),       # наружная стенка цистерн и пузырьков
    ('golgi_lumen', 0xffb0d0),      # просвет
    ('golgi_rim', 0xffe3ef),        # срез стенки
    ('golgi_cargo', 0x8a6bff),      # вещества внутри
    ('er_vesicle', 0x5b8def),       # пузырёк от ЭПС
]}
Z = Vector((0, 0, 1))
cargo = []                          # точки содержимого: (позиция, радиус)


def finish(obj, wall='golgi_wall', inner='golgi_lumen'):
    # Стенка с толщиной: снаружи — wall, внутри — inner, на срезе — rim.
    for n in (wall, inner, 'golgi_rim'):
        obj.data.materials.append(MATS[n])
    s = obj.modifiers.new('Wall', 'SOLIDIFY')
    s.thickness, s.offset = 0.035, -1
    s.material_offset, s.material_offset_rim = 1, 2
    for p in obj.data.polygons:
        p.use_smooth = True
    bpy.context.scene.collection.objects.link(obj)


def cisterna(name, path, T, W, cut=True):
    # Объёмная трубка с эллиптическим сечением (T — толщина, W — глубина) вдоль пути;
    # концы плавно закруглены. Передняя половина (Z > 0) убрана — виден просвет.
    bm = bmesh.new()
    rings = []
    n = len(path)
    seg = 24
    th = [math.pi + math.pi * j / seg for j in range(seg + 1)] if cut else [2 * math.pi * j / seg for j in range(seg)]
    for i, c in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        nrm = Z.cross(t).normalized()
        u = 2 * i / (n - 1) - 1
        s = max(0.0, 1 - abs(u) ** 5) ** 0.3          # закруглённые концы
        rings.append([bm.verts.new(c + nrm * T * s * math.cos(a) + Z * W * s * math.sin(a)) for a in th])
        if cut and abs(u) < 0.9:
            for _ in range(2):                         # содержимое в просвете
                a = random.uniform(math.pi * 1.15, math.pi * 1.85)
                r = random.uniform(0.2, 0.75)
                cargo.append((c + nrm * T * s * r * math.cos(a) + Z * W * s * r * math.sin(a), random.uniform(0.014, 0.024)))
    m = len(th)
    for a, b in zip(rings, rings[1:]):
        for j in range(m - 1 if cut else m):
            k = (j + 1) % m
            bm.faces.new((a[j], b[j], b[k], a[k]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    finish(obj)
    return obj


def vesicle(name, center, r, cut, wall='golgi_wall', with_cargo=True):
    # Пузырёк; если cut — передняя половина убрана и видно содержимое.
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=r, matrix=Matrix.Translation(center))
    if cut:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > center.z + 0.001], context='VERTS')
        if with_cargo:
            for _ in range(int(r * 60)):
                d = Vector((random.uniform(-1, 1), random.uniform(-1, 1), -random.uniform(0.1, 1))).normalized()
                cargo.append((center + d * r * random.uniform(0.2, 0.7), random.uniform(0.012, 0.02)))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    if cut:
        finish(obj, wall)
    else:
        obj.data.materials.append(MATS[wall])
        for p in obj.data.polygons:
            p.use_smooth = True
        bpy.context.scene.collection.objects.link(obj)
    return obj


# Цистерны: сверху (цис) длиннее, вся стопка выгнута куполом — концы опущены.
N = 6
ends = []
for k in range(N):
    t = k / (N - 1)                                   # 0 — нижняя (транс), 1 — верхняя (цис)
    L = 1.0 + 0.55 * t
    y0 = -0.75 + k * 0.29
    bow = 0.32 + 0.1 * t
    pts = []
    for i in range(41):
        x = -L + 2 * L * i / 40
        y = y0 - bow * (x / L) ** 2 + 0.035 * math.sin(3.3 * x + k * 1.3)
        pts.append(Vector((x + 0.06 * math.sin(k * 2.1), y, 0)))
    cisterna(f'golgi_cis_{k}', pts, 0.085 + 0.01 * math.sin(k), 0.42)
    ends.append((pts[0], pts[-1], k))

# Трубочки, отходящие от концов верхних цистерн (цис-сторона).
for i, (a, b, k) in enumerate(ends[-3:]):
    for e, sx in ((a, -1), (b, 1)):
        tip = e + Vector((sx * random.uniform(0.15, 0.3), random.uniform(0.05, 0.25), 0))
        path = [e.lerp(tip, q / 24) + Vector((0, 0.04 * math.sin(q / 24 * math.pi * 1.5), 0)) for q in range(25)]
        cisterna(f'golgi_tube_{i}_{sx}', path, 0.04, 0.05, cut=False)

# Транс-сторона: пузырьки отпочковываются от концов и нижней поверхности нижних цистерн.
for i, (a, b, k) in enumerate(ends[:4]):
    for e, sx in ((a, -1), (b, 1)):
        r = random.uniform(0.11, 0.15)
        vesicle(f'golgi_bud_{k}_{sx}', e + Vector((sx * 0.05, -r * 0.8, 0)), r, cut=(k + (sx > 0)) % 2 == 0)
for i, x in enumerate((-0.55, -0.1, 0.35, 0.75)):
    r = random.uniform(0.12, 0.16)
    vesicle(f'golgi_bud_low_{i}', Vector((x, -0.75 - 0.32 * (x / 1.0) ** 2 - 0.1 - r * 0.7, 0)), r, cut=i % 2 == 1)

# Отделившиеся пузырьки внизу: два в разрезе с содержимым и несколько целых.
for i, p in enumerate([(-0.7, -1.75), (0.6, -1.7), (-0.15, -1.45), (1.05, -1.25), (-1.15, -1.3)]):
    vesicle(f'golgi_free_{i}', Vector((p[0], p[1], 0)), random.uniform(0.13, 0.17), cut=i < 2)

# Цис-полюс: пузырёк от ЭПС сливается с верхней цистерной, ещё один подлетает.
top_mid = Vector((0, -0.75 + (N - 1) * 0.29, 0))
vesicle('er_ves_0', top_mid + Vector((-0.35, 0.12, 0)), 0.13, cut=True, wall='er_vesicle')
vesicle('er_ves_1', top_mid + Vector((-0.1, 0.75, 0)), 0.16, cut=False, wall='er_vesicle')

# Содержимое — один объект из мелких многогранников.
bm = bmesh.new()
for p, r in cargo:
    bmesh.ops.create_icosphere(bm, subdivisions=0, radius=r * 1.15, matrix=Matrix.Translation(p))
mesh = bpy.data.meshes.new('golgi_cargo')
bm.to_mesh(mesh)
bm.free()
obj = bpy.data.objects.new('golgi_cargo', mesh)
obj.data.materials.append(MATS['golgi_cargo'])
bpy.context.scene.collection.objects.link(obj)


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def join(prefixes, name):
    objs = [o for o in bpy.context.scene.objects if o.name.startswith(prefixes)]
    for o in objs:
        apply_all(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name


join(('golgi_cis_', 'golgi_tube_'), 'golgi_stack')
join(('golgi_bud_', 'golgi_free_', 'er_ves_'), 'golgi_vesicles')

# Модель построена «стоя» в плоскости XY; поворачиваем: Y — вверх в Blender (Z), разрез — к зрителю.
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    o.rotation_euler.x = math.radians(90)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(rotation=True)

lib.export('golgi')
lib.preview('golgi')


