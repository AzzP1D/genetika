"""Build mobile surfaces for the RNA-bound DDX19 and the human pore scaffold."""
import gzip
from pathlib import Path
import shlex
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lib

RAW = Path(lib.ROOT, 'models_raw', 'pdb')


def read_atoms(accession):
    columns = []
    with gzip.open(RAW / f'{accession}.cif.gz', 'rt', encoding='utf-8') as stream:
        for line in stream:
            if line.startswith('_atom_site.'):
                columns.append(line.split('.', 1)[1].strip())
            elif columns and line.startswith(('ATOM ', 'HETATM ')):
                yield dict(zip(columns, line.split()))
            elif columns and line.startswith('#'):
                break


def position(atom):
    return Vector(tuple(float(atom[f'Cartn_{axis}']) for axis in 'xyz'))


def surface(name, points, color, radius, resolution):
    field = bpy.data.metaballs.new(name)
    field.resolution = field.render_resolution = resolution
    for point in points:
        node = field.elements.new()
        node.co = point
        node.radius = radius
    obj = bpy.data.objects.new(f'GEO-{name}', field)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    mesh = bpy.context.object
    mesh.name = f'GEO-{name}'
    decimate = mesh.modifiers.new('Mobile mesh', 'DECIMATE')
    decimate.ratio = 0.4
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    mesh.data.validate(clean_customdata=True)
    mesh.data.update()
    for face in mesh.data.polygons:
        face.use_smooth = True
    lib.assign(mesh, lib.material(name, color))
    return mesh


def build_ddx19():
    lib.reset()
    groups = {'A': [], 'B': [], 'C': [], 'D': []}
    for atom in read_atoms('3G0H'):
        chain = atom['label_asym_id']
        name = atom['label_atom_id'].strip('"')
        if chain not in groups or atom['type_symbol'] == 'H' or atom['label_alt_id'] not in ('.', 'A'):
            continue
        if chain == 'A' and name != 'CA':
            continue
        groups[chain].append(position(atom))
    if any(not points for points in groups.values()):
        raise ValueError('3G0H should contain DDX19B, RNA, ANP and magnesium')
    center = sum(groups['A'], Vector()) / len(groups['A'])
    entries = [('A', 'DDX19B', 0xf46088, 0.16), ('B', 'RNA', 0x51d7ed, 0.079),
               ('C', 'ANP', 0xffce6a, 0.073), ('D', 'Magnesium', 0xb4a2ee, 0.08)]
    for chain, name, color, radius in entries:
        surface(name, [(point - center) * 0.027 for point in groups[chain]], color, radius, 0.035)
    lib.export('ddx19_specimen')


def assembly_operators():
    data = []
    with gzip.open(RAW / '7R5J.cif.gz', 'rt', encoding='utf-8') as stream:
        for line in stream:
            if line.startswith('_pdbx_struct_oper_list.'):
                break
        for line in stream:
            if line.startswith('#'):
                break
            if not line.startswith('_pdbx_struct_oper_list.'):
                data.extend(shlex.split(line))
    if len(data) != 8 * 16:
        raise ValueError('Expected eight 7R5J assembly operators')
    for start in range(0, len(data), 16):
        values = list(map(float, data[start + 4:start + 16]))
        yield Matrix([values[0:4], values[4:8], values[8:12], [0, 0, 0, 1]])


def build_pore():
    lib.reset()
    voxels = {}
    for atom in read_atoms('7R5J'):
        if atom['label_atom_id'] == 'CA':
            point = position(atom)
            voxels.setdefault(tuple(round(axis / 18) for axis in point), point)
    center = Vector((993.6, 993.6, 993.6))
    scale = 0.009
    regions = [[], []]
    for point in voxels.values():
        region = 0 if abs(point.z - center.z) < 137 else 1
        regions[region].append((point - center) * scale)
    operators = list(assembly_operators())
    for points, name, color in zip(regions, ['Inner-ring', 'Outer-rings'], [0x66d9c5, 0x81a9e8]):
        spoke = surface(name, points, color, 0.22, 0.095)
        for matrix in operators[1:]:
            copy = spoke.copy()
            bpy.context.collection.objects.link(copy)
            rotated = matrix.to_3x3()
            transform = rotated.to_4x4()
            transform.translation = (rotated @ center + matrix.translation - center) * scale
            copy.matrix_world = transform
    lib.export('nuclear_pore_specimen')


build_ddx19()
build_pore()
