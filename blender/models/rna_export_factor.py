"""Compact surfaces of p15 and the resolved TAP fragment from RCSB PDB 1JKG."""
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lib

source = Path(lib.ROOT, 'models_raw', 'pdb', '1JKG.cif')
columns, chains = [], {'A': [], 'B': []}
with source.open(encoding='utf-8') as stream:
    for line in stream:
        if line.startswith('_atom_site.'):
            columns.append(line.split('.', 1)[1].strip())
        elif columns and line.startswith('ATOM '):
            atom = dict(zip(columns, line.split()))
            chain = atom['label_asym_id']
            if chain in chains and atom['label_atom_id'] == 'CA' and atom['label_alt_id'] in ('.', 'A'):
                chains[chain].append(Vector(tuple(float(atom[f'Cartn_{axis}']) for axis in 'xyz')))
        elif columns and line.startswith('#'):
            break

if any(not chain for chain in chains.values()):
    raise ValueError('Expected p15 (A) and TAP (B) in PDB 1JKG')

lib.reset()
positions = chains['A'] + chains['B']
center = sum(positions, Vector()) / len(positions)
scale = 0.027
for chain, name, color in [('A', 'NXT1', 0xf8db96), ('B', 'NXF1-fragment', 0xeaa05b)]:
    field = bpy.data.metaballs.new(name)
    field.resolution = field.render_resolution = 0.045
    field.threshold = 0.6
    for point in chains[chain]:
        element = field.elements.new()
        element.co = (point - center) * scale
        element.radius = 5.6 * scale
    obj = bpy.data.objects.new(f'GEO-{name}', field)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    mesh = bpy.context.object
    decimate = mesh.modifiers.new('Mobile mesh', 'DECIMATE')
    decimate.ratio = 0.36
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for face in mesh.data.polygons:
        face.use_smooth = True
    lib.assign(mesh, lib.material(name, color))

lib.export('rna_export_factor')
