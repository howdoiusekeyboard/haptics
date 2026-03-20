import { defineConfig } from "tsup";
import { readFileSync, writeFileSync } from "fs";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	external: ["react", "react-dom"],
	treeshake: true,
	sourcemap: true,
	minify: false,
	async onSuccess() {
		// Prepend "use client" directive after all bundling/treeshaking is complete.
		// banner config gets stripped by rollup's treeshake pass, so we inject post-build.
		for (const file of ["dist/index.js", "dist/index.cjs"]) {
			const content = readFileSync(file, "utf8");
			writeFileSync(file, `"use client";\n${content}`);
		}
	},
});
