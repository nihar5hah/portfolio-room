# Reads the FIFA 14 Brazuca (Willams9991 / Sepak) RX3 mesh and textures into OBJ + PNG;
# then scripts/brazuca-build.py (Blender) exports a glb. Run inside the extracted "HD ver" folder.
import struct, numpy as np, io
from PIL import Image
m = open('specificball_0_990_0.rx3','rb').read()
t = open('specificball_0_990_0_textures.rx3','rb').read()
def sections(b):
    n = struct.unpack_from('<I', b, 12)[0]
    return [struct.unpack_from('<IIII', b, 16 + 16*i) for i in range(n)]
ms = sections(m)
idx_sec = next(s for s in ms if s[0] == 0x005878f4)
vtx_sec = next(s for s in ms if s[0] == 0x00587aa1)
_, icount, isize, _ = struct.unpack_from('<IIII', m, idx_sec[1])
idx = np.frombuffer(m, '<u2', icount, idx_sec[1] + 16).astype(np.int64)
_, vcount, stride, _ = struct.unpack_from('<IIII', m, vtx_sec[1])
raw = np.frombuffer(m, np.uint8, vcount*stride, vtx_sec[1] + 16).reshape(vcount, stride)
pos = raw[:, 0:12].copy().view('<f4').reshape(vcount, 3)
uv = raw[:, 20:24].copy().view('<f2').reshape(vcount, 2).astype(np.float32)
print('verts', vcount, 'tris', icount//3, 'bounds', pos.min(0), pos.max(0), 'uv', uv.min(0), uv.max(0))
with open('/tmp/brz/ball.obj','w') as f:
    f.write('mtllib ball.mtl\nusemtl Brazuca\n')
    for p in pos: f.write('v %.6f %.6f %.6f\n' % tuple(p))
    for u in uv: f.write('vt %.6f %.6f\n' % (u[0], 1 - u[1]))
    for a, b, c in idx.reshape(-1, 3) + 1: f.write(f'f {a}/{a} {b}/{b} {c}/{c}\n')
open('/tmp/brz/ball.mtl','w').write('newmtl Brazuca\nKd 1 1 1\nmap_Kd ball-color.png\n')
# Textures: DXT5 (BC3) 2048², mip 0 of each; wrap in a DDS header for Pillow.
ts = [s for s in sections(t) if s[0] == 0x7a0b60da]
for i, (h, off, size, _) in enumerate(ts):
    pitch, rows, msize, _ = struct.unpack_from('<IIII', t, off + 16)
    data = t[off + 32: off + 32 + msize]
    w = pitch // 16 * 4; hgt = rows * 4
    hdr = struct.pack('<4sIIIIIII44sIIIIIIIIIIIII', b'DDS ', 124, 0x81007, hgt, w, msize, 0, 1, b'\0'*44,
                      32, 4, b'DXT5'[0] | b'DXT5'[1]<<8 | b'DXT5'[2]<<16 | b'DXT5'[3]<<24, 0,0,0,0,0, 0x1000, 0,0,0,0)
    img = Image.open(io.BytesIO(hdr + data))
    img.load()
    name = ['color', 'normal'][i]
    img.save(f'/tmp/brz/ball-{name}.png')
    img.convert('RGB').resize((512, 512)).save(f'/tmp/brz/small-{name}.png')
    print(name, img.size, img.mode, np.array(img)[...,3].mean() if img.mode=='RGBA' else '')
