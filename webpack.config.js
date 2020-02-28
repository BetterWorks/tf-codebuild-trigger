const ZipPlugin = require('zip-webpack-plugin');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: {
    index: './src/index.js',
  },
  output: {
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    path: `${__dirname}/dist`,
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  optimization: {
    minimize: true,
  },
  externals: {
    'aws-sdk': 'aws-sdk',
  },
  plugins: [
    new ZipPlugin({
      filename: 'tf-codebuild-trigger.zip',
    }),
  ],
};
