import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/meshcore-card.js",
    format: "iife",
    name: "MeshcoreCardBundle",
    sourcemap: false,
  },
  plugins: [
    nodeResolve(),
    typescript({
      tsconfig: "./tsconfig.json",
      noEmit: false,
    }),
  ],
};
