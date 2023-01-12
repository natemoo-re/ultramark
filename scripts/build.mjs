import { build } from "esbuild";
import colors from "chalk";

async function run() {
  const files = ["src/index.ts"];
  const output = {};
  const promises = [];
  for (const file of files) {
    const config = {
      metafile: true,
      entryPoints: [file],
      outfile: file.replace("src", "dist").replace(".ts", ".js"),
      external: ["tiny-decode"],
      bundle: true,
      format: "esm",
      minify: false,
      sourcemap: "external",
      target: "node16",
      platform: "node",
    }
    promises.push(
      build(config),
      build({ ...config, outfile: file.replace("src", "dist").replace(".ts", ".cjs"), format: 'cjs' })
    );
  }
  await Promise.all(promises);
  for (const [file, size] of Object.entries(output).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    console.log(`${file} ${colors.green(size)}`);
  }
}

run();
