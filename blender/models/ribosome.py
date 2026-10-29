# Рибосома за работой: большая и малая субъединицы, между ними нить иРНК,
# из большой субъединицы выходит растущая цепочка белка (полипептид).
# Запуск: tools\blender.ps1 blender\models\ribosome.py
import os, sys, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy, bmesh
from mathutils import Vector, Matrix
import lib

random.seed(3)
lib.reset()

noise = bpy.data.textures.new('lumpy', 'CLOUDS')
noise.noise_scale = 0.35


def subunit(name, scale, loc, color, strength=0.18):
    # Субъединица — бугристое тельце из РНК и белков.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    d = o.modifiers.new('Lumpy', 'DISPLACE')
    d.texture, d.strength = noise, strength
    for p in o.data.polygons:
        p.use_smooth = True
    lib.assign(o, lib.material(name, color))
    return o


big = subunit('ribo_large', (1.0, 0.8, 0.72), (0, 0, -0.42), 0xf2a65a)
small = subunit('ribo_small', (0.86, 0.62, 0.42), (0.05, 0, 0.52), 0xffd08a, 0.14)

# Нить иРНК проходит в щели между субъединицами.
pts = [Vector((x, 0.05 * math.sin(x * 2.5), 0.12 + 0.05 * math.sin(x * 3.1))) for x in [i / 10 - 2.2 for i in range(45)]]
curve = bpy.data.curves.new('ribo_mrna', 'CURVE')
curve.dimensions = '3D'
curve.bevel_depth = 0.045
curve.bevel_resolution = 2
sp = curve.splines.new('POLY')
sp.points.add(len(pts) - 1)
for p, q in zip(sp.points, pts):
    p.co = (q.x, q.y, q.z, 1)
curve.materials.append(lib.material('ribo_mrna', 0xff4fd8))
mrna = bpy.data.objects.new('ribo_mrna', curve)
bpy.context.scene.collection.objects.link(mrna)

# Растущая цепочка белка — бусины аминокислот, выходящие из большой субъединицы.
bm = bmesh.new()
p = Vector((0.45, -0.5, -0.75))
d = Vector((0.7, -0.6, -0.4)).normalized()
for i in range(20):
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.085, matrix=Matrix.Translation(p))
    d = (d + Vector((random.uniform(-0.6, 0.6), random.uniform(-0.6, 0.2), random.uniform(-0.6, 0.4)))).normalized()
    p = p + d * 0.15
mesh = bpy.data.meshes.new('ribo_peptide')
bm.to_mesh(mesh)
bm.free()
pep = bpy.data.objects.new('ribo_peptide', mesh)
bpy.context.scene.collection.objects.link(pep)
pep.data.materials.append(lib.material('ribo_peptide', 0x7cff9b))
for f in pep.data.polygons:
    f.use_smooth = True

bpy.context.view_layer.objects.active = mrna
mrna.select_set(True)
bpy.ops.object.convert(target='MESH')

lib.export('ribosome')
lib.preview('ribosome')

