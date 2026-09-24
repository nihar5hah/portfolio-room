const { merge } = require('webpack-merge');
module.exports = merge(require('./webpack.common'), {
    mode: 'development',
    devtool: 'eval-cheap-module-source-map',
    devServer: {
        proxy: { '/api': 'http://127.0.0.1:5181' },
        host: '127.0.0.1',
        port: 5180,
        open: false,
        hot: false,
        static: false,
        historyApiFallback: false,
        client: { overlay: true },
    },
});
