// Renders the loading screen's blueprint (static/room/blueprint.webp) from
// the live room, from the loading camera, so the drawing lines up with the
// room when it fades in (LoadingScreen.tsx).
//
// 1. npm run build && npm run preview, open http://127.0.0.1:5181/?debug
// 2. Paste this into the browser console and wait for the download.
// 3. Convert: cwebp -q 82 -alpha_q 90 blueprint.png -o static/room/blueprint.webp
//    (or sharp/Pillow with WebP quality 82).
// 4. If the camera or furniture moved, update ANCHORS in LoadingScreen.tsx
//    from the "anchors" object this logs.
//
// Hidden lines are removed with a depth-only pass; floors, walls and the
// ceiling are drawn as faint construction lines, furniture in full. Begu
// and the ball move, so they are left out.
(async () => {
    const T = await import(
        'https://unpkg.com/three@0.137.5/build/three.module.js'
    );
    const app = window.__app;
    const W = 3000;
    const H = 1250; // 2.4:1, wide enough for any landscape screen
    app.scene.updateMatrixWorld(true);
    const moving = (o) => {
        for (let p = o; p; p = p.parent)
            if (
                /Begu — animated|Football|Dust in the lamp|Graduation Bear|glow|light$|moonlight|Contact shadow|halo/i.test(
                    p.name || '',
                )
            )
                return true;
        return false;
    };
    const scene = new T.Scene();
    const depth = new T.MeshBasicMaterial({
        colorWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        side: T.DoubleSide,
    });
    const strong = new T.LineBasicMaterial({ color: 0xffffff });
    const faint = new T.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.28,
    });
    app.scene.traverse((o) => {
        if (!o.isMesh || o.isSkinnedMesh || moving(o)) return;
        for (let p = o; p; p = p.parent) if (p.visible === false) return;
        const position = o.geometry.attributes.position;
        if (!position) return;
        const geometry = new T.BufferGeometry();
        const array = new Float32Array(position.count * 3);
        for (let i = 0; i < position.count; i++) {
            array[i * 3] = position.getX(i);
            array[i * 3 + 1] = position.getY(i);
            array[i * 3 + 2] = position.getZ(i);
        }
        geometry.setAttribute('position', new T.BufferAttribute(array, 3));
        if (o.geometry.index)
            geometry.setIndex(Array.from(o.geometry.index.array));
        const matrix = new T.Matrix4().fromArray(o.matrixWorld.elements);
        geometry.computeBoundingBox();
        const box = geometry.boundingBox.clone().applyMatrix4(matrix);
        const size = box.getSize(new T.Vector3());
        const structure =
            box.max.y < -2850 ||
            (size.y < 40 && box.max.y < -2400) ||
            Math.max(size.x, size.y, size.z) > 14000;
        const mesh = new T.Mesh(geometry, depth);
        const lines = new T.LineSegments(
            new T.EdgesGeometry(geometry, 28),
            structure ? faint : strong,
        );
        for (const part of [mesh, lines]) {
            part.matrixAutoUpdate = false;
            part.matrix.copy(matrix);
            scene.add(part);
        }
    });
    const camera = new T.PerspectiveCamera(44, W / H, 100, 900000);
    camera.position.set(-12500, 7500, 15500);
    camera.lookAt(-350, -600, 200);
    camera.updateMatrixWorld();
    const renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    const anchors = {};
    for (const name of [
        'MacBook Pro M3',
        'Begu bed',
        'Bookshelf',
        'Dune sofa',
        'Bed and walnut headboard',
    ]) {
        const object = app.scene.getObjectByName(name);
        if (!object) continue;
        const box = new T.Box3();
        object.traverse((c) => {
            if (!c.isMesh) return;
            c.geometry.computeBoundingBox();
            const b = c.geometry.boundingBox;
            box.union(
                new T.Box3(
                    new T.Vector3().copy(b.min),
                    new T.Vector3().copy(b.max),
                ).applyMatrix4(
                    new T.Matrix4().fromArray(c.matrixWorld.elements),
                ),
            );
        });
        const c = box.getCenter(new T.Vector3());
        const p = new T.Vector3(c.x, box.max.y, c.z).project(camera);
        anchors[name] = {
            u: +((p.x + 1) / 2).toFixed(4),
            v: +((1 - p.y) / 2).toFixed(4),
        };
    }
    console.log('anchors', JSON.stringify(anchors));
    const link = document.createElement('a');
    link.download = 'blueprint.png';
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
    renderer.dispose();
})();
