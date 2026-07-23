import { build } from 'esbuild';
import { minify } from 'terser';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

// Self-contained bundles per entrypoint: ultrahtml external so apps already
// using the companion never pay for it twice, core duplicated nowhere else.
for (const f of ['index', 'ast', 'dom']) {
  await build({
    entryPoints: [`src/${f}.ts`],
    outfile: `dist/${f}.js`,
    bundle: true,
    external: ['ultrahtml'],
    format: 'esm',
    target: 'es2022',
  });
  const { code } = await minify(readFileSync(`dist/${f}.js`, 'utf8'), {
    module: true,
    toplevel: true,
    compress: true,
    mangle: true,
  });
  writeFileSync(`dist/${f}.js`, code);
  console.log(`${f}\t${code.length} B\t${gzipSync(code).length} B gzip`);
}
