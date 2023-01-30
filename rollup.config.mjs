import typescript from '@rollup/plugin-typescript';

/** @type {import('rollup').RollupOptions} */
export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/zoiper5-rpc-api-js-wrapper.umd.js',
      format: 'umd',
      globals: {
        'simple-jsonrpc-js': 'simple_jsonrpc',
      },
      name: 'Z5RPC',
      sourcemap: true,
    },
    {
      file: 'dist/zoiper5-rpc-api-js-wrapper.esm.js',
      format: 'esm',
      sourcemap: true,
    },
  ],
  external: ['simple-jsonrpc-js'],
  plugins: [
    typescript({
      declaration: true,
      declarationDir: 'types',
    }),
  ],
};
