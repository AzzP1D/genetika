# Проверочная модель: митохондрия с кристами.
# Запуск: tools\blender.ps1 blender\models\test_mito.py
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy
import lib

lib.reset()

outer_mat = lib.material('mito_outer', 0xf06b4f, 0.4, alpha=0.35)
inner_mat = lib.material('mito_cristae', 0xffb08a, 0.5)
matrix_mat = lib.material('mito_matrix', 0x8a2f2a, 0.7)

# Наружная мембрана — вытянутая капсула.
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
outer = bpy.context.object
outer.name = 'mito_outer'
outer.scale = (1.7, 0.75, 0.75)
lib.assign(outer, outer_mat)
lib.smooth(outer, 1)

# Матрикс — внутреннее содержимое.
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
inner = bpy.context.object
inner.name = 'mito_matrix'
inner.scale = (1.55, 0.62, 0.62)
lib.assign(inner, matrix_mat)
lib.smooth(inner, 1)

# Кристы — складки внутренней мембраны, поочерёдно сверху и снизу.
for i in range(7):
    x = -1.05 + i * 0.35
    bpy.ops.mesh.primitive_cube_add(size=1)
    c = bpy.context.object
    c.name = f'mito_crista_{i}'
    c.scale = (0.06, 0.95, 0.6)
    c.location = (x, 0, 0.18 if i % 2 else -0.18)
    bev = c.modifiers.new('Bevel', 'BEVEL')
    bev.width, bev.segments = 0.25, 3
    lib.assign(c, inner_mat)
    for p in c.data.polygons:
        p.use_smooth = True

lib.export('test_mito')
lib.preview('test_mito')
