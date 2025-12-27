import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/testing.ts',
    'src/integrations/express.ts',
    'src/integrations/koa.ts',
    'src/integrations/fastify.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
  target: 'node18',
  external: ['express', 'koa', 'fastify'],
})
