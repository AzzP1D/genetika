"""Export the three schematic protein shapes used in the termination lesson."""

from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lib


def surface(name, color, x, lobes):
    data = bpy.data.metaballs.new(name)
    data.resolution = data.render_resolution = 0.028
    data.threshold = 0.58
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location.x = x
    for center, radius, proportions in lobes:
        lobe = data.elements.new(type='ELLIPSOID')
        lobe.co = center
        lobe.radius = radius
        lobe.size_x, lobe.size_y, lobe.size_z = proportions
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    mesh = bpy.context.object
    mesh.name = name
    lib.assign(mesh, lib.material(name, color))
    for face in mesh.data.polygons:
        face.use_smooth = True
    mesh.select_set(False)


lib.reset()
surface('GEO-CPSF', 0xffbd62, 0, [
    ((-0.20, -0.04, 0.01), 0.48, (1.16, 0.81, 0.88)),
    ((0.17, 0.17, -0.06), 0.41, (1.04, 0.83, 0.94)),
    ((0.32, -0.17, 0.09), 0.36, (0.77, 1.07, 0.77)),
    ((-0.13, 0.21, 0.15), 0.32, (0.80, 1.04, 0.86)),
    ((0.03, -0.05, 0.29), 0.34, (1.25, 0.68, 0.78)),
])
surface('GEO-CPSF73', 0xd2a5ff, 1.6, [
    ((-0.12, 0.05, 0.01), 0.41, (0.90, 1.14, 0.85)),
    ((0.18, 0.13, -0.07), 0.35, (0.9, 0.78, 1.07)),
    ((-0.02, -0.17, 0.16), 0.29, (1.09, 0.88, 0.78)),
    ((0.17, -0.12, -0.12), 0.25, (1.05, 0.9, 0.9)),
])
surface('GEO-XRN2', 0x8bdca0, 3.2, [
    ((0.01, 0.05, 0.01), 0.46, (0.94, 1.15, 0.92)),
    ((-0.19, -0.22, 0.07), 0.31, (0.98, 1.32, 0.83)),
    ((0.22, -0.18, -0.03), 0.34, (0.78, 1.28, 0.82)),
    ((-0.12, 0.24, -0.10), 0.32, (0.92, 1.04, 1.13)),
])
lib.export('transcription-termination')
