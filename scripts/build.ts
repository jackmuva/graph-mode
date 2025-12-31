#!/usr/bin/env bun

import { $ } from "bun";
import { mkdir, cp } from "fs/promises";

console.log("🔨 Building Graph-Mode...\n");

try {
	// Step 1: Ensure dist directory exists
	console.log("📁 Creating distribution directory...");
	await mkdir("./dist", { recursive: true });
	await mkdir("./dist/public", { recursive: true });
	await mkdir("./dist/graph-scripts", { recursive: true });

	// Step 2: Build Vite UI
	console.log("📦 Building UI with Vite...");
	await $`bunx --bun vite build ui --config ui/vite.config.ts`;

	// Step 3: Copy server code to dist
	console.log("📦 Preparing server for bundling...");
	await cp("./server", "./dist/server", { recursive: true, force: true });

	// Step 4: Copy public folder for distribution with binary
	console.log("📦 Preparing assets...");
	await cp("./public", "./dist/public", { recursive: true, force: true });

	// Step 5: Bundle server into standalone binary
	console.log("📦 Bundling into standalone binary...");
	await $`bun build --compile ./dist/server/index.ts --outfile ./dist/graph-mode`;

	// Step 6: Make binary executable
	console.log("🔐 Making binary executable...");
	await $`chmod +x ./dist/graph-mode`;

	// Step 7: Clean up server copy (keep only binary and public)
	await $`rm -rf ./dist/server`;

	console.log("\n✅ Build complete!");
	console.log("📍 Distribution at: ./dist/");
	console.log("   - graph-mode (executable)");
	console.log("   - public/ (static files)");
	console.log("🚀 To distribute: zip -r graph-mode.zip dist/");
	console.log("🚀 To run: unzip && ./graph-mode\n");

} catch (error) {
	console.error("❌ Build failed:", error);
	process.exit(1);
}
