import { Database } from "bun:sqlite";

export const initializeDb = (db: Database) => {
	db.exec(`
	  CREATE TABLE IF NOT EXISTS Nodes(
	    id TEXT PRIMARY KEY,
	    nodeType TEXT
	  )`);
};

export interface GraphNode { }

export class InputNode<InputType, OutputType, NodeEnum> implements GraphNode {
	input: InputType;
	exec: (input: InputType) => OutputType | Promise<OutputType>;
	db: Database;
	name: string;
	graphName: string;

	constructor(params: {
		db: Database,
		name: string,
		graphName: string,
		input: InputType,
		exec: (input: InputType) => OutputType | Promise<OutputType>,
		routing: (output?: OutputType) => NodeEnum,
	}) {
		this.input = params.input;
		this.exec = params.exec;
		this.db = params.db;
		this.name = params.name;
		this.graphName = params.graphName;

		initializeDb(this.db);
	}
}

export class GraphRunner {
	graphName: string;
	nodes: GraphNode[];

	constructor(params: {
		graphName: string,
		nodes: GraphNode[],
	}) {
		this.graphName = params.graphName;
		this.nodes = params.nodes;
	}

	run: () => {

	}
}
