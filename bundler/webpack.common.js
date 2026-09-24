const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlPlugin = require('html-webpack-plugin');
const CSSPlugin = require('mini-css-extract-plugin');
module.exports = {
    entry: { room: './src/script.ts', desktop: './desktop/src/index.tsx' },
    output: {
        path: path.resolve(__dirname, '../dist'),
        filename: '[name].[contenthash].js',
        publicPath: '/',
        clean: true,
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: 'static',
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
        alias: { three: path.resolve(__dirname, '../node_modules/three') },
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
                            '@babel/preset-env',
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
