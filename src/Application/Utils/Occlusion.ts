import * as THREE from 'three';

const ray = new THREE.Raycaster();
const direction = new THREE.Vector3();

const belongsTo = (object: THREE.Object3D, target: THREE.Object3D) => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent)
        if (o === target) return true;
    return false;
};

/**
 * True when something other than `target` sits between the camera and `point`.
 * Floating labels use it so a pill never points at the desk hiding its object.
 * ponytail: brute-force raycast over the scene; callers throttle it to a few
 * times a second. Upgrade path: a BVH (three-mesh-bvh) if it ever shows in a profile.
 */
export function occluded(
    scene: THREE.Scene,
    camera: THREE.Camera,
    point: THREE.Vector3,
    target: THREE.Object3D,
) {
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const distance = direction.subVectors(point, origin).length();
    ray.set(origin, direction.normalize());
    ray.far = distance - 60;
    return ray
        .intersectObjects(scene.children, true)
        .some((hit) => {
            const material = (hit.object as THREE.Mesh).material;
            const see = Array.isArray(material) ? material[0] : material;
            return (
                hit.object.visible &&
                !see?.transparent &&
                !belongsTo(hit.object, target)
            );
        });
}
