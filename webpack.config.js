const path = require('path');
const webpack = require('webpack');
require('dotenv').config();

module.exports = {
  entry: './main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  module: {
    rules: [
      {
        parser: {
          amd: false
        }
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.ARDUINO_CLIENT_ID': JSON.stringify(process.env.ARDUINO_CLIENT_ID),
      'process.env.ARDUINO_CLIENT_SECRET': JSON.stringify(process.env.ARDUINO_CLIENT_SECRET)
    })
  ]
}; 