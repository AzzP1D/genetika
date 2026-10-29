# Лизосома в разрезе: пузырёк, окружённый одной мембраной; внутри — ферменты
# (бугристые белки) и частично переваренные частицы. Одна восьмая вырезана.
# Запуск: tools\blender.ps1 blender\models\lysosome.py
import os, sys, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy, bmesh
from mathutils import Vector, Matrix
import lib

random.seed(9)
lib.reset()

R = 1.0
CUT = Vector((1, -1, 1))
noise = bpy.data.textures.new('lumpy', 'CLOUDS')
noise.noise_scale = 0.3


def in_cut(p, margin=0.0):
    return p.x * CUT.x > -margin and p.y * CUT.y > -margin and p.z * CUT.z > -margin


# Мембрана: оболочка без полюсов (икосфера), октант вырезан — удаляем вершины, затем даём толщину.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=R)
mem = bpy.context.object
mem.name = 'lyso_membrane'
bm = bmesh.new()
bm.from_mesh(mem.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if in_cut(v.co, -0.02)], context='VERTS')
bm.to_mesh(mem.data)
bm.free()
s = mem.modifiers.new('Wall', 'SOLIDIFY')
s.thickness, s.offset = 0.04, -1
for p in mem.data.polygons:
    p.use_smooth = True
lib.assign(mem, lib.material('lyso_membrane', 0xb98cff, alpha=0.3))

# Ферменты — бугристые белки внутри.
emat = lib.material('lyso_enzyme', 0xff6fd2)
placed = []
while len(placed) < 26:
    q = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * (R - 0.22)
    if q.length > R - 0.2 or any((q - o).length < 0.22 for o in placed):
        continue
    placed.append(q)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=random.uniform(0.07, 0.11), location=q)
    e = bpy.context.object
    e.name = f'lyso_enzyme_{len(placed)}'
    d = e.modifiers.new('Lumpy', 'DISPLACE')
    d.texture, d.strength = noise, 0.04
    for f in e.data.polygons:
        f.use_smooth = True
    lib.assign(e, emat)

# Частицы, которые переваривает лизосома: неровные обломки.
dmat = lib.material('lyso_debris', 0x9be7a0)
for i in range(5):
    q = Vector((random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4)))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=random.uniform(0.12, 0.18), location=q)
    o = bpy.context.object
    o.name = f'lyso_debris_{i}'
    o.scale = (random.uniform(0.7, 1.3), random.uniform(0.6, 1.0), random.uniform(0.7, 1.2))
    d = o.modifiers.new('Lumpy', 'DISPLACE')
    d.texture, d.strength = noise, 0.08
    for f in o.data.polygons:
        f.use_smooth = True
    lib.assign(o, dmat)


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


join('lyso_enzyme')
join('lyso_debris')

lib.export('lysosome')
lib.preview('lysosome')

