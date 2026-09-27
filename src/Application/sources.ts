import { ALBUMS } from './Audio/AlbumAudio';

const sources: Resource[] = [
    ...Object.keys(ALBUMS).flatMap((slug): Resource[] => [
        {
            name: `poster_${slug}`,
            type: 'texture',
            path: `room/albums/${slug}.webp`,
            optional: true,
            lazy: true,
        },
        {
            name: `${slug}Vinyl`,
            type: 'texture',
            path: `room/${slug}-vinyl.webp`,
            optional: true,
            lazy: true,
        },
    ]),
    { name: 'messiJersey', type: 'texture', path: 'room/messi-10.webp' },
    {
        name: 'argentinaJersey',
        type: 'texture',
        path: 'room/argentina-messi-10.webp',
    },
    {
        name: 'graduationRug',
        type: 'texture',
        path: 'room/graduation-rug.webp',
    },
    { name: 'barcaCrest', type: 'texture', path: 'room/fc-barcelona.svg' },
    {
        name: 'macbookModel',
        type: 'gltfModel',
        path: 'models/MacBook/macbook-pro-m3.glb',
    },
    { name: 'beguModel', type: 'gltfModel', path: 'models/Begu/husky.glb' },
    { name: 'duneModel', type: 'gltfModel', path: 'models/Dune/dune-sofa.glb' },
    {
        name: 'loungeProps',
        type: 'gltfModel',
        path: 'models/Lounge/lounge-props.glb',
    },
    {
        name: 'spezialModel',
        type: 'gltfModel',
        path: 'models/Spezial/spezial-night-indigo.glb',
    },
    {
        name: 'roomProps',
        type: 'gltfModel',
        path: 'models/Room/room-props.glb',
    },
    { name: 'ps5Model', type: 'gltfModel', path: 'models/PS5/ps5.glb' },
    { name: 'chairModel', type: 'gltfModel', path: 'models/Chair/embody.glb' },
    {
        name: 'footballModel',
        type: 'gltfModel',
        path: 'models/Football/brazuca.glb',
    },
    {
        name: 'dropoutBearModel',
        type: 'gltfModel',
        path: 'models/Bear/dropout-bear.glb',
    },
    {
        name: 'dualSenseModel',
        type: 'gltfModel',
        path: 'models/PS5/dualsense.glb',
    },
    {
        name: 'duneFabricBump',
        type: 'texture',
        path: 'models/Dune/fabric-bump.webp',
    },
    {
        name: 'decorModel',
        type: 'gltfModel',
        path: 'models/Decor/coffee.glb',
    },
    {
        name: 'decorTexture',
        type: 'texture',
        path: 'models/Decor/coffee.jpg',
    },
];

export default sources;
