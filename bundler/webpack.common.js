const path = require('path');
const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlPlugin = require('html-webpack-plugin');
const CSSPlugin = require('mini-css-extract-plugin');
module.exports = {
    entry: { room: './src/script.ts', desktop: './desktop/src/index.tsx' },
    output: {
        path: path.resolve(__dirname, '../dist'),
        filename: '[name].[contenthash].js',
        // Hashed names get a year of caching from the server (immutable).
        assetModuleFilename: '[name].[contenthash][ext]',
        publicPath: '/',
        clean: true,
    },
    optimization: {
        splitChunks: {
            cacheGroups: {
                // React is shared by the room's UI and the desktop in the
                // Mac's screen: download it once for both.
                react: {
                    test: /[\\/]node_modules[\\/](react|react-dom|scheduler|object-assign)[\\/]/,
                    name: 'react',
                    chunks: 'all',
                    priority: 20,
                },
                // three.js changes far less often than the room's own code:
                // a separate file stays cached across room updates.
                three: {
                    test: /[\\/]node_modules[\\/]three[\\/]/,
                    name: 'three',
                    chunks: 'all',
                    priority: 10,
                },
            },
        },
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: 'static',
                    // The album library is local-only (git-ignored): list
                    // only tracks whose files exist, so a deploy without the
                    // music ships an empty playlist and the room hides the
                    // player instead of showing an error.
                    transform(content, absoluteFrom) {
                        if (
                            !absoluteFrom.endsWith(
                                path.join('audio', 'playlist.json'),
                            )
                        )
                            return content;
                        const list = JSON.parse(content.toString());
                        list.tracks = list.tracks.filter((track) =>
                            fs.existsSync(
                                path.join(__dirname, '../static', track.src),
                            ),
                        );
                        return JSON.stringify(list);
                    },
                    globOptions: {
                        ignore: [
                            '**/draco/**',
                            '**/images/**',
                            '**/layers/png/**',
                            '**/environmentMap/**',
                            '**/video/real.mp4',
                            '**/audio/radio/**',
                            '**/audio/computer/**',
                            '**/audio/atmosphere/office.ogg',
                            '**/baked_decor.jpg',
                            // Unused by the site (legacy bakes, videos, spare
                            // models); kept as sources, never deployed.
                            '**/textures/monitor/**',
                            '**/models/World/**',
                            '**/models/Computer/**',
                            '**/models/Begu/shiba.glb',
                            '**/models/Decor/baked_decor_modified.jpg',
                            '**/models/Decor/decor.glb',
                        ],
                    },
                },
            ],
        }),
        new CSSPlugin({ filename: '[name].[contenthash].css' }),
        new HtmlPlugin({ template: 'src/index.html', chunks: ['room'] }),
        new HtmlPlugin({
            template: 'desktop/public/index.html',
            filename: 'desktop/index.html',
            chunks: ['desktop'],
        }),
    ],
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        // three.js from its source modules (it declares itself side-effect
        // free), so the unused parts of the library are left out.
        alias: {
            three$: path.resolve(
                __dirname,
                '../node_modules/three/src/Three.js',
            ),
        },
    },
    module: {
        rules: [
            {
                test: /\.[jt]sx?$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            // Browsers with WebGL 2 all run modern JS: no ES5
                            // down-levelling (smaller, faster code).
                            [
                                '@babel/preset-env',
                                {
                                    targets:
                                        'defaults and fully supports es6-module',
                                },
                            ],
                            '@babel/preset-react',
                            '@babel/preset-typescript',
                        ],
                    },
                },
            },
            {
                test: /\.css$/,
                use: [
                    CSSPlugin.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            url: {
                                filter: (url) => !url.startsWith('/fonts/'),
                            },
                        },
                    },
                ],
            },
            {
                test: /\.(png|jpe?g|gif|svg|webp|ttf|woff2?|pdf|mp4|mp3|wav)$/,
                type: 'asset/resource',
            },
            {
                test: /\.(glsl|vs|fs|vert|frag)$/,
                use: ['glslify-import-loader', 'raw-loader', 'glslify-loader'],
            },
        ],
    },
};
