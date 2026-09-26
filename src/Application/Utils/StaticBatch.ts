import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Fewer draw calls: within each group, merge the unnamed pieces that share
 * a material (and shadow flags) into one mesh. The room is built from
 * hundreds of boxes and cylinders — slats, bookshelf boards, speaker parts,
 * record grooves — each of which was its own draw call, twice with the
 * shadow pass.
 *
 * Merging happens per parent, in the parent's space, so every group keeps
 * its name, bounds and transform: groups that move (the spinning record,
 * a lamp) move their merged pieces with them, and clicking a merged piece
 * still resolves to the group it belongs to. Named meshes are never merged
 * (code looks them up or changes them), nor are skinned, instanced,
 * transparent, multi-material, mirrored or custom-raycast meshes.
 */
export function batchStatic(root: THREE.Object3D, minimum = 2) {
    const parents: THREE.Object3D[] = [];
    root.traverse((object) => {
        if (object.children.length >= minimum && !object.userData.noBatch)
            parents.push(object);
    });
    let merged = 0,
        batches = 0;
    for (const parent of parents) {
        const groups = new Map<string, THREE.Mesh[]>();
        for (const child of parent.children) {
            const mesh = child as THREE.Mesh;
            if (!eligible(mesh)) continue;
            const key = keyOf(mesh);
            const list = groups.get(key);
            if (list) list.push(mesh);
            else groups.set(key, [mesh]);
        }
        for (const meshes of groups.values()) {
            if (meshes.length < minimum) continue;
            const geometries = meshes.map((mesh) => {
                mesh.updateMatrix();
                const geometry = mesh.geometry.clone();
                geometry.clearGroups();
                geometry.applyMatrix4(mesh.matrix);
                return geometry;
            });
            const geometry = mergeBufferGeometries(geometries, false);
            geometries.forEach((g) => g.dispose());
            if (!geometry) continue;
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            const first = meshes[0];
            const batch = new THREE.Mesh(geometry, first.material);
            batch.castShadow = first.castShadow;
            batch.receiveShadow = first.receiveShadow;
            batch.renderOrder = first.renderOrder;
            batch.frustumCulled = first.frustumCulled;
            batch.layers.mask = first.layers.mask;
            batch.userData.batched = meshes.length;
            // Static from here on: no per-frame matrix recomposition.
            batch.matrixAutoUpdate = false;
            batch.updateMatrix();
            parent.add(batch);
            for (const mesh of meshes) parent.remove(mesh);
            merged += meshes.length;
            batches++;
        }
    }
    return { merged, batches, saved: merged - batches };
}

function eligible(mesh: THREE.Mesh) {
    if (!mesh.isMesh || mesh.name !== '' || mesh.children.length) return false;
    if (
        (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
        (mesh as THREE.InstancedMesh).isInstancedMesh ||
        !mesh.visible ||
        mesh.userData.noBatch
    )
        return false;
    const material = mesh.material;
    if (!material || Array.isArray(material) || material.transparent)
        return false;
    // Custom behaviour attached to this particular object.
    if (
        mesh.raycast !== THREE.Mesh.prototype.raycast ||
        mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
    )
        return false;
    const geometry = mesh.geometry;
    if (!geometry?.attributes?.position) return false;
    if (Object.keys(geometry.morphAttributes).length) return false;
    for (const name of Object.keys(geometry.attributes))
        if ((geometry.attributes[name] as any).isInterleavedBufferAttribute)
            return false;
    // A mirrored piece would turn inside out once baked into the batch.
    mesh.updateMatrix();
    if (mesh.matrix.determinant() <= 0) return false;
    return true;
}

function keyOf(mesh: THREE.Mesh) {
    const material = mesh.material as THREE.Material;
    const geometry = mesh.geometry;
    const attributes = Object.keys(geometry.attributes)
        .sort()
        .map((name) => {
            const a = geometry.attributes[name] as THREE.BufferAttribute;
            return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`;
        })
        .join(',');
    return [
        material.uuid,
        mesh.castShadow,
        mesh.receiveShadow,
        mesh.renderOrder,
        mesh.frustumCulled,
        mesh.layers.mask,
        geometry.index ? 'indexed' : 'flat',
        attributes,
    ].join('|');
}
