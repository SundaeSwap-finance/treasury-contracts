import alias from '@rollup/plugin-alias';
import resolve from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import commonjs from '@rollup/plugin-commonjs';
import json from "@rollup/plugin-json";
import tsConfigPaths from 'rollup-plugin-tsconfig-paths';

export default {
  input: 'cli/cli.ts',
  output: { dir: 'dist/cli', format: 'esm' },
  plugins: [
    tsConfigPaths(),
    esbuild({
      target: 'nodenext',
      tsconfig: 'tsconfig.json',
      loaders: { '.ts': 'ts', '.tsx': 'tsx' }
    }),
    
    commonjs(),
    json(),
    alias({
      entries: [
        { find: "@emurgo/cardano-message-signing-browser", replacement: "@emurgo/cardano-message-signing-nodejs" }
      ]
    }),
    resolve({ preferBuiltins: true, extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'] })
  ],
  external: [
    '@blaze-cardano/uplc',
    '@blaze-cardano/uplc/wasm',
  ]
};
