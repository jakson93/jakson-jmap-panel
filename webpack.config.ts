import path from 'path';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import baseConfig, { Env } from './.config/webpack/webpack.config';

// Extend the scaffold without changing generated .config files. Explicit entry
// and portable separators prevent an empty, falsely successful build on Windows.
export default async (env: Env) => {
  const config = await baseConfig(env);
  config.entry = { module: path.resolve(process.cwd(), 'src/module.ts') };
  const entryLoader = config.module?.rules?.[0];
  if (entryLoader && typeof entryLoader === 'object') {
    entryLoader.test = /src[\\/](?:.*[\\/])?module\.tsx?$/;
  }
  config.plugins?.push(
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'img/**/*.{png,svg,jpg,jpeg,webp}',
          to: '[path][name][ext]',
          noErrorOnMissing: true,
        },
      ],
    })
  );
  return config;
};
