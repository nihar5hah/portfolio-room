const { merge } = require('webpack-merge');
const CleanCSS = require('clean-css');
const { sources } = require('webpack');

/** Minify the extracted CSS (webpack only minifies JS by itself). */
class MinifyCss {
    apply(compiler) {
        compiler.hooks.thisCompilation.tap('MinifyCss', (compilation) =>
            compilation.hooks.processAssets.tap(
                {
                    name: 'MinifyCss',
                    stage: compilation.constructor
                        .PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
                },
                (assets) => {
                    for (const name of Object.keys(assets)) {
                        if (!name.endsWith('.css')) continue;
                        const out = new CleanCSS({ level: 1 }).minify(
                            assets[name].source().toString(),
                        );
                        if (!out.errors.length)
                            compilation.updateAsset(
                                name,
                                new sources.RawSource(out.styles),
                            );
                    }
                },
            ),
        );
    }
}

module.exports = merge(require('./webpack.common'), {
    mode: 'production',
    devtool: false,
    plugins: [new MinifyCss()],
});
