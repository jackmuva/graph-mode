import { Database } from "bun:sqlite";

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
		this.db.exec(`INSERT INTO Graphs(id, graphName) VALUES(${crypto.randomUUID()}, ${this.graphName}`);
		this.nodeMap = {};
		this.initializeNodeMap();
	};

	private initializeNodeMap() {
		for (const node of this.nodes) {
			this.nodeMap[node.nodeType] = node;
		}
	};

	async run() {
		const runId = crypto.randomUUID();
		const graphId = this.db.query(`SELECT graphName FROM Graphs WHERE graphName=${this.graphName}`).all()
		if (graphId.length === 0) throw Error("Could not find graphId");

		let nextNode: GraphNode<any, any, NodeEnum> | null = this.nodeMap[String(this.startNode)];
		let input: any = this.input;
		let nextNodeId: NodeEnum | null = null;
		let output = await retry(() => {
			try {
				const out = nextNode!.exec(input);
				nextNodeId = nextNode!.routing(out);
				this.db.exec(`INSERT INTO Runs(id, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(${runId}, ${graphId[0]}, ${String(nextNode!.nodeType)}, ${JSON.stringify(input)}, ${JSON.stringify(output)}, ${nextNodeId ? nextNodeId : "END"}, ${new Date().toISOString()}, 1) `);
				return out;
			} catch (err) {
				nextNodeId = null;
				this.db.exec(`INSERT INTO Runs(id, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(${runId}, ${graphId[0]}, ${String(nextNode!.nodeType)}, ${JSON.stringify(input)}, ${JSON.stringify(output)}, ${String(nextNode!.nodeType)}, ${new Date().toISOString()}, 0) `);
				throw Error("Node failed to execute");
			}
		}, 3, 1);
		nextNodeId ? nextNode = this.nodeMap[String(nextNodeId)] : null;

		while (nextNode) {
			input = output;
			output = await retry(() => {
				try {
					const out = nextNode!.exec(input);
					nextNodeId = nextNode!.routing(out);
					this.db.exec(`INSERT INTO Runs(id, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(${runId}, ${graphId[0]}, ${String(nextNode!.nodeType)}, ${JSON.stringify(input)}, ${JSON.stringify(output)}, ${nextNodeId ? nextNodeId : "END"}, ${new Date().toISOString()}, 1) `);
					return out;
				} catch (err) {
					nextNodeId = null;
					this.db.exec(`INSERT INTO Runs(id, graphId, nodeType, input, output, routed, datetime, success) 
					VALUES(${runId}, ${graphId[0]}, ${String(nextNode!.nodeType)}, ${JSON.stringify(input)}, ${JSON.stringify(output)}, ${String(nextNode!.nodeType)}, ${new Date().toISOString()}, 0) `);
					throw Error("Node failed to execute");
				}
			}, 3, 1);
			nextNodeId ? nextNode = this.nodeMap[String(nextNodeId)] : null;
		}
	};
}
