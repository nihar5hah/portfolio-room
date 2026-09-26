import bpy, math
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath='/tmp/brz/ball2.obj', forward_axis='NEGATIVE_Z', up_axis='Y')
ball = bpy.context.selected_objects[0]
ball.name = 'Brazuca'
m = bpy.data.materials.new('Brazuca'); m.use_nodes = True
nt = m.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Roughness'].default_value = 0.42
col = nt.nodes.new('ShaderNodeTexImage'); col.image = bpy.data.images.load('/tmp/brz/ball-color-rgb.png')
nor = nt.nodes.new('ShaderNodeTexImage'); nor.image = bpy.data.images.load('/tmp/brz/ball-normal-gl.png'); nor.image.colorspace_settings.name = 'Non-Color'
nmap = nt.nodes.new('ShaderNodeNormalMap'); nmap.inputs['Strength'].default_value = 0.6
nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(nor.outputs['Color'], nmap.inputs['Color']); nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
ball.data.materials.clear(); ball.data.materials.append(m)
import sys
if sys.argv[-1] == 'render':
    bpy.ops.object.camera_add(location=(0, -45, 8)); cam = bpy.context.object
    cam.rotation_euler = (math.radians(80), 0, 0); bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type='SUN', rotation=(0.8, 0.2, 0.3)); bpy.context.object.data.energy = 4
    w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.3, 0.3, 0.32, 1)
    sc = bpy.context.scene; sc.render.resolution_x = sc.render.resolution_y = 700
    sc.render.filepath = '/tmp/brz/ball-render.png'; bpy.ops.render.render(write_still=True)
else:
    bpy.ops.export_scene.gltf(filepath='/tmp/brz/brazuca-hd-raw.glb', export_format='GLB')
    print('EXPORTED')
