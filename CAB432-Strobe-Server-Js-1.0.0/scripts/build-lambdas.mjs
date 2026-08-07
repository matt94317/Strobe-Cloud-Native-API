import { build } from "esbuild";
import { execSync } from "child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const lambdasDir = path.join(rootDir, "src/lambdas");
const distDir = path.join(rootDir, "dist");

// One entry per Phase 4 Lambda - must match the 6 controller groups in
// MIGRATION-PLAN.md / submission-infra.yml, not one per route file.
const LAMBDAS = ["auth", "post", "feed", "user", "upload", "moment"];

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function buildLambda(name) {
  const entryPoint = path.join(lambdasDir, `${name}.js`);
  const outDir = path.join(distDir, name);
  const outFile = path.join(outDir, "index.js");

  await build({
    entryPoints: [entryPoint],
    outfile: outFile,
    bundle: true,
    platform: "node",
    target: "node24",
    // CJS: ESM output breaks on Express's CJS dependency tree (esbuild can't
    // reliably shim dynamic require() calls buried in body-parser/depd etc.
    // when the bundle itself is ESM). config/index.js tolerates the
    // import.meta.url -> undefined side effect of bundling to CJS.
    format: "cjs",
    sourcemap: false,
    minify: false,
    logLevel: "silent",
  });

  // Zip alongside dist/<name>/ so `aws lambda update-function-code` can
  // upload dist/<name>.zip directly.
  const zipPath = path.join(distDir, `${name}.zip`);
  if (existsSync(zipPath)) rmSync(zipPath);
  execSync(`zip -q -r "${zipPath}" .`, { cwd: outDir });

  const { size } = statSync(zipPath);
  return { name, zipPath, size };
}

async function main() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  console.log(`Bundling ${LAMBDAS.length} Lambda functions...\n`);

  const results = [];
  for (const name of LAMBDAS) {
    const result = await buildLambda(name);
    results.push(result);
    console.log(`  ${name.padEnd(8)} -> dist/${name}.zip (${formatSize(result.size)})`);
  }

  console.log("\nDone. Deploy each with:");
  for (const { name } of results) {
    console.log(
      `  aws lambda update-function-code --function-name <prefix>-${name} --zip-file fileb://dist/${name}.zip`,
    );
  }
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
