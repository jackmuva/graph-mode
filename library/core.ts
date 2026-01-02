import { Database } from "bun:sqlite";

const MAX_NODE_EXECUTIONS = 100;

export async function retry<T>(func: () => T | Promise<T>, maxAttempt: number = 3, attempt: number = 1, error?: Error): Promise<T> {
	if (attempt > maxAttempt) throw new Error(error?.message);
	try {
		const res: T = await func();
		return res;
	} catch (error) {
		await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1) * (attempt + 1))
		);
		return await retry(func, maxAttempt, attempt + 1, error);
	}
}

export const initializeDb = (db: Database) => {
	db.exec(`
	  CREATE TABLE IF NOT EXISTS Graphs(
		id TEXT PRIMARY KEY,
		graphName TEXT,
	  )`);
	db.exec(`
	  CREATE TABLE IF NOT EXISTS Runs(
		id TEXT PRIMARY KEY,
		graphId TEXT,
		nodeType TEXT,
		input TEXT,
		output TEXT,
		routed TEXT,
		datetime TEXT,
		success INTEGER,
	  )`);
};

export class GraphNode<InputType, OutputType, NodeEnum> {
	input: InputType;
	exec: (input: InputType) => OutputType | Promise<OutputType>;
	nodeType: string;
	routing: (output?: OutputType) => NodeEnum | null;

	constructor(params: {
		nodeType: string,
		input: InputType,
		exec: (input: InputType) => OutputType | Promise<OutputType>,
		routing: (output?: OutputType) => NodeEnum | null,
	}) {
		this.input = params.input;
		this.exec = params.exec;
		this.nodeType = params.nodeType;
		this.routing = params.routing;
	}
}

export class GraphRunner<NodeEnum> {
	graphName: string;
	nodes: GraphNode<any, any, NodeEnum>[];
	db: Database;
	startNode: NodeEnum;
	input: string;
	private nodeMap: { [nodeId: string]: GraphNode<any, any, NodeEnum> }

	constructor(params: {
		graphName: string,
		nodes: GraphNode<any, any, NodeEnum>[],
		db: Database,
		startNode: NodeEnum,
		input: any
	}) {
		this.graphName = params.graphName;
		this.nodes = params.nodes;
		this.db = params.db;
		this.startNode = params.startNode;
		this.input = params.input;

		initializeDb(this.db);
		const graphIdResult = this.db.prepare(`SELECT id FROM Graphs WHERE graphName = ? LIMIT 1`).all(this.graphName);
		if (graphIdResult.length === 0) {
			this.db.prepare(`INSERT INTO Graphs(id, graphName) VALUES(?, ?)`).run(crypto.randomUUID(), this.graphName);
		}
		this.nodeMap = {};
		this.initializeNodeMap();
	};

	private initializeNodeMap() {
		for (const node of this.nodes) {
			this.nodeMap[node.nodeType] = node;
		}
	};

	async run(): Promise<any> {
		const runId = crypto.randomUUID();
		const graphIdResult = this.db.prepare(`SELECT id FROM Graphs WHERE graphName = ? LIMIT 1`).all(this.graphName);
		if (graphIdResult.length === 0) throw Error("Could not find graphId");
		const graphId = (graphIdResult[0] as { id: string }).id;

		let nextNode: GraphNode<any, any, NodeEnum> | null = this.nodeMap[String(this.startNode)];
		let input: any = this.input;
		let nextNodeId: NodeEnum | null = null;
		let execution = await this.executeNode(nextNode, input, runId, graphId);
		let output = execution.output;
		nextNodeId = execution.nextNodeId;
		nextNodeId ? nextNode = this.nodeMap[String(nextNodeId)] : null;

		let numExecutions = 1;
		while (nextNode && numExecutions < MAX_NODE_EXECUTIONS) {
			input = structuredClone(output);
			execution = await this.executeNode(nextNode, input, runId, graphId);
			output = execution.output;
			nextNodeId = execution.nextNodeId;
			nextNodeId ? nextNode = this.nodeMap[String(nextNodeId)] : null;
			numExecutions += 1;
		}
		if (numExecutions === MAX_NODE_EXECUTIONS) {
			this.db.prepare(`INSERT INTO Runs(id, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(?, ?, ?, ?, ?, ?, ?, ?) `).run(runId, graphId, String(nextNode.nodeType), JSON.stringify(input), "MAX ITERATIONS reached", String(nextNode.nodeType), new Date().toISOString(), 0);

		}
		return output;
	};

	async executeNode(node: GraphNode<any, any, NodeEnum>, input: any, runId: string, graphId: string): Promise<{ output: any, nextNodeId: NodeEnum | null }> {
		let nextNodeId: NodeEnum | null = null;
		const output = await retry(async () => {
			try {
				const out = await node.exec(input);
				nextNodeId = node.routing(out);
				this.db.prepare(`INSERT INTO Runs(id, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(?, ?, ?, ?, ?, ?, ?, ?) `).run(runId, graphId, String(node.nodeType), JSON.stringify(input), JSON.stringify(out), nextNodeId ? String(nextNodeId) : "END", new Date().toISOString(), 1);
				return out;
			} catch (err) {
				nextNodeId = null;
				this.db.prepare(`INSERT INTO Runs(id, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(?, ?, ?, ?, ?, ?, ?, ?) `).run(runId, graphId, String(node.nodeType), JSON.stringify(input), JSON.stringify(err), String(node.nodeType), new Date().toISOString(), 0);
				throw Error("Node failed to execute");
			}
		}, 3, 1);
		return { output, nextNodeId }
	}
}
