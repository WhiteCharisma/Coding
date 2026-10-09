// Bundles the server into dist/ with esbuild.
// - Workspace code (@creator-network/shared) is bundled in.
// - npm dependencies stay external and are loaded from node_modules at runtime
//   (native modules like better-sqlite3 and argon2 cannot be bundled).
import { build } from 'esbuild';
import { cp, readFile, rm } from 'node:fs/promises';

const rootPkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

const externalizeDeps = {
  name: 'externalize-deps',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@creator-network/')) return undefined;
      return { path: args.path, external: true };
    });
  },
};

await rm('dist', { recursive: true, force: true });
await build({
  entryPoints: { main: 'src/main.ts', cli: 'src/cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  plugins: [externalizeDeps],
  logLevel: 'info',
  define: { __APP_VERSION__: JSON.stringify(rootPkg.version) },
  banner: {
    // Allow bundled ESM code to use require() for any CommonJS interop.
    js: "import { createRequire as __cnCreateRequire } from 'node:module'; const require = __cnCreateRequire(import.meta.url);",
  },
});
// SQL migrations are read at runtime by the migrator.
await cp('drizzle', 'dist/drizzle', { recursive: true });
