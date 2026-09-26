# Exports the CadNav Brazuca ball alone (no grass/soil), one subdivision level.
# blender -b Brazuca.blend --python scripts/brazuca-export.py   (then pack: 1024 px WebP, meshopt)
import bpy
for o in list(bpy.data.objects):
    if o.name != 'Brazuca': bpy.data.objects.remove(o)
ball = bpy.data.objects['Brazuca']
ball.location = (0, 0, 0)
m = ball.data.materials[0]
nodes = m.node_tree.nodes; nodes.clear()
out = nodes.new('ShaderNodeOutputMaterial'); bsdf = nodes.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Roughness'].default_value = 0.45
tex = nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images['brazuca.jpg']
m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
m.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
bpy.ops.object.select_all(action='DESELECT'); ball.select_set(True); bpy.context.view_layer.objects.active = ball
bpy.ops.object.shade_smooth()
md = ball.modifiers.new('smooth', 'SUBSURF'); md.levels = 1; md.render_levels = 1
bpy.ops.export_scene.gltf(filepath='/tmp/bear/brazuca-raw.glb', export_format='GLB', export_apply=True)
print('OK', len(ball.data.polygons))
