"""Build the editable Pol II initiation scene and render its two review frames.

Run Blender with --background --factory-startup --python blender/transcription_preview.py.
"""

import math
from pathlib import Path
import random
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lib


OUT = Path(__file__).resolve().parent / 'previews' / 'transcription'
TRANSCRIPT = 'GAGAUGCGUGUA'  # First exon of the same educational example as «Код жизни».
UPSTREAM = 'TACAC'         # Schematic context for the gene, including the promoter region.
BASE_NAMES = dict(zip('ATGCU', 'АТГЦУ'))
BASE_COLORS = {'A': 0xff3b5c, 'T': 0xffe600, 'G': 0x39ff14, 'C': 0x2f8bff, 'U': 0xc04bff}
PAPER = 0xe7f6ff
MUTED = 0x9cbed4
DNA = 0x00e5ff
RNA = 0xff2bd6
GOLD = 0xffd98a


def collection(name):
    group = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(group)
    return group


def link(group, name, data):
    obj = bpy.data.objects.new(name, data)
    group.objects.link(obj)
    return obj


def emission(name, color, strength=1):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = lib.hex_rgba(color)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    shader = nodes.new('ShaderNodeEmission')
    shader.inputs['Color'].default_value = mat.diffuse_color
    shader.inputs['Strength'].default_value = strength
    mat.node_tree.links.new(shader.outputs[0], nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    return mat


def label(group, body, x, y, size, mat, font, *, center=False, z=3.7):
    data = bpy.data.curves.new(body, 'FONT')
    data.body = body
    data.size = size
    data.font = font
    data.align_x = 'CENTER' if center else 'LEFT'
    data.align_y = 'CENTER'
    data.materials.append(mat)
    obj = link(group, body, data)
    obj.location = (x, y, z)
    return obj


def panel(group, name, x, y, w, h, radius, mat, z=3.25):
    vertices = []
    for sign_x, sign_y, start in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        cx = sign_x * (w / 2 - radius)
        cy = sign_y * (h / 2 - radius)
        for i in range(9):
            a = math.radians(start + i * 90 / 8)
            vertices.append((cx + radius * math.cos(a), cy + radius * math.sin(a), 0))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [tuple(range(len(vertices)))])
    mesh.materials.append(mat)
    obj = link(group, name, mesh)
    obj.location = (x, y, z)
    return obj


def trace(group, name, points, radius, mat, *, smooth=False):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    data.bevel_resolution = 3
    data.use_fill_caps = True
    data.materials.append(mat)
    if smooth:
        spline = data.splines.new('BEZIER')
        spline.bezier_points.add(len(points) - 1)
        for knot, point in zip(spline.bezier_points, points):
            knot.co = point
            knot.handle_left_type = knot.handle_right_type = 'AUTO'
    else:
        spline = data.splines.new('POLY')
        spline.points.add(len(points) - 1)
        for knot, point in zip(spline.points, points):
            knot.co = (*point, 1)
    return link(group, name, data)


def blob(group, name, pivot, lobes, mat):
    data = bpy.data.metaballs.new(name)
    data.resolution = data.render_resolution = 0.095
    data.threshold = 0.62
    for xyz, radius, stretch in lobes:
        part = data.elements.new(type='ELLIPSOID')
        part.co = Vector(xyz) - Vector(pivot)
        part.radius = radius
        part.size_x, part.size_y, part.size_z = stretch
    obj = link(group, name, data)
    obj.location = pivot
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.select_set(False)
    return obj


def recess(obj, x, y, radii):
    bpy.context.view_layer.update()
    local = obj.matrix_world.inverted() @ Vector((x, y, 6))
    hit, location, _, _ = obj.ray_cast(local, (0, 0, -1))
    if not hit:
        raise ValueError(f'Recess at {(x, y)} misses {obj.name}')
    surface_point = obj.matrix_world @ location
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, location=surface_point)
    cutter = bpy.context.object
    cutter.scale = radii
    cutter.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    cut = obj.modifiers.new('Углубление канала', 'BOOLEAN')
    cut.operation = 'DIFFERENCE'
    cut.object = cutter
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.select_set(False)
    return surface_point


def surface(name, color, roughness):
    mat = lib.material(name, color, roughness)
    mat.diffuse_color = lib.hex_rgba(color)
    nodes = mat.node_tree.nodes
    shader = nodes['Principled BSDF']
    shader.inputs['Metallic'].default_value = 0.24
    shader.inputs['Emission Color'].default_value = lib.hex_rgba(color)
    shader.inputs['Emission Strength'].default_value = 0.075
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 13
    noise.inputs['Detail'].default_value = 2
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.16
    bump.inputs['Distance'].default_value = 0.10
    mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat


def area_light(group, name, xyz, target, watts, rgb, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.color, data.size = watts, rgb, size
    obj = link(group, name, data)
    obj.location = xyz
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def show_on(group, frame):
    for obj in group.objects:
        for other_frame in (1, 2):
            obj.hide_render = obj.hide_viewport = other_frame != frame
            obj.keyframe_insert(data_path='hide_render', frame=other_frame)
            obj.keyframe_insert(data_path='hide_viewport', frame=other_frame)


def make_background(group):
    mat = emission('Градиент ядра', 0x08121e)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    geometry = nodes.new('ShaderNodeNewGeometry')
    distance = nodes.new('ShaderNodeVectorMath')
    distance.operation = 'DISTANCE'
    distance.inputs[1].default_value = (0.65, -0.5, -5)
    grad = nodes.new('ShaderNodeMapRange')
    grad.inputs['From Max'].default_value = 11.5
    mix = nodes.new('ShaderNodeMixRGB')
    mix.inputs[1].default_value = lib.hex_rgba(0x142d42)
    mix.inputs[2].default_value = lib.hex_rgba(0x040915)
    links.new(geometry.outputs['Position'], distance.inputs[0])
    links.new(distance.outputs['Value'], grad.inputs['Value'])
    links.new(grad.outputs['Result'], mix.inputs[0])
    links.new(mix.outputs[0], next(n for n in nodes if n.type == 'EMISSION').inputs['Color'])
    panel(group, 'Фон ядра', 0, 0, 14, 20, 0.1, mat, z=-5)

    dust = emission('Слабые частицы фона', 0x25435d)
    rng = random.Random(12)
    for _ in range(42):
        x, y = rng.uniform(-5.8, 5.8), rng.uniform(-5.5, 4.9)
        width = rng.uniform(0.018, 0.046)
        panel(group, 'Частица', x, y, width, width, width / 2, dust, z=-4.6)


def make_pol(group, anchors):
    coat = surface('pol2_body', 0xa64153, 0.35)
    clamp_coat = surface('pol2_clamp', 0xd66c75, 0.34)
    body = blob(group, 'Pol II • корпус', (0, 0, 0), [
        ((-0.95, -1.34, -0.25), 1.58, (1.22, 1.30, 0.75)),
        ((0.29, -1.16, -0.45), 1.91, (1.32, 1.20, 0.72)),
        ((1.55, -1.05, -0.24), 1.53, (1.26, 1.0, 0.83)),
        ((2.55, -0.25, -0.34), 1.42, (1.05, 1.16, 0.67)),
        ((0.82, -2.66, -0.40), 1.32, (1.18, 0.85, 0.69)),
        ((-1.92, -0.43, -0.18), 1.13, (1.05, 1.17, 0.82)),
        ((-1.72, -2.29, -0.48), 0.92, (1.10, 0.88, 0.52)),
        ((-1.12, -2.55, -0.49), 0.86, (0.76, 0.68, 0.48)),
    ], coat)
    clamp = blob(group, 'Pol II • зажим', (2.45, 0.13, -0.10), [
        ((2.47, 0.14, -0.02), 1.23, (1.00, 1.34, 0.50)),
        ((2.17, 1.29, -0.12), 1.14, (0.73, 1.04, 0.67)),
        ((1.63, 1.49, -0.15), 0.83, (1.05, 0.71, 0.58)),
        ((2.63, 1.94, -0.15), 0.91, (1.05, 0.78, 0.53)),
    ], clamp_coat)
    rna_exit = recess(body, -1.52, -2.05, (0.38, 0.26, 0.29))
    active_site = recess(body, 0.0, -0.46, (0.94, 0.42, 0.31))
    active_site.z -= 0.045
    dna_entrance = recess(clamp, 2.50, 1.48, (0.68, 0.34, 0.31))
    for obj in (body, clamp):
        obj.data.calc_loop_triangles()
        print(f'OK {obj.name}: {len(obj.data.loop_triangles)} triangles', flush=True)
    for name, xyz in {
        'Вход ДНК': dna_entrance,
        'Активный центр': active_site,
        'Выход РНК': rna_exit,
    }.items():
        point = link(anchors, name, None)
        point.location = xyz
        point.empty_display_type = 'SPHERE'
        point.empty_display_size = 0.12


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    lib.reset()
    scene = bpy.context.scene
    scene.name = 'Транскрипция • инициация'
    scene.frame_start, scene.frame_end = 1, 2
    scene.timeline_markers.new('Выбор матричной цепи', frame=1)
    scene.timeline_markers.new('Первый нуклеотид', frame=2)
    scene['Учебный фрагмент РНК, 5′→3′'] = TRANSCRIPT
    scene['Источник примера'] = '«Код жизни», вкладка «Транскрипция»'

    molecules = collection('ДНК и РНК-полимераза')
    keys = collection('Точки привязки полимеразы')
    labels = collection('Общие подписи')
    choose = collection('Кадр 1 • выбор цепи')
    answer = collection('Кадр 2 • первый нуклеотид')
    stage = collection('Камера, свет и фон')
    make_background(stage)

    cam = link(stage, 'Камера • вертикальный кадр', bpy.data.cameras.new('Вертикальная камера'))
    cam.location = (0, 0, 22)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 18
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = (720, 1080)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.world = bpy.data.worlds.new('Мягкий свет ядра')
    scene.world.color = (0.09, 0.10, 0.14)
    area_light(stage, 'Мягкий ключ', (-4.5, 2.7, 7), (0.6, -1, 0), 430, (1, 0.74, 0.78), 6)
    area_light(stage, 'Циановое ребро', (4.7, 0.6, 3.8), (0.6, -1, 0), 390, (0.26, 0.73, 1), 4)
    area_light(stage, 'Коралловый контровой', (-0.5, -4.3, 2.7), (0.6, -1, 0), 215, (1, 0.27, 0.40), 4)

    regular = bpy.data.fonts.load('C:/Windows/Fonts/segoeui.ttf')
    bold = bpy.data.fonts.load('C:/Windows/Fonts/seguisb.ttf')
    regular.pack()
    bold.pack()

    white, muted = emission('Белый текст', PAPER), emission('Вторичный текст', MUTED)
    cyan, template = emission('ДНК • циан', DNA, 1.16), emission('Матричная цепь • акцент', 0x7efaff, 1.28)
    bonds = emission('Пары оснований ДНК', 0x27576f)
    chip, border = emission('Заливка панели', 0x0c1b2b), emission('Кромка панели', 0x32566b)
    gold = emission('Промотор и +1', GOLD)
    pink = emission('РНК • фуксия', RNA, 1.4)
    ruler = emission('Линии подписей', 0x729bb4)

    make_pol(molecules, keys)
    coding = UPSTREAM + TRANSCRIPT[:6].replace('U', 'T')
    matrix = coding.translate(str.maketrans('ATGC', 'TACG'))
    start = len(UPSTREAM)
    assert matrix[start] == 'C' and TRANSCRIPT[0] == 'G'

    def strand_point(i, sign):
        opening = math.exp(-((i - 5.7) / 1.2) ** 2)
        x = (i - start) * 0.76
        amplitude = 0.52 + opening * (0.14 if sign > 0 else 0.39)
        y = 1.72 + sign * amplitude + 0.10 * math.sin(i * 1.18)
        z = 1.29 + sign * 0.15 * math.cos(i * 1.18)
        return (x, y, z)

    count = len(coding)
    upper = [strand_point(i, 1) for i in range(count)]
    lower = [strand_point(i, -1) for i in range(count)]
    for i, (a, b) in enumerate(zip(upper, lower)):
        if i not in (4, 5, 6, 7):
            trace(molecules, f'Пара ДНК {i + 1}', [a, b], 0.038, bonds)
    trace(molecules, 'Верхняя цепь ДНК', upper, 0.058, cyan, smooth=True)
    trace(choose, 'Нижняя цепь ДНК', lower, 0.058, cyan, smooth=True)
    trace(answer, 'Нижняя цепь ДНК • матрица', lower, 0.073, template, smooth=True)

    palette = {base: emission('Основание ' + BASE_NAMES[base], tint) for base, tint in BASE_COLORS.items()}
    for points, sequence, name in ((upper, coding, 'Верхняя'), (lower, matrix, 'Нижняя')):
        for i, ((x, y, _), base) in enumerate(zip(points, sequence)):
            title = f'{name} • {i + 1} • {BASE_NAMES[base]}'
            panel(molecules, title, x, y, 0.58, 0.46, 0.12, palette[base], z=1.71)
            panel(molecules, title + ' • фон', x, y + 0.018, 0.56, 0.415, 0.11, chip, z=1.73)
            label(molecules, BASE_NAMES[base], x, y, 0.48, white, bold, center=True, z=1.82)

    for points, left, right in ((upper, '5′', '3′'), (lower, '3′', '5′')):
        label(labels, left, -4.46, points[0][1], 0.58, white, bold, center=True)
        label(labels, right, 4.46, points[-1][1], 0.58, white, bold, center=True)

    label(labels, 'ИНИЦИАЦИЯ ТРАНСКРИПЦИИ', -5.15, 8.03, 0.52, cyan, bold)
    label(labels, 'Направление транскрипции', 0, 4.53, 0.53, muted, regular, center=True)
    trace(labels, 'Направление', [(-3.80, 4.05, 3.7), (3.81, 4.05, 3.7)], 0.022, cyan)
    trace(labels, 'Наконечник стрелки', [(3.52, 4.22, 3.7), (3.81, 4.05, 3.7), (3.52, 3.88, 3.7)], 0.036, cyan)
    label(labels, 'Промотор', -2.81, 3.27, 0.55, gold, bold, center=True)
    trace(labels, 'Границы участка промотора', [(-4.1, 2.81, 3.4), (-4.1, 2.97, 3.4),
          (-1.44, 2.97, 3.4), (-1.44, 2.81, 3.4)], 0.019, gold)
    label(labels, '+1', 0, 3.27, 0.64, gold, bold, center=True)
    trace(labels, 'Указатель +1', [(0, 2.96, 3.4), (0, 2.72, 3.4)], 0.021, gold)
    label(labels, 'Вход ДНК', 4.15, -0.55, 0.56, muted, regular, center=True)
    trace(labels, 'К входу ДНК', [(4.62, -0.23, 3.4), (4.96, 0.04, 3.4),
          (4.96, 1.64, 3.4), (3.78, 1.64, 3.4), (2.72, 1.46, 3.4)], 0.017, ruler)
    label(labels, 'Выход РНК', -4.11, -2.64, 0.56, muted, regular, center=True)
    trace(labels, 'К выходу РНК', [(-3.08, -2.63, 3.4), (-2.51, -2.63, 3.4), (-1.51, -2.02, 3.4)], 0.017, ruler)
    label(labels, 'РНК-полимераза II', 0.3, -4.22, 0.64, white, bold, center=True)

    for group, first_line, second_line, detail in (
        (choose, 'Какую цепь читает', 'полимераза?', 'Сравни концы 5′ и 3′ по стрелке.'),
        (answer, 'Первый нуклеотид', 'на месте', 'Г в РНК образует пару с Ц в матричной ДНК.'),
    ):
        label(group, first_line, -5.15, 7.12, 1.02, white, bold)
        label(group, second_line, -5.15, 6.05, 1.02, white, bold)
        label(group, detail, -5.15, 5.18, 0.55, muted, regular)

    for x, name in ((-2.66, 'Верхняя'), (2.66, 'Нижняя')):
        panel(choose, name + ' • кромка', x, -6.69, 4.97, 1.22, 0.21, border)
        panel(choose, name + ' • плашка', x, -6.69, 4.91, 1.16, 0.19, chip, z=3.29)
        label(choose, name, x, -6.69, 0.61, white, bold, center=True)
    label(choose, 'Полимераза читает матрицу от 3′ к 5′.', -5.15, -7.96, 0.54, muted, regular)

    _, start_y, _ = lower[start]
    rna_y = start_y - 0.65
    for x in (-0.10, 0, 0.10):
        trace(answer, 'Комплементарная пара ДНК–РНК', [(x, start_y - 0.21, 2.13),
              (x, rna_y + 0.23, 2.13)], 0.012, pink)
    panel(answer, 'Первый нуклеотид • фуксия', 0, rna_y, 0.67, 0.53, 0.13, pink, z=2.17)
    panel(answer, 'Первый нуклеотид • фон', 0, rna_y, 0.59, 0.45, 0.10, chip, z=2.22)
    label(answer, BASE_NAMES[TRANSCRIPT[0]], 0, rna_y, 0.50, white, bold, center=True, z=2.28)
    label(answer, 'Г в РНК', -2.93, -0.79, 0.47, pink, bold, center=True)
    trace(answer, 'К первому нуклеотиду', [(-2.28, -0.78, 3.4), (-1.68, -0.78, 3.4),
          (-0.39, rna_y, 3.4)], 0.019, pink)
    for x, title, value, accent in ((-2.66, 'МАТРИЧНАЯ ДНК', '3′ → 5′', cyan), (2.66, 'РОСТ РНК', '5′ → 3′', pink)):
        panel(answer, title + ' • кромка', x, -6.69, 4.97, 1.82, 0.24, border)
        panel(answer, title + ' • плашка', x, -6.69, 4.91, 1.76, 0.22, chip, z=3.29)
        label(answer, title, x, -6.28, 0.50, muted, bold, center=True)
        label(answer, value, x, -7.00, 0.68, accent, bold, center=True)

    show_on(choose, 1)
    show_on(answer, 2)
    for area in (area for screen in bpy.data.screens for area in screen.areas if area.type == 'VIEW_3D'):
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
        area.spaces.active.shading.color_type = 'MATERIAL'
        area.spaces.active.overlay.show_overlays = False
    for frame, show, hide in ((1, choose, answer), (2, answer, choose)):
        scene.frame_set(frame)
        assert all(not obj.hide_render for obj in show.objects)
        assert all(obj.hide_render for obj in hide.objects)
    bpy.context.view_layer.update()
    corner = world_to_camera_view(scene, cam, Vector((5.99, 8.99, 3.7)))
    assert 0.99 < corner.x < 1 and 0.99 < corner.y < 1, corner

    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    scene.frame_set(1)
    scene.render.filepath = '//'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'transcription-initiation.blend'))
    for frame, name in ((1, '01-template-choice.png'), (2, '02-first-nucleotide.png')):
        scene.frame_set(frame)
        scene.render.filepath = str(OUT / name)
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
