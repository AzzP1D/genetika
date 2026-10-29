# Центриоли: пара полых цилиндров под прямым углом. Стенка каждого — 9 триплетов
# микротрубочек (9×3), наклонённых, как лопасти; соседние триплеты связаны перемычками.
# Микротрубочки полые — на торце видны кольца, как на поперечном разрезе.
# Запуск: tools\blender.ps1 blender\models\centrioles.py
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy, bmesh
from mathutils import Vector, Matrix
import lib

lib.reset()
tube_mat = lib.material('centriole_tube', 0xc9d6ff)
link_mat = lib.material('centriole_link', 0x8fa8ff)

R = 0.42          # радиус центриоли (до среднего триплета)
TR = 0.055        # радиус микротрубочки
LEN = 1.35        # длина центриоли
TILT = math.radians(50)   # наклон триплета к касательной


def hollow_tube(bm, a, b, r):
    # Полая трубочка от a до b: боковая стенка без крышек (толщину даст Solidify).
    d = b - a
    q = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    m = Matrix.Translation((a + b) / 2) @ q
    res = bmesh.ops.create_cone(bm, cap_ends=False, segments=18, radius1=r, radius2=r, depth=d.length, matrix=m)
    return res


def centriole(name, matrix):
    bm = bmesh.new()
    links = bmesh.new()
    pts = []
    for i in range(9):
        a = i * 2 * math.pi / 9
        c = Vector((R * math.cos(a), R * math.sin(a), 0))
        tang = Vector((-math.sin(a), math.cos(a), 0))
        rad = Vector((math.cos(a), math.sin(a), 0))
        # Триплет — три трубочки в ряд вдоль наклонённой линии.
        dirv = (tang * math.cos(TILT) + rad * math.sin(TILT)).normalized()
        row = [c + dirv * (j - 1) * TR * 1.85 for j in range(3)]
        pts.append(row)
        for p in row:
            hollow_tube(bm, p + Vector((0, 0, -LEN / 2)), p + Vector((0, 0, LEN / 2)), TR)
    # Перемычки: внутренняя трубочка одного триплета — к внешней соседнего.
    for i in range(9):
        a, b = pts[i][0], pts[(i + 1) % 9][2]
        for z in (-LEN * 0.35, 0, LEN * 0.35):
            d = b - a
            m = Matrix.Translation((a + b) / 2 + Vector((0, 0, z))) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
            bmesh.ops.create_cone(links, cap_ends=True, segments=6, radius1=0.012, radius2=0.012, depth=d.length * 0.7, matrix=m)
    out = []
    for data, mat, nm, thick in ((bm, tube_mat, name, 0.014), (links, link_mat, name + '_link', 0)):
        mesh = bpy.data.meshes.new(nm)
        data.to_mesh(mesh)
        data.free()
        o = bpy.data.objects.new(nm, mesh)
        bpy.context.scene.collection.objects.link(o)
        o.data.materials.append(mat)
        if thick:
            s = o.modifiers.new('Wall', 'SOLIDIFY')
            s.thickness = thick
        for p in o.data.polygons:
            p.use_smooth = True
        o.matrix_world = matrix
        out.append(o)
    return out


# Материнская центриоль лежит вдоль X, дочерняя — перпендикулярно ей, рядом.
centriole('centriole_a', Matrix.Translation((0, 0, 0)) @ Matrix.Rotation(math.radians(90), 4, 'Y'))
centriole('centriole_b', Matrix.Translation((-0.3, 0, 1.25)) @ Matrix.Rotation(math.radians(90), 4, 'X'))


def join(prefixes, name):
    objs = [o for o in bpy.context.scene.objects if o.name.startswith(prefixes) and o.name.endswith('_link') == name.endswith('_link')]
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


join(('centriole_a', 'centriole_b'), 'centriole_tubes')
join(('centriole_a', 'centriole_b'), 'centriole_link')

lib.export('centrioles')
lib.preview('centrioles')

