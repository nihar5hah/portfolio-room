# Poses the supplied DropoutBear.blend sitting and bakes it for the web.
# blender -b DropoutBear.blend --python scripts/bear-pose.py -- export   (then pack with gltf-transform: 512 px WebP, simplify 0.45, meshopt)
import bpy, math, sys
from mathutils import Matrix
arm = bpy.data.objects['Dropoutbear']
def rot(name, axis, deg):
    pb = arm.pose.bones[name]
    B = pb.bone.matrix_local.to_3x3()
    R = Matrix.Rotation(math.radians(deg), 3, axis)
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = (B.inverted() @ R @ B).to_quaternion() @ pb.rotation_quaternion
# Sitting: legs straight out in front (front is -Y), arms down at the sides,
# hands resting forward on the lap.
for side in 'LR':
    s = 1 if side == 'L' else -1
    rot(f'thigh.{side}', 'X', -86)
    rot(f'thigh.{side}', 'Z', s * 9)          # a little splayed
    rot(f'upper_arm.{side}', 'Y', s * 62)     # down
    rot(f'upper_arm.{side}', 'Z', -s * 18)    # and forward
    rot(f'lowerarm.{side}', 'Z', -s * 38)     # elbows bent toward the lap
rot('head', 'X', 6)                           # a slight nod down at the room
bpy.context.view_layer.update()
mode = sys.argv[-1]
sc = bpy.context.scene
if mode == 'render':
    sc.render.resolution_x = 900; sc.render.resolution_y = 900
    cam = sc.camera
    cam.location = (9, -26, 7); cam.rotation_euler = (math.radians(84), 0, math.radians(19))
    sc.render.filepath = '/tmp/bear/posed.png'
    bpy.ops.render.render(write_still=True)
    sys.exit()
# Bake: apply every modifier (the armature included) into plain meshes.
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects: o.select_set(False)
for o in meshes:
    o.hide_set(False); o.hide_viewport = False
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
bpy.ops.object.convert(target='MESH')
for o in meshes:
    o.parent = None
    o.matrix_world = o.matrix_world  # keep transform
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)
# Materials: toon node graphs to plain textured Principled BSDFs.
lit = {}
for m in bpy.data.materials:
    if not m.node_tree: continue
    nodes = m.node_tree.nodes
    tex = next((n for n in nodes if n.type == 'TEX_IMAGE' and n.image and 'stars' not in n.image.name), None)
    ramp = next((n for n in nodes if n.type == 'VALTORGB'), None)
    color = tuple(max(ramp.color_ramp.elements, key=lambda e: sum(e.color[:3])).color) if ramp else (1, 1, 1, 1)
    image = tex.image if tex else None
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 0.85 if m.name not in ('Nose', 'Claws') else 0.4
    m.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    if image and m.name != 'pant':
        t = nodes.new('ShaderNodeTexImage'); t.image = image
        m.node_tree.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if image.name.startswith('eye') or m.name in ('Stripes', 'StripesDots'):
            m.node_tree.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
            m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else None
    else:
        bsdf.inputs['Base Color'].default_value = color
    print('MAT', m.name, image.name if image else None, tuple(round(c, 3) for c in color))
bpy.ops.export_scene.gltf(filepath='/tmp/bear/bear-raw.glb', export_format='GLB', export_apply=True,
    export_yup=True, export_image_format='AUTO', export_materials='EXPORT')
print('EXPORTED')
