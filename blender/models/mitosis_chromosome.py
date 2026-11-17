# Двухроматидная хромосома: иллюстративная мезоскопическая укладка хроматина.
# Не атомная структура целой хромосомы и не фиксированная 30-нм фибрилла.
# Единица = 1 нм; в координатах приложения длинная ось X, кинетохор над первой
# хроматидой со стороны -Y. Центральная поверхность при X=0 находится около Y=94.
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bpy
from mathutils import Vector
import lib
lib.reset()
TAU = 2 * math.pi

def section(t, sister):
    x = t * 1050
    split = 115 + 260 * abs(t)**1.3
    center = 325 + (1 if sister else -1) * split
    r = (116 + 49 * (1-math.exp(-t*t/0.05))) * max(0,1-abs(t)**8)**.45
    return x,center,r

def surface(t, a, sister, lift=0):
    x,cy,r = section(t,sister)
    # Неровная поверхность плотной укладки; не отдельная мембрана.
    rough = 1 + .022*math.sin(t*71+a*9)*math.sin(a*13-t*23) + .014*math.cos(t*137-a*7)
    rr = r*rough + lift
    return Vector((x, cy-rr*math.cos(a), rr*math.sin(a)*.88))

def blender(p): return (p.x,-p.z,p.y)

def body(name, sister, steps, around):
    verts, faces = [],[]
    for i in range(steps+1):
        t = -.9998 + 1.9996*i/steps
        for j in range(around): verts.append(blender(surface(t,TAU*j/around,sister)))
    for i in range(steps):
        for j in range(around):
            a=i*around+j; b=i*around+(j+1)%around
            faces.append((a,a+around,b+around,b))
    faces.extend([tuple(range(around)),tuple(steps*around+j for j in range(around-1,-1,-1))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    lib.assign(obj,lib.material(name,0x008ca5))
    for p in mesh.polygons:p.use_smooth=True
    return obj

def filaments(name,sister):
    # Нерегулярные складки на поверхности: геометрия укладки реконструирована.
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=1
    curve.bevel_depth=2.8;curve.bevel_resolution=0;curve.resolution_u=1
    for k in range(36):
        spline=curve.splines.new('POLY'); spline.points.add(96)
        for i,p in enumerate(spline.points):
            t=-.985+1.97*i/96
            a=TAU*k/36 + .037*math.sin(t*73+k*2.7)+.02*math.sin(t*151+k)
            v=surface(t,a,sister,1.2)
            p.co=(*blender(v),1)
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.convert(target='MESH');obj=bpy.context.object
    lib.assign(obj,lib.material(name,0x00b6cd))
    for p in obj.data.polygons:p.use_smooth=True
    obj.select_set(False)

for sister in (0,1):
    body('chrom_body_near_'+str(sister),sister,144,48)
    body('chrom_body_far_'+str(sister),sister,48,20)
    filaments('chrom_folds_'+str(sister),sister)
lib.export('mitosis_chromosome')
lib.report('mitosis_chromosome')
# На превью не дублировать совпадающие уровни детализации.
for o in list(bpy.data.objects):
    if '_far_' in o.name: bpy.data.objects.remove(o,do_unlink=True)
    else: o.scale *= .001  # превью в метрах: камера lib.preview имеет clip_end=1000
bpy.context.view_layer.update()
lib.preview('mitosis_chromosome',900)
