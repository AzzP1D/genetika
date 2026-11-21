# Экспериментальные детали для крупного плана телофазы, единица — нм.
# RCSB PDB CC0: 2BZF — BAF на ДНК, 6PEN — гексамер спастина.
from pathlib import Path
import json

source = Path(__file__).with_name('kinetochore_pdb.py')
exec(compile(source.read_text(encoding='utf-8').split('# ---------- 1.')[0], str(source), 'exec'))

# 2BZF, биологическая сборка 1: операция 2 (y, x, −z−1) из mmCIF.
# В нанометрах сдвиг по z равен −24.192. Используем обе копии BAF и ДНК.
def baf_mate(point):
    x, y, z = point
    return Vector((y, x, -z - 24.192))


baf_records = beads('2BZF')
baf = [(kind, p) for _, chain, _, kind, p in baf_records if chain == 'A']
dna = [(kind, p) for _, chain, _, kind, p in baf_records if chain in ('B', 'C')]
assert len(baf) > 80 and dna
center = mean([p for _, p in baf] + [baf_mate(p) for _, p in baf])
baf_frame = Frame(center, Vector((1, -1, 0)), Vector((1, 1, 0)))
blob('te_baf_a', baf, baf_frame, 0xffa85d, 620, .36)
blob('te_baf_b', [(k, baf_mate(p)) for k, p in baf], baf_frame, 0xff7843, 620, .36)
blob('te_baf_dna', dna + [(k, baf_mate(p)) for k, p in dna], baf_frame, 0x00e5ff, 740, .32)
backbones = [[p for _, chain, _, kind, p in sorted(baf_records, key=lambda item: item[2])
              if chain == name and kind == 'bb'] for name in 'BC']
assert all(len(strand) == 7 for strand in backbones)
metadata = {'bafSource': '2BZF', 'bafBackbonesNm': [
    [[list(baf_frame.to(mate(p))) for p in strand] for strand in backbones]
    for mate in (lambda p: p, baf_mate)
]}

# Цепи спастина имеют метки ABCDEG (авторские имена ABCDEF). Цепь F —
# экспериментальный пептид в канале, его здесь не изображаем.
spastin = {chain: [] for chain in 'ABCDEG'}
for entity, chain, _, kind, point in beads('6PEN'):
    if entity == '1' and chain in spastin:
        spastin[chain].append((kind, point))
assert all(len(chain) > 200 for chain in spastin.values())
centers = [mean([p for _, p in chain]) for chain in spastin.values()]
origin = mean(centers)
radial = [center - origin for center in centers]
axis = sum((v.cross(radial[(i + 1) % 6]) for i, v in enumerate(radial)), Vector()).normalized()
spastin_frame = Frame(origin, radial[0], axis)
for i, residue_beads in enumerate(spastin.values()):
    blob(f'te_spastin_{i + 1}', residue_beads, spastin_frame,
         0xff6477 if i % 2 else 0xff94a1, 720, .48)

lib.export('telophase_pdb')
lib.report('telophase_pdb')
with open(os.path.join(lib.ROOT, 'app/models/telophase_pdb.json'), 'w', encoding='utf-8') as outfile:
    json.dump(metadata, outfile, indent=2)

# Разведём две структуры только на проверочном ракурсе, в GLB начала координат общие.
for obj in bpy.context.scene.objects:
    if obj.name.startswith('te_baf_'):
        obj.location.x -= 11
    elif obj.name.startswith('te_spastin_'):
        obj.location.x += 6
lib.preview('telophase_pdb', 800)
