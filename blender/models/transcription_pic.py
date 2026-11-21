"""Build classroom views of the human initiation complex from PDB 5IY6 and 5IY7.

Place the two .cif.gz files in blender/previews/transcription/pdb and run this script
with Blender from the project root. The protein surfaces are approximations made
from C-alpha positions. The two DNA backbones follow phosphate coordinates.
"""

from collections import defaultdict
import gzip
import json
from pathlib import Path
import sys

import bpy
import numpy as np

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'blender'))
import lib


SCALE = 0.022
PARTS = {
    'pic_pol2': (0xff728a, 24500),
    'pic_factors': (0xffd17b, 7600),
    'pic_xpb': (0xcaa3ff, 4600),
    'pic_tfiih': (0x765ab4, 7400),
    'pic_dna_a': (0x00e5ff, None),
    'pic_dna_b': (0x639bff, None),
}


def read_coordinates(entry):
    path = root / 'blender' / 'previews' / 'transcription' / 'pdb' / f'{entry}.cif.gz'
    columns = []
    groups = defaultdict(dict)
    with gzip.open(path, 'rt') as handle:
        for line in handle:
            if line.startswith('_atom_site.'):
                columns.append(line.split()[0].split('.')[1])
                continue
            if not line.startswith('ATOM '):
                continue
            atom = dict(zip(columns, line.split()))
            name = atom['label_atom_id']
            if name not in ('CA', 'P') or atom['label_alt_id'] not in ('.', 'A'):
                continue
            entity = int(atom['label_entity_id'])
            residue = int(atom['label_seq_id'])
            groups[entity][residue] = tuple(float(atom[f'Cartn_{axis}']) for axis in 'xyz')
    expected = set(range(1, 21)) | set(range(22, 30))
    missing = expected - groups.keys()
    if missing:
        raise ValueError(f'{entry}: no coordinates for entities {sorted(missing)}')
    return groups


def alignment(groups, reference):
    # RPB2 provides a shared frame for comparing both experimental states.
    common = sorted(groups[2].keys() & reference[2].keys())
    a, b = [np.array([state[2][i] for i in common]) for state in (groups, reference)]
    a_center, b_center = a.mean(axis=0), b.mean(axis=0)
    u, _, vt = np.linalg.svd((a - a_center).T @ (b - b_center))
    u[:, -1] *= np.linalg.det(u @ vt)
    rotation = u @ vt
    return rotation, b_center - a_center @ rotation


def view_frame(reference):
    dna = np.array(list(reference[28].values()))
    protein = np.array([p for i in range(1, 13) for p in reference[i].values()])
    xpb = np.array(list(reference[22].values()))
    x = dna[-8:].mean(axis=0) - dna[:8].mean(axis=0)
    x /= np.linalg.norm(x)
    y = xpb.mean(axis=0) - protein.mean(axis=0)
    y -= x * np.dot(y, x)
    y /= np.linalg.norm(y)
    z = np.cross(x, y)
    return dna.mean(axis=0), np.column_stack((x, y, z))


def protein_surface(name, coordinates, mat, limit):
    source = bpy.data.metaballs.new(name)
    source.resolution = source.render_resolution = 0.035
    for point in coordinates:
        ball = source.elements.new()
        ball.co = point
        ball.radius = 6.6 * SCALE
    obj = bpy.data.objects.new(name, source)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.name = name
    lib.assign(obj, mat)
    obj.data.calc_loop_triangles()
    if len(obj.data.loop_triangles) > limit:
        decimate = obj.modifiers.new('Mobile surface', 'DECIMATE')
        decimate.ratio = limit / len(obj.data.loop_triangles)
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    obj.data.validate()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.select_set(False)


def dna_backbone(name, coordinates, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 0.038
    curve.bevel_resolution = 2
    curve.resolution_u = 5
    curve.use_fill_caps = True
    segments = [[]]
    for point in coordinates:
        if segments[-1] and np.linalg.norm(point - segments[-1][-1]) > 10 * SCALE:
            segments.append([])
        segments[-1].append(point)
    for segment in segments:
        if len(segment) < 2:
            continue
        spline = curve.splines.new('BEZIER')
        spline.bezier_points.add(len(segment) - 1)
        for knot, point in zip(spline.bezier_points, segment):
            knot.co = point
            knot.handle_left_type = knot.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    bpy.context.object.name = name
    bpy.context.object.select_set(False)


def project_coordinates(groups, reference, center, basis):
    transform, translation = alignment(groups, reference)

    def coordinates(entities):
        positions = np.array([groups[i][key] for i in entities for key in sorted(groups[i])])
        return (positions @ transform + translation - center) @ basis * SCALE

    return coordinates


def build(entry, groups, reference, center, basis):
    lib.reset()
    coordinates = project_coordinates(groups, reference, center, basis)
    entities = {
        'pic_pol2': range(1, 13), 'pic_factors': range(13, 21), 'pic_xpb': [22],
        'pic_tfiih': range(23, 28), 'pic_dna_a': [28], 'pic_dna_b': [29],
    }
    for name, (color, limit) in PARTS.items():
        points = coordinates(entities[name])
        mat = lib.material(name, color)
        if limit is None:
            dna_backbone(name, points, mat)
        else:
            protein_surface(name, points, mat, limit)
    filename = f'pol2-pic-{entry.lower()}'
    lib.export(filename)
    lib.report(filename)


def main():
    states = {entry: read_coordinates(entry) for entry in ('5IY6', '5IY7')}
    reference = states['5IY7']
    center, basis = view_frame(reference)
    backbones = {}
    for entry, groups in states.items():
        coordinates = project_coordinates(groups, reference, center, basis)
        backbones[entry] = [coordinates([entity]).round(5).tolist() for entity in (28, 29)]
        if '--backbones-only' not in sys.argv:
            build(entry, groups, reference, center, basis)

    # Blender's export rotation and the preview's import rotation cancel out.
    out = root / 'app' / 'models' / 'pol2-pic-dna.json'
    out.write_text(json.dumps(backbones, separators=(',', ':')) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
