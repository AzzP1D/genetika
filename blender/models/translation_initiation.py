"""Build the first translation assets from 6Y0G, 8PJ2 and 6ZMW in Blender."""
from collections import defaultdict
import gzip
import json
from pathlib import Path
import subprocess
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lib

ROOT = Path(lib.ROOT)
RAW = ROOT / 'models_raw' / 'pdb'
OUT = ROOT / 'app' / 'models'
PREVIEWS = ROOT / 'blender' / 'previews'


def read_structure(accession):
    entities = {}
    chains = defaultdict(list)
    columns = []
    with gzip.open(RAW / f'{accession}.cif.gz', 'rt', encoding='utf-8') as source:
        for line in source:
            if line.startswith('_atom_site.'):
                columns.append(line.split('.', 1)[1].strip())
            elif columns and line.startswith('#'):
                break
            elif columns and line.startswith(('ATOM ', 'HETATM ')):
                atom = dict(zip(columns, line.split()))
                if atom['label_alt_id'] not in ('.', 'A'):
                    continue
                name = atom['label_atom_id'].strip('"')
                if name in ('CA', 'P', "C4'", "O3'"):
                    entities[atom['label_asym_id']] = int(atom['label_entity_id'])
                    point = [float(atom[f'Cartn_{axis}']) for axis in 'xyz']
                    chains[atom['label_asym_id']].append(
                        (name, atom['auth_seq_id'], atom['label_comp_id'], point)
                    )
    return chains, entities


def indexed(chains, chain, atom='P'):
    return {int(residue): (base, point) for name, residue, base, point in chains[chain]
            if name == atom}


def align(reference, moving):
    shared = [residue for residue in reference.keys() & moving.keys()
              if reference[residue][0] == moving[residue][0]]
    if len(shared) < 1400:
        raise ValueError(f'Only {len(shared)} 18S phosphates match')
    fixed = np.array([reference[res][1] for res in shared])
    mobile = np.array([moving[res][1] for res in shared])
    fixed_center, mobile_center = fixed.mean(axis=0), mobile.mean(axis=0)
    left, _, right = np.linalg.svd((mobile - mobile_center).T @ (fixed - fixed_center))
    handedness = np.diag([1, 1, np.linalg.det(left @ right)])
    rotation = left @ handedness @ right
    offset = fixed_center - mobile_center @ rotation
    rms = np.sqrt(np.mean(np.sum((mobile @ rotation + offset - fixed) ** 2, axis=1)))
    print(f'18S alignment: {len(shared)} phosphates, RMSD {rms:.2f} Å')
    if rms > 9:
        raise ValueError('18S reference frames do not agree')
    return lambda points: np.asarray(points) @ rotation + offset


def points(chains, ids, atoms=('CA', 'P', "C4'")):
    return np.array([point for chain in ids for name, _, _, point in chains[chain]
                     if name in atoms])


def surface(name, coords, color, radius, voxel, detail=0.45):
    """Approximate the molecular envelope using residue backbone samples."""
    cells = {}
    for point in coords:
        cells.setdefault(tuple(np.floor(point / voxel).astype(int)), point)
    field = bpy.data.metaballs.new(name)
    field.resolution = field.render_resolution = voxel * 0.66
    obj = bpy.data.objects.new(f'GEO-{name}', field)
    bpy.context.collection.objects.link(obj)
    for point in cells.values():
        element = field.elements.new()
        element.co = point
        element.radius = radius
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    mesh = bpy.context.object
    mesh.name = f'GEO-{name}'
    decimate = mesh.modifiers.new('Mobile surface', 'DECIMATE')
    decimate.ratio = detail
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    mesh.data.validate(clean_customdata=True)
    mesh.data.update()
    if not mesh.data.polygons:
        raise ValueError(f'Empty surface: {name}')
    for polygon in mesh.data.polygons:
        polygon.use_smooth = True
    material = lib.material(name, color)
    material.diffuse_color = lib.hex_rgba(color)
    lib.assign(mesh, material)
    return mesh


def marker(name, position):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    obj.empty_display_size = 0.08
    return obj


def bead(name, position, color, radius):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=position)
    obj = bpy.context.object
    obj.name = f'GEO-{name}'
    mat_name = f'RNA-preview-{color:06x}' if name.startswith('Lesson-') else name
    material = bpy.data.materials.get(mat_name) or lib.material(mat_name, color)
    material.diffuse_color = lib.hex_rgba(color)
    lib.assign(obj, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def rna_backbone(beads):
    curve = bpy.data.curves.new('Lesson RNA backbone', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 0.029
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(beads) - 1)
    for point, bead_obj in zip(spline.points, beads):
        point.co = (*bead_obj.location, 1)
    obj = bpy.data.objects.new('GEO-Lesson-RNA-backbone', curve)
    bpy.context.collection.objects.link(obj)
    material = lib.material('Lesson-RNA-backbone', 0xa86190)
    material.diffuse_color = lib.hex_rgba(0xa86190)
    obj.data.materials.append(material)
    return obj


def export(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    path = OUT / f'{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_meshopt_compression_enable=True)
    print(f'EXPORT OK {path.name} {path.stat().st_size // 1024} KB')


def lesson_rna(anchored):
    # The exact lesson chain comes from the same source as splicing and export.
    sequence_path = (ROOT / 'app' / 'transcription-sequence.js').as_uri()
    code = (f'import {{basesAfterSplicing,SPLICING_INTRONS}} from {json.dumps(sequence_path)}; '
            'console.log(JSON.stringify(basesAfterSplicing(SPLICING_INTRONS.length)))')
    result = subprocess.run(['node', '--input-type=module', '--eval', code], check=True,
                            capture_output=True, text=True, encoding='utf-8')
    bases = json.loads(result.stdout)
    if ''.join(base['letter'] for base in bases[3:6]) != 'АУГ':
        raise ValueError('The lesson AUG is no longer at the expected position')
    colors = {'e1': 0xe478ac, 'e2': 0xb777db, 'e3': 0xea87a9}
    last = anchored[max(anchored)]
    direction = last - anchored[max(anchored) - 1]
    direction /= np.linalg.norm(direction)
    first = anchored[-3]
    cap = bead('Lesson-5prime-cap', first + (first - anchored[-2]) * 1.4, 0x95e8ae, 0.10)
    beads = [cap]
    for index, base in enumerate(bases):
        pos = index - 3 if index < 3 else index - 2
        center = anchored.get(pos, last + direction * 0.15 * (pos - max(anchored)))
        color = 0xffda86 if 1 <= pos <= 3 else colors[base['part']]
        obj = bead(f"Lesson-base-{index + 1:02d}-{base['letter']}", center, color, 0.078)
        obj['Exon'] = base['part']
        obj['Transcript index'] = base['index']
        beads.append(obj)
    for index in range(10):
        center += direction * 0.14
        beads.append(bead(f'Lesson-polyA-{index + 1:02d}', center, 0x64cbdc, 0.065))
    return [*beads, rna_backbone(beads)]


def preview(name, direction, center, scale):
    scene = bpy.context.scene
    if not scene.camera:
        camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
        scene.collection.objects.link(camera)
        scene.camera = camera
    scene.camera.location = Vector(center) + Vector(direction).normalized() * 18
    scene.camera.rotation_euler = (Vector(center) - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera.data.type = 'ORTHO'
    scene.camera.data.ortho_scale = scale
    scene.render.engine = 'BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    shading.color_type = 'MATERIAL'
    shading.background_type = 'WORLD'
    if not scene.world:
        scene.world = bpy.data.worlds.new('BIOTECH')
    scene.world.color = (0.035, 0.060, 0.09)
    shading.show_cavity = True
    shading.cavity_type = 'BOTH'
    shading.show_shadows = False
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x = scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(PREVIEWS / f'{name}.png')
    bpy.ops.render.render(write_still=True)


def build():
    lib.reset()
    PREVIEWS.mkdir(exist_ok=True)
    assembly, entities = read_structure('6Y0G')
    initiation, _ = read_structure('8PJ2')
    recruitment, _ = read_structure('6ZMW')
    reference = indexed(assembly, 'XA')
    align_start = align(reference, indexed(initiation, 'J'))
    align_factors = align(reference, indexed(recruitment, 'X'))

    large_proteins = [chain for chain, entity in entities.items() if 7 <= entity <= 48]
    small_proteins = [chain for chain, entity in entities.items() if 50 <= entity <= 82]
    large_points = points(assembly, ['E', 'F', 'G', *large_proteins])
    small_points = points(assembly, ['XA', *small_proteins])
    if len(large_proteins) != 42 or len(small_proteins) != 33:
        raise ValueError('Unexpected 6Y0G ribosomal protein chain count')

    mrna = indexed(initiation, 'G')
    assert ''.join(mrna[res][0] for res in (1, 2, 3)) == 'AUG'
    origin = (large_points.mean(axis=0) + small_points.mean(axis=0)) / 2
    z = large_points.mean(axis=0) - small_points.mean(axis=0)
    z /= np.linalg.norm(z)
    x = align_start(mrna[5][1]) - align_start(mrna[-2][1])
    x -= z * (x @ z)
    x /= np.linalg.norm(x)
    basis = np.array([x, np.cross(z, x), z])

    def world(coords):
        return (np.asarray(coords) - origin) @ basis.T * 0.025

    small = surface('40S', world(small_points), 0x55c5d8, 0.17, 0.11, detail=0.30)
    large = surface('60S', world(large_points), 0x9b8ae8, 0.17, 0.11, detail=0.30)
    trna = surface('Initiator-tRNA', world(align_start(points(initiation, ['XA']))),
                   0x78dba3, 0.13, 0.055)
    trna_end = indexed(initiation, 'XA', "O3'")
    acceptor = world(align_start(trna_end[76][1]))
    methionine = bead('Met-educational', acceptor, 0xffca72, 0.12)
    anchored = {pos: world(align_start(point)) for pos, (_, point) in mrna.items()}
    route = [marker(f'mRNA-reference-{pos:+d}', point) for pos, point in anchored.items()]
    sites = [
        marker('Site-P-codon', world(align_start(np.mean([mrna[i][1] for i in (1, 2, 3)], axis=0)))),
        marker('Site-A-codon', world(align_start(np.mean([mrna[i][1] for i in (4, 5, 6)], axis=0)))),
        marker('Site-E-codon', world(align_start(np.mean([mrna[i][1] for i in (-3, -2, -1)], axis=0)))),
        marker('Acceptor-end', acceptor),
    ]
    export('translation_initiation', [small, large, trna, methionine, *route, *sites])

    display_rna = lesson_rna(anchored)
    preview('translation-80s', (0.2, -1, 0.12), (0.4, 0, 0), 9.7)
    large.location.z = 2.9
    preview('translation-80s-open', (0.1, -1, 0.38), (0.6, 0, 1.1), 12.6)
    large.location.z = 0

    specimen = [
        surface('18S-rRNA', world(points(assembly, ['XA'])), 0x53c4d8, 0.16, 0.09),
        surface('40S-Proteins', world(points(assembly, small_proteins)), 0x247d97, 0.15, 0.085),
        surface('28S-rRNA', world(points(assembly, ['E'])), 0x9b8ae8, 0.16, 0.09),
        surface('5S-rRNA', world(points(assembly, ['F'])), 0xf084ad, 0.16, 0.085),
        surface('5p8S-rRNA', world(points(assembly, ['G'])), 0xe6b166, 0.16, 0.085),
        surface('60S-Proteins', world(points(assembly, large_proteins)), 0x574aa4, 0.15, 0.085),
    ]
    export('translation_ribosome_specimen', specimen)
    factor_chains = {
        'eIF3': {'A': 'i', 'B': 'b', 'C': 'm', 'D': 'f', 'E': 'a', 'F': 'e', 'H': 'c',
                 'I': 'h', 'S': 'd', 'T': 'k', 'U': 'l', 'UA': 'g', 'XA': 'j'},
        'eIF2': {'DA': 'alpha', 'AB': 'beta', 'CB': 'gamma'},
        'eIF4A': {'DB': '1'},
        'eIF4G': {'EB': '1-fragment'},
    }
    factor_colors = {'eIF3': 0xf39470, 'eIF2': 0x75ccb3, 'eIF4A': 0xec8cab, 'eIF4G': 0xf2c86c}
    for factor, chains in factor_chains.items():
        objects = [
            surface(f'{factor}-{part}', world(align_factors(points(recruitment, [chain]))),
                    factor_colors[factor], 0.13, 0.066)
            for chain, part in chains.items()
        ]
        export(f'translation_{factor.lower()}_specimen', objects)
    bpy.context.scene['Structure sources'] = '6Y0G (80S), 8PJ2 (initiator tRNA), 6ZMW (eIF)'
    scene = bpy.context.scene
    visible = [small, large, trna, methionine, *display_rna, scene.camera]
    for obj in scene.objects:
        obj.hide_set(obj not in visible)
        obj.hide_render = obj not in visible
    # A simple assembly preview for scrubbing in the .blend. App interactions are independent.
    scene.frame_end = 48
    for frame, height in ((1, 2.9), (12, 2.9), (38, 0), (48, 0)):
        large.location.z = height
        large.keyframe_insert(data_path='location', frame=frame)
    scene.timeline_markers.new('40S + Met-tRNA', frame=1)
    scene.timeline_markers.new('60S: association', frame=12)
    scene.timeline_markers.new('80S: A site vacant', frame=38)
    scene.frame_set(38)
    scene.render.filepath = str(PREVIEWS / 'translation-80s.png')
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    bpy.ops.wm.save_as_mainfile(filepath=str(PREVIEWS / 'translation-initiation.blend'), compress=True)


if __name__ == '__main__':
    build()
