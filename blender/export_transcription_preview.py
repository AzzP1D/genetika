"""Export the two editable Pol II meshes and their landmarks from the review scene."""

from pathlib import Path

import bpy


root = Path(__file__).resolve().parent.parent
draft = root / 'blender' / 'previews' / 'transcription' / 'transcription-initiation.blend'
bpy.ops.wm.open_mainfile(filepath=str(draft), load_ui=False)
pieces = [obj for obj in bpy.data.collections['ДНК и РНК-полимераза'].objects if obj.name.startswith('Pol II')]
anchors = list(bpy.data.collections['Точки привязки полимеразы'].objects)
assert len(pieces) == 2 and len(anchors) == 3
bpy.ops.object.select_all(action='DESELECT')
for obj in [*pieces, *anchors]:
    obj.select_set(True)
out = root / 'app' / 'models' / 'pol2-preview.glb'
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                          export_cameras=False, export_lights=False, export_animations=False)
