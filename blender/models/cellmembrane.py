# Плазматическая мембрана клетки: толстая «стеклянная» оболочка с вырезом спереди сверху.
# Углы выреза скруглены (вырезаем скруглённым кубом), срез стенки — отдельный материал.
# Размеры совпадают с CELL в app/cellmodel.js (в Blender оси: X — вправо, -Y — к зрителю, Z — вверх).
# Запуск: tools\blender.ps1 blender\models\cellmembrane.py
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy
import lib

lib.reset()
shell = lib.material('cell_membrane', 0x6fd3e0, alpha=0.3)
rim = lib.material('cell_membrane_rim', 0x9ff3ff)


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1)
cell = bpy.context.object
cell.name = 'cell_membrane'
cell.scale = (4.3, 3.2, 2.8)
bpy.ops.object.transform_apply(scale=True)
cell.data.materials.append(shell)
cell.data.materials.append(rim)
noise = bpy.data.textures.new('wobble', 'CLOUDS')
noise.noise_scale = 1.6
d = cell.modifiers.new('Wobble', 'DISPLACE')
d.texture, d.strength = noise, 0.12
s = cell.modifiers.new('Wall', 'SOLIDIFY')
s.thickness, s.offset, s.material_offset_rim = 0.16, -1, 1
apply_all(cell)

# Скруглённый куб-вырез: передняя верхняя часть клетки.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -3.6, 3.6))
cut = bpy.context.object
cut.scale = (5.0, 7.2, 7.2)
bpy.ops.object.transform_apply(scale=True)
cut.data.materials.append(rim)
bev = cut.modifiers.new('Round', 'BEVEL')
bev.width, bev.segments = 0.9, 8
apply_all(cut)

b = cell.modifiers.new('Cut', 'BOOLEAN')
b.operation, b.object, b.solver = 'DIFFERENCE', cut, 'EXACT'
b.material_mode = 'TRANSFER'
apply_all(cell)
bpy.data.objects.remove(cut)
for p in cell.data.polygons:
    p.use_smooth = True

lib.export('cellmembrane')
lib.preview('cellmembrane')
