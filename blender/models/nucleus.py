# Ядро в разрезе: двойная ядерная оболочка с порами, хроматин, ядрышко.
# Одна восьмая часть вырезана, чтобы были видны обе мембраны и содержимое.
# Запуск: tools\blender.ps1 blender\models\nucleus.py
import os, sys, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy
from mathutils import Vector
import lib

random.seed(11)
lib.reset()

R = 1.0                       # радиус ядра
CUT = Vector((1, -1, 1))      # вырезанный октант смотрит на камеру превью и приложения


def in_cut(p, margin=0.0):
    return p.x * CUT.x > -margin and p.y * CUT.y > -margin and p.z * CUT.z > -margin


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def cutter():
    bpy.ops.mesh.primitive_cube_add(size=2 * R + 0.4, location=CUT * (R + 0.2))
    c = bpy.context.object
    c.name = 'cutter'
    return c


def membrane(name, radius, thickness, mat):
    # Мембрана — тонкая сферическая оболочка с вырезанным октантом.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=radius)   # без полюсов: вырез не даёт «шипов»
    o = bpy.context.object
    o.name = name
    for p in o.data.polygons:
        p.use_smooth = True
    sol = o.modifiers.new('Solidify', 'SOLIDIFY')
    sol.thickness = thickness
    apply_all(o)
    c = cutter()
    b = o.modifiers.new('Cut', 'BOOLEAN')
    b.operation, b.object, b.solver = 'DIFFERENCE', c, 'EXACT'
    apply_all(o)
    bpy.data.objects.remove(c)
    lib.assign(o, mat)
    return o


membrane('nuc_outer', R, 0.03, lib.material('nuc_outer', 0x9a6bff, alpha=0.3))
membrane('nuc_inner', R - 0.07, 0.025, lib.material('nuc_inner', 0xb89cff, alpha=0.3))

# Ядерные поры — кольца, пронизывающие обе мембраны.
pmat = lib.material('nuc_pore', 0xffd25a)
placed = []
while len(placed) < 70:
    n = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))).normalized()
    if in_cut(n, 0.12) or any((n - q).length < 0.2 for q in placed):
        continue
    placed.append(n)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.055, minor_radius=0.016, major_segments=20, minor_segments=6,
                                     location=n * (R - 0.035))
    t = bpy.context.object
    t.name = f'nuc_pore_{len(placed)}'
    t.rotation_euler = n.to_track_quat('Z', 'Y').to_euler()
    lib.assign(t, pmat)

# Хроматин — тонкие извилистые нити ДНК с белками внутри ядра.
cmat = lib.material('nuc_chromatin', 0x2ec4d0)
for f in range(16):
    p = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))).normalized() * random.uniform(0.2, 0.7)
    d = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))).normalized()
    pts = [p.copy()]
    for _ in range(40):
        d = (d * 0.75 + Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * 0.6).normalized()
        p = p + d * 0.07
        if p.length > R - 0.16:
            p = p.normalized() * (R - 0.16)
            d = (d - p.normalized() * 1.2).normalized()
        pts.append(p.copy())
    curve = bpy.data.curves.new(f'nuc_chromatin_{f}', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 0.012
    curve.bevel_resolution = 0
    curve.resolution_u = 3
    sp = curve.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for bp, q in zip(sp.bezier_points, pts):
        bp.co = q
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(f'nuc_chromatin_{f}', curve)
    bpy.context.scene.collection.objects.link(o)
    curve.materials.append(cmat)

# Ядрышко — плотное бугристое тельце.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.3, location=(-0.25, 0.2, -0.15))
nu = bpy.context.object
nu.name = 'nuc_nucleolus'
for v in nu.data.vertices:
    q = v.co
    v.co = q * (1 + 0.1 * math.sin(q.x * 22) * math.sin(q.y * 19) * math.sin(q.z * 25))
for p in nu.data.polygons:
    p.use_smooth = True
lib.assign(nu, lib.material('nuc_nucleolus', 0xff4fa8))

# Объединяем поры и нити хроматина: меньше объектов — легче телефону.
def join(prefix):
    objs = [o for o in bpy.context.scene.objects if o.name.startswith(prefix)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if objs[0].type == 'CURVE':
        bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = prefix

join('nuc_pore')
join('nuc_chromatin')

lib.export('nucleus')
lib.preview('nucleus')


