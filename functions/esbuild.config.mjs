import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/bundle.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  external: [
    "@firebase/app",
    "@firebase/component",
    "@firebase/database",
    "@firebase/database-compat",
    "@firebase/logger",
    "@firebase/util",
    "@firebase/webchannel-wrapper",
    "firebase-admin",
    "firebase-functions",
  ],
});
