/**
 * Represents a single node execution log entry
 */
export interface ExecutionLog {
	id: string;
	runId: string;
	graphId: string;
	nodeType: string;
	input: any;
	output: any;
	routed: string;
	datetime: string;
	success: boolean;
}

/**
 * Logger interface for tracking graph executions.
 * Implement this interface to create custom logging backends.
 */
export interface Logger {
	/**
	 * Register a graph and return its unique identifier.
	 * If the graph already exists, return the existing ID.
	 */
	registerGraph(graphName: string): string | Promise<string>;

	/**
	 * Log a node execution event.
	 */
	logExecution(log: ExecutionLog): void | Promise<void>;
}

/**
 * A no-op logger that discards all logs.
 * Used as the default when no logger is provided.
 */
export class NoOpLogger implements Logger {
	private graphIds: Map<string, string> = new Map();

	registerGraph(graphName: string): string {
		let graphId = this.graphIds.get(graphName);
		if (!graphId) {
			graphId = crypto.randomUUID();
			this.graphIds.set(graphName, graphId);
		}
		return graphId;
	}

	logExecution(_log: ExecutionLog): void {
		// No-op: discard the log
	}
}

/**
 * A simple console logger for debugging.
 * Logs execution events to the console.
 */
export class ConsoleLogger implements Logger {
	private graphIds: Map<string, string> = new Map();

	registerGraph(graphName: string): string {
		let graphId = this.graphIds.get(graphName);
		if (!graphId) {
			graphId = crypto.randomUUID();
			this.graphIds.set(graphName, graphId);
			console.log(`[graph-mode] Registered graph: ${graphName} (${graphId})`);
		}
		return graphId;
	}

	logExecution(log: ExecutionLog): void {
		const status = log.success ? "SUCCESS" : "FAILURE";
		console.log(
			`[graph-mode] [${status}] ${log.nodeType} -> ${log.routed} | Run: ${log.runId.slice(0, 8)}...`
		);
	}
}
