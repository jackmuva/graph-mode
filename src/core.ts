import { Database } from "bun:sqlite";
import { serializeValue, retry } from "./utils";

const MAX_NODE_EXECUTIONS = 100;

export class GraphNode<InputType, OutputType, NodeEnum> {
	exec: (input: InputType) => OutputType | Promise<OutputType>;
	nodeType: string;
	routing: (output?: OutputType) => NodeEnum | null;

	constructor(params: {
		nodeType: string,
		description: string,
		exec: (input: InputType) => OutputType | Promise<OutputType>,
		routing: (output?: OutputType) => NodeEnum | null,
	}) {
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
		startNode: NodeEnum,
		input: any,
		db?: Database,
	}) {
		this.graphName = params.graphName;
		this.nodes = params.nodes;
		this.startNode = params.startNode;
		this.input = params.input;

		if (params.db) {
			this.db = params.db;
			this.initializeDb(this.db);
		} else {
			this.db = new Database(":memory:");
		}

		const graphIdResult = this.db.prepare(`SELECT id FROM Graphs WHERE graphName = ? LIMIT 1`).all(this.graphName);
		if (graphIdResult.length === 0) {
			this.db.prepare(`INSERT INTO Graphs(id, graphName) VALUES(?, ?)`).run(crypto.randomUUID(), this.graphName);
		}
		this.nodeMap = {};
		this.initializeNodeMap();
	};

	private initializeDb(db: Database): void {
		db.exec(`
	  CREATE TABLE IF NOT EXISTS Graphs(
		id TEXT PRIMARY KEY,
		graphName TEXT
	  )`);
		db.exec(`
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
	  )`);
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

		let nextNode: GraphNode<any, any, NodeEnum> | undefined | null = this.nodeMap[String(this.startNode)];
		if (!nextNode) return;
		let input: any = this.input;
		let nextNodeId: NodeEnum | null = null;
		let execution = await this.executeNode(nextNode, input, runId, graphId);
		if (!execution) return;
		let output = execution.output;
		nextNodeId = execution.nextNodeId;
		nextNodeId ? nextNode = this.nodeMap[String(nextNodeId)] : null;

		let numExecutions = 1;
		while (nextNode && numExecutions < MAX_NODE_EXECUTIONS) {
			input = structuredClone(output);
			execution = await this.executeNode(nextNode, input, runId, graphId);
			if (!execution) return;
			output = execution.output;
			nextNodeId = execution.nextNodeId;
			nextNodeId ? nextNode = this.nodeMap[String(nextNodeId)] : nextNode = null;
			numExecutions += 1;
		}
		if (numExecutions === MAX_NODE_EXECUTIONS) {
			this.db.prepare(`INSERT INTO Executions(id, runId, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) `).run(crypto.randomUUID(), runId, graphId, String(nextNode?.nodeType), serializeValue(input), "MAX ITERATIONS reached", String(nextNode?.nodeType), new Date().toISOString(), 0);

		}
		return output;
	};

	private async executeNode(node: GraphNode<any, any, NodeEnum>, input: any, runId: string, graphId: string): Promise<{ output: any, nextNodeId: NodeEnum | null } | null> {
		try {
			const { output, nextNodeId } = await retry(async () => {
				let nextNodeId: NodeEnum | null = null;
				const output = await node.exec(input);
				nextNodeId = node.routing(output);
				this.db.prepare(`INSERT INTO Executions(id, runId, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) `).run(crypto.randomUUID(), runId, graphId, String(node.nodeType), serializeValue(input), serializeValue(output), nextNodeId ? String(nextNodeId) : "END", new Date().toISOString(), 1);
				return { output, nextNodeId };
			}, 1, 1);
			return { output, nextNodeId }
		} catch (err) {
			this.db.prepare(`INSERT INTO Executions(id, runId, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) `).run(crypto.randomUUID(), runId, graphId, String(node.nodeType), serializeValue(input), serializeValue(err), String(node.nodeType), new Date().toISOString(), 0);
			return null;
		}
	}
}
