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

/**
 * For a model whose parts nothing looks up after set-up (the MacBook: 60
 * named glTF nodes, one draw call each): merge every eligible mesh under
 * `source`, at any depth, into one mesh per material in `target`'s space.
 * Subtrees `skip` returns true for are left alone (a lid that rotates is
 * merged separately, into its hinge). `transparent` also merges see-through
 * parts that share a material: one colour blends the same in any order.
 */
export function mergeModel(
    source: THREE.Object3D,
    target: THREE.Object3D,
    skip: (object: THREE.Object3D) => boolean = () => false,
    transparent = false,
) {
    source.updateWorldMatrix(true, true);
    target.updateWorldMatrix(true, false);
    const inverse = target.matrixWorld.clone().invert();
    const groups = new Map<
        string,
        { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[]
    >();
    const visit = (object: THREE.Object3D) => {
        if (object !== source && skip(object)) return;
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && eligible(mesh, true, transparent)) {
            const matrix = inverse.clone().multiply(mesh.matrixWorld);
            if (matrix.determinant() > 0) {
                const key = keyOf(mesh);
                const list = groups.get(key) ?? [];
                list.push({ mesh, matrix });
                groups.set(key, list);
            }
        }
        object.children.slice().forEach(visit);
    };
    visit(source);
    let before = 0,
        after = 0;
    for (const parts of groups.values()) {
        before += parts.length;
        if (parts.length < 2) {
            after++;
            continue;
        }
        const geometries = parts.map(({ mesh, matrix }) => {
            const geometry = mesh.geometry.clone();
            geometry.clearGroups();
            geometry.applyMatrix4(matrix);
            return geometry;
        });
        const geometry = mergeBufferGeometries(geometries, false);
        geometries.forEach((g) => g.dispose());
        if (!geometry) {
            after += parts.length;
            continue;
        }
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const first = parts[0].mesh;
        const batch = new THREE.Mesh(geometry, first.material);
        batch.castShadow = first.castShadow;
        batch.receiveShadow = first.receiveShadow;
        batch.renderOrder = first.renderOrder;
        batch.userData.batched = parts.length;
        batch.matrixAutoUpdate = false;
        target.add(batch);
        for (const { mesh } of parts) mesh.removeFromParent();
        after++;
    }
    return { before, after };
}

function eligible(mesh: THREE.Mesh, named = false, transparent = false) {
    if (!mesh.isMesh || (!named && mesh.name !== '') || mesh.children.length)
        return false;
    if (
        (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
        (mesh as THREE.InstancedMesh).isInstancedMesh ||
        !mesh.visible ||
        mesh.userData.noBatch
    )
        return false;
    const material = mesh.material;
    if (
        !material ||
        Array.isArray(material) ||
        (material.transparent && !transparent)
    )
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
    for (const name of Object.keys(geometry.attributes)) {
        const attribute = geometry.attributes[name] as THREE.BufferAttribute;
        if ((attribute as any).isInterleavedBufferAttribute) return false;
        // Still quantized (not run through Utils/Dequantize.ts): baking a
        // transform into packed integers would wreck the geometry.
        if (attribute.normalized) return false;
    }
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
