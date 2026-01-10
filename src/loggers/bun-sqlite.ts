/**
 * Bun SQLite Logger for graph-mode
 * 
 * This logger requires Bun runtime and uses the built-in bun:sqlite module.
 * Import from 'graph-mode/bun' to use this logger.
 * 
 * @example
 * ```ts
 * import { GraphRunner } from 'graph-mode';
 * import { BunSQLiteLogger } from 'graph-mode/bun';
 * import { Database } from 'bun:sqlite';
 * 
 * const db = new Database('./my-graph.db');
 * const logger = new BunSQLiteLogger(db);
 * 
 * const runner = new GraphRunner({
 *   graphName: 'my-graph',
 *   nodes: [...],
 *   startNode: 'START',
 *   input: {},
 *   logger,
 * });
 * ```
 */

import { Database } from "bun:sqlite";
import type { Logger, ExecutionLog } from "../logger.js";
import { serializeValue } from "../utils.js";

export class BunSQLiteLogger implements Logger {
	private db: Database;
	private initialized = false;

	/**
	 * Create a new BunSQLiteLogger.
	 * @param db - A Bun SQLite Database instance. If not provided, uses an in-memory database.
	 */
	constructor(db?: Database) {
		this.db = db ?? new Database(":memory:");
		this.initializeDb();
	}

	private initializeDb(): void {
		if (this.initialized) return;

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS Graphs(
				id TEXT PRIMARY KEY,
				graphName TEXT UNIQUE
			)
		`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS Executions(
				id TEXT PRIMARY KEY,
				runId TEXT,
				graphId TEXT,
				nodeType TEXT,
				input TEXT,
				output TEXT,
				routed TEXT,
				datetime TEXT,
				success INTEGER
			)
		`);

		this.initialized = true;
	}

	registerGraph(graphName: string): string {
		const existing = this.db
			.prepare(`SELECT id FROM Graphs WHERE graphName = ? LIMIT 1`)
			.get(graphName) as { id: string } | null;

		if (existing) {
			return existing.id;
		}

		const graphId = crypto.randomUUID();
		this.db
			.prepare(`INSERT INTO Graphs(id, graphName) VALUES(?, ?)`)
			.run(graphId, graphName);

		return graphId;
	}

	logExecution(log: ExecutionLog): void {
		this.db
			.prepare(
				`INSERT INTO Executions(id, runId, graphId, nodeType, input, output, routed, datetime, success) 
				 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				log.id,
				log.runId,
				log.graphId,
				log.nodeType,
				serializeValue(log.input),
				serializeValue(log.output),
				log.routed,
				log.datetime,
				log.success ? 1 : 0
			);
	}

	/**
	 * Get the underlying database instance for custom queries.
	 */
	getDatabase(): Database {
		return this.db;
	}

	/**
	 * Get all executions for a specific run.
	 */
	getExecutions(runId: string): ExecutionLog[] {
		return this.db
			.prepare(`SELECT * FROM Executions WHERE runId = ? ORDER BY datetime`)
			.all(runId) as ExecutionLog[];
	}

	/**
	 * Get all runs for a specific graph.
	 */
	getRuns(graphName: string): string[] {
		const graphId = this.db
			.prepare(`SELECT id FROM Graphs WHERE graphName = ? LIMIT 1`)
			.get(graphName) as { id: string } | null;

		if (!graphId) return [];

		const runs = this.db
			.prepare(`SELECT DISTINCT runId FROM Executions WHERE graphId = ?`)
			.all(graphId.id) as { runId: string }[];

		return runs.map((r) => r.runId);
	}
}
