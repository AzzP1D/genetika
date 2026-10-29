# Общие функции для скриптов моделей: очистка сцены, материалы в цветах приложения,
# экспорт в app/models/<имя>.glb и картинка-превью в blender/previews/<имя>.png.
import os
import sys
import math
import bpy
from mathutils import Vector

ROOT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.getcwd()


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def hex_rgba(h, a=1.0):
    # Цвет из палитры приложения (sRGB) в линейный, как его ждёт Blender.
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [a]


def material(name, color, roughness=0.5, alpha=1.0):
    # Имя материала читает приложение: по нему оно назначает свой цвет и стиль.
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_rgba(color)
    bsdf.inputs['Roughness'].default_value = roughness
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def smooth(obj, levels=2):
    mod = obj.modifiers.new('Subdivision', 'SUBSURF')
    mod.levels = mod.render_levels = levels
    for p in obj.data.polygons:
        p.use_smooth = True


def export(name):
    path = os.path.join(ROOT, 'app', 'models', name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False,
                              export_apply=True, export_cameras=False, export_lights=False)
    print('EXPORT OK', path, round(os.path.getsize(path) / 1024), 'KB')


def preview(name, size=640):
    scene = bpy.context.scene
    objs = [o for o in scene.objects if o.type == 'MESH']
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    center, radius = (lo + hi) / 2, (hi - lo).length / 2

    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    scene.collection.objects.link(cam)
    scene.camera = cam

    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(30))
    scene.collection.objects.link(sun)

    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = hex_rgba(0x0d1322)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    scene.world = world

    # Четыре ракурса в одной картинке 2×2: в 3/4, спереди (как в приложении), сбоку, сверху.
    # Так ошибки формы (например, изгиб не в ту сторону) видны сразу.
    import numpy as np
    views = [(1, -1.5, 0.9), (0, -1, 0.12), (1, 0, 0.12), (0.01, -0.15, 1)]
    half = size // 2
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = half
    tiles = []
    for i, v in enumerate(views):
        d = Vector(v).normalized()
        cam.location = center + d * radius * 2.6
        cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(ROOT, 'blender', 'previews', f'_{name}_{i}.png')
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(scene.render.filepath)
        tiles.append(np.array(img.pixels[:]).reshape(half, half, 4))
        bpy.data.images.remove(img)
        os.remove(scene.render.filepath)
    # Пиксели Blender идут снизу вверх: нижний ряд картинки — последние ракурсы.
    grid = np.vstack([np.hstack([tiles[2], tiles[3]]), np.hstack([tiles[0], tiles[1]])])
    out = bpy.data.images.new(name + '_preview', size, size, alpha=True)
    out.pixels = grid.ravel()
    out.filepath_raw = os.path.join(ROOT, 'blender', 'previews', name + '.png')
    out.file_format = 'PNG'
    out.save()
    print('PREVIEW OK', out.filepath_raw)


def report(name):
    # «Вес» модели: треугольники и размер файла — чтобы сразу видеть, не тяжело ли телефону.
    deps = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            m = o.evaluated_get(deps).to_mesh()
            m.calc_loop_triangles()
            tris += len(m.loop_triangles)
    path = os.path.join(ROOT, 'app', 'models', name + '.glb')
    print('REPORT OK', name, tris, 'треугольников,', round(os.path.getsize(path) / 1024), 'KB до сжатия')
