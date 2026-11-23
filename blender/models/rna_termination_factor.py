"""Export the experimentally resolved eRF1 chain from 3JAG."""
from pathlib import Path
import sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from translation_initiation import lib, read_structure, surface, export


lib.reset()
chains, entities = read_structure('3JAG')
release_chain, = (chain for chain, entity in entities.items() if entity == 86)
residues = [(int(index), point) for atom, index, _, point in chains[release_chain] if atom == 'CA']
coords = np.array([point for _, point in residues])
tip = np.mean([point for index, point in residues if index < 40], axis=0)
top = coords.mean(axis=0) - tip
top /= np.linalg.norm(top)
cross = np.cross(top, [0, 1, 0])
cross /= np.linalg.norm(cross)
basis = np.array([cross, np.cross(top, cross), top])
asset = surface('eRF1', (coords - tip) @ basis.T * 0.025, 0xe3a16e, 0.14, 0.059)
export('rna_erf1_specimen', [asset])
