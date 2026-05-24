import { defineConfig } from "tsup";
import { promises as fs } from "node:fs";

const DIRECTIVE = '"use client";\n';

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	treeshake: true,
	sourcemap: true,
	minify: false,
	external: ["react", "react-dom", "@haptics/core", "@haptics/react"],
	// See packages/react/tsup.config.ts for the rationale on the post-process
	// hook — tsup's banner option and source-level directives are stripped by
	// rollup during the dts pass. This guarantees the directive lands in dist.
	async onSuccess() {
		for (const file of ["dist/index.js", "dist/index.cjs"]) {
			const content = await fs.readFile(file, "utf8");
			if (!content.startsWith(DIRECTIVE)) {
				await fs.writeFile(file, DIRECTIVE + content);
			}
		}
	},
});
