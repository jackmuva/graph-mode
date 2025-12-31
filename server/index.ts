import { Database } from "bun:sqlite";
import * as path from "path";
import * as fs from "fs";

// Resolve database path relative to execution directory
const dbPath = path.join(process.cwd(), "graph-mode.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS Nodes(
    id TEXT PRIMARY KEY
  )
`);

// Resolve public directory
// The binary looks for public/ in the same directory as the executable
// This works when distributed as: dist/graph-mode + dist/public/
let publicDir = "";

try {
	// Try relative path from script (dev mode)
	const devPath = new URL("../public/", import.meta.url).pathname;
	if (fs.existsSync(devPath)) {
		publicDir = devPath;
	}
} catch {
	// Ignore error, will use CWD fallback
}

// If not found in dev location, assume we're running the bundled binary
// and public/ is in the same directory as the executable
if (!publicDir) {
	publicDir = path.join(process.cwd(), "public");
}

if (!fs.existsSync(publicDir)) {
	console.warn(`⚠️  Warning: Public directory not found at ${publicDir}`);
	console.warn("   Make sure to run from the directory containing both graph-mode and public/");
}

const PORT = 3000;
const HOST = "localhost";

Bun.serve({
	port: PORT,
	hostname: HOST,

	async fetch(req: Request) {
		const url = new URL(req.url);

		// API routes
		if (url.pathname.startsWith("/api")) {
			return handleAPI(req);
		}

		// Serve static UI files
		const filePath = path.join(
			publicDir,
			url.pathname === "/" ? "index.html" : url.pathname
		);

		// Check if file exists
		if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
			return new Response(Bun.file(filePath));
		}

		// Fallback to index.html for SPA routing (React Router)
		const indexPath = path.join(publicDir, "index.html");
		if (fs.existsSync(indexPath)) {
			return new Response(Bun.file(indexPath));
		}

		return new Response("Not Found", { status: 404 });
	},

	error(error) {
		console.error(error);
		return new Response("Internal Server Error", { status: 500 });
	},
});

// API route handler
function handleAPI(req: Request): Response {
	const url = new URL(req.url);

	if (url.pathname === "/api/posts") {
		if (req.method === "GET") {
			try {
				const posts = db.query("SELECT * FROM posts").all();
				return Response.json(posts);
			} catch {
				return Response.json([]);
			}
		}

		if (req.method === "POST") {
			// Create post
			return Response.json({ status: 201 });
		}
	}

	if (url.pathname.startsWith("/api/posts/")) {
		const id = url.pathname.split("/").pop();
		if (!id) {
			return new Response("Not Found", { status: 404 });
		}
		try {
			const post = db.query("SELECT * FROM posts WHERE id = ?").get(id);

			if (!post) {
				return new Response("Not Found", { status: 404 });
			}

			return Response.json(post);
		} catch {
			return new Response("Not Found", { status: 404 });
		}
	}

	return new Response("Not Found", { status: 404 });
}

console.log(`\n✨ Server running at http://${HOST}:${PORT}\n`);
