import * as THREE from 'three';

/**
 * Meshopt-packed models store positions (and normals, UVs) as normalized
 * integers. This three.js (r137) draws them correctly but reads them raw on
 * the CPU: `getX` returns -22930 instead of -0.7, so raycasting (clicking),
 * bounds and anything else that reads vertices misses the model entirely.
 * Convert such attributes back to plain floats, once, in place.
 */
export function dequantize(object: THREE.Object3D) {
    object.traverse((part) => {
        const mesh = part as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry;
        let changed = false;
        for (const name of Object.keys(geometry.attributes)) {
            const attribute = geometry.getAttribute(name) as
                | THREE.BufferAttribute
                | THREE.InterleavedBufferAttribute;
            if (!attribute.normalized) continue;
            const array = ((attribute as THREE.BufferAttribute).array ??
                (attribute as THREE.InterleavedBufferAttribute).data.array) as
                | Int8Array
                | Uint8Array
                | Int16Array
                | Uint16Array;
            // Largest magnitude for the integer type, per the glTF spec.
            const max =
                array instanceof Int8Array
                    ? 127
                    : array instanceof Uint8Array
                      ? 255
                      : array instanceof Int16Array
                        ? 32767
                        : 65535;
            const signed =
                array instanceof Int8Array || array instanceof Int16Array;
            const size = attribute.itemSize;
            const out = new Float32Array(attribute.count * size);
            const read = [
                attribute.getX,
                attribute.getY,
                attribute.getZ,
                attribute.getW,
            ];
            for (let i = 0; i < attribute.count; i++)
                for (let c = 0; c < size; c++) {
                    const v = read[c].call(attribute, i) / max;
                    out[i * size + c] = signed ? Math.max(v, -1) : v;
                }
            geometry.setAttribute(name, new THREE.BufferAttribute(out, size));
            changed = true;
        }
        if (changed) {
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        }
    });
    return object;
}
