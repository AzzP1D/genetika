"""Export a teaching surface of human spliceosome 5YZG.

Put 5yzg.cif.gz from RCSB PDB in blender/previews/splicing.
Protein envelopes use the C-alpha positions. RNA tubes follow the resolved
phosphates, with gaps wherever the coordinates are discontinuous.
"""

from collections import defaultdict
import gzip
from pathlib import Path
import sys

import bpy
import numpy as np

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'blender'))
import lib


def load_atoms():
    columns = []
    groups = defaultdict(list)
    with gzip.open(root / 'blender/previews/splicing/5yzg.cif.gz', 'rt') as handle:
        for line in handle:
            if line.startswith('_atom_site.'):
                columns.append(line.strip().split('.')[1])
            if not line.startswith('ATOM '):
                continue
            atom = dict(zip(columns, line.split()))
            name = atom['label_atom_id']
            if name not in ('CA', 'P') or atom['label_alt_id'] not in ('.', 'A'):
                continue
            groups[(int(atom['label_entity_id']), atom['label_asym_id'], name)].append(
                tuple(float(atom[f'Cartn_{axis}']) for axis in 'xyz'))
    return groups


def surface(name, points, color, limit):
    source = bpy.data.metaballs.new(name)
    source.resolution = source.render_resolution = 0.086
    cells = np.unique(np.round(points / 0.105).astype(int), axis=0)
    for cell in cells:
        ball = source.elements.new()
        ball.co = cell * 0.105
        ball.radius = 0.147
    obj = bpy.data.objects.new(name, source)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.name = name
    lib.assign(obj, lib.material(name, color))
    obj.data.calc_loop_triangles()
    if len(obj.data.loop_triangles) > limit:
        decimate = obj.modifiers.new('Mobile surface', 'DECIMATE')
        decimate.ratio = limit / len(obj.data.loop_triangles)
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    obj.data.validate()
    obj.data.update()
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.select_set(False)


def tube(name, chains, color):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 0.037
    curve.bevel_resolution = 3
    curve.resolution_u = 4
    curve.use_fill_caps = True
    for points in chains:
        breaks = np.flatnonzero(np.linalg.norm(np.diff(points, axis=0), axis=1) > 0.24) + 1
        for segment in np.split(points, breaks):
            if len(segment) < 2:
                continue
            spline = curve.splines.new('BEZIER')
            spline.bezier_points.add(len(segment) - 1)
            for knot, point in zip(spline.bezier_points, segment):
                knot.co = point
                knot.handle_left_type = knot.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(lib.material(name, color))
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    bpy.context.object.select_set(False)


def build():
    lib.reset()
    groups = load_atoms()
    protein = np.vstack([points for (_, _, name), points in groups.items() if name == 'CA'])
    center = protein.mean(axis=0)
    _, axes = np.linalg.eigh(np.cov(protein.T))
    x, y = axes[:, 2], axes[:, 1]
    basis = np.column_stack((x, -np.cross(x, y), y))
    atoms = {key: (np.asarray(points) - center) @ basis * 0.020 for key, points in groups.items()}
    surface('GEO-Splice-Shell', np.vstack([p for (i, _, n), p in atoms.items() if n == 'CA' and i != 1]),
            0x7167bd, 26000)
    surface('GEO-Splice-Prp8', np.vstack([p for (i, _, n), p in atoms.items() if n == 'CA' and i == 1]),
            0xb392f8, 9000)
    tube('GEO-Splice-snRNA', [p for (i, _, n), p in atoms.items() if n == 'P' and i in (2, 6, 8)], 0x6ad9ed)
    tube('GEO-Splice-Substrate', [p for (i, _, n), p in atoms.items() if n == 'P' and i == 7], 0xf065bb)
    lib.export('spliceosome-5yzg')
    lib.report('spliceosome-5yzg')


if __name__ == '__main__':
    build()
