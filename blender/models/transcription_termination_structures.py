"""Simplified surfaces and RNA landmarks from public PDB entries 6DNH and 8YFQ."""

from collections import defaultdict
import gzip
from pathlib import Path
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from transcription_pic import dna_backbone, lib, protein_surface, root, SCALE


def load(entry, proteins, rna):
    groups = defaultdict(list)
    nucleotides = defaultdict(dict)
    path = root / 'blender' / 'previews' / 'transcription' / 'pdb' / f'{entry}.cif.gz'
    with gzip.open(path, 'rt') as f:
        columns = []
        for line in f:
            if line.startswith('_atom_site.'):
                columns.append(line.split()[0].split('.')[1])
            if not line.startswith('ATOM '):
                continue
            atom = dict(zip(columns, line.split()))
            chain = atom['label_asym_id']
            name = atom['label_atom_id'].strip('"')
            if chain not in proteins and chain != rna:
                continue
            if name != 'CA' and chain != rna:
                continue
            point = np.array([float(atom[f'Cartn_{axis}']) for axis in 'xyz'])
            if chain == rna:
                nucleotides[int(atom['label_seq_id'])][name] = point
            else:
                groups[chain].append(point)
    return groups, [nucleotides[index] for index in sorted(nucleotides)]


def landmark(name, coordinates):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = coordinates


def build(entry, proteins, rna, signal=False):
    lib.reset()
    groups, residues = load(entry, proteins, rna)
    phosphates = np.array([residue['P'] for residue in residues])
    center = np.concatenate([np.array(group) for group in groups.values()]).mean(axis=0)
    x = phosphates[5] - phosphates[0]
    x /= np.linalg.norm(x)
    z = phosphates[:3].mean(axis=0) - center
    z -= x * np.dot(x, z)
    z /= np.linalg.norm(z)
    y = np.cross(z, x)
    basis = np.column_stack((x, y, z))

    def project(points):
        return (np.array(points) - center) @ basis * SCALE

    for chain, (name, color, triangles) in proteins.items():
        protein_surface(name, project(groups[chain]), lib.material(name, color), triangles)
    dna_backbone('term_rna', project(phosphates), lib.material('term_rna', 0xf460c5))
    for i, residue in enumerate(residues):
        if signal and i >= 6:
            break
        point = residue['P'] if not signal else residue["C1'"]
        landmark(f'term_rna_{i}', project(point))
    lib.export(f'termination-{entry.lower()}')


build('6DNH', {
    'A': ('term_cpsf160', 0xf5af59, 9700),
    'B': ('term_wdr33', 0xf8cf80, 4400),
    'C': ('term_cpsf30', 0xd6a1ff, 2000),
}, 'D', signal=True)
build('8YFQ', {
    'P': ('term_rat1', 0x85d8a4, 8000),
    'Q': ('term_rai1', 0x5c9cb0, 4200),
}, 'O')
