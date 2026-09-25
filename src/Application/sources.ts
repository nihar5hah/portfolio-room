import { ALBUMS } from './Audio/AlbumAudio';

const sources: Resource[] = [
    ...Object.keys(ALBUMS).flatMap((slug): Resource[] => [
        {
            name: `poster_${slug}`,
            type: 'texture',
            path: `room/albums/${slug}.jpg`,
            optional: true,
            lazy: true,
        },
        {
            name: `${slug}Vinyl`,
            type: 'texture',
            path: `room/${slug}-vinyl.jpg`,
            optional: true,
            lazy: true,
        },
    ]),
    { name: 'messiJersey', type: 'texture', path: 'room/messi-10.jpg' },
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
    {
        name: 'environmentModel',
        type: 'gltfModel',
        path: 'models/World/environment.glb',
    },
    {
        name: 'environmentTexture',
        type: 'texture',
        path: 'models/World/baked_environment.jpg',
    },
    {
        name: 'decorModel',
        type: 'gltfModel',
        path: 'models/Decor/decor.glb',
    },
    {
        name: 'decorTexture',
        type: 'texture',
        path: 'models/Decor/baked_decor_modified.jpg',
    },
    {
        name: 'mouseDown',
        type: 'audio',
        path: 'audio/mouse/mouse_down.mp3',
    },
    {
        name: 'mouseUp',
        type: 'audio',
        path: 'audio/mouse/mouse_up.mp3',
    },
    {
        name: 'keyboardKeydown1',
        type: 'audio',
        path: 'audio/keyboard/key_1.mp3',
    },
    {
        name: 'keyboardKeydown2',
        type: 'audio',
        path: 'audio/keyboard/key_2.mp3',
    },
    {
        name: 'keyboardKeydown3',
        type: 'audio',
        path: 'audio/keyboard/key_3.mp3',
    },
    {
        name: 'keyboardKeydown4',
        type: 'audio',
        path: 'audio/keyboard/key_4.mp3',
    },
    {
        name: 'keyboardKeydown5',
        type: 'audio',
        path: 'audio/keyboard/key_5.mp3',
    },
    {
        name: 'keyboardKeydown6',
        type: 'audio',
        path: 'audio/keyboard/key_6.mp3',
    },
    {
        name: 'startup',
        type: 'audio',
        path: 'audio/startup/startup.mp3',
    },
    {
        name: 'office',
        type: 'audio',
        path: 'audio/atmosphere/office.mp3',
    },
    {
        name: 'ccType',
        type: 'audio',
        path: 'audio/cc/type.mp3',
    },
];

export default sources;
