import { type Logger, type ExecutionLog, NoOpLogger } from "./logger.js";
import { serializeValue, retry } from "./utils.js";

const MAX_NODE_EXECUTIONS = 100;

export class GraphNode<InputType, OutputType, NodeEnum> {
	exec: (input: InputType) => OutputType | Promise<OutputType>;
	nodeType: string;
	description: string;
	routing: (output?: OutputType) => NodeEnum | null;
	maxAttempts: number;

	constructor(params: {
		nodeType: string;
		description: string;
		exec: (input: InputType) => OutputType | Promise<OutputType>;
		routing: (output?: OutputType) => NodeEnum | null;
		maxAttempts?: number;
	}) {
		this.exec = params.exec;
		this.nodeType = params.nodeType;
		this.description = params.description;
		this.routing = params.routing;
		params.maxAttempts ? this.maxAttempts = params.maxAttempts : this.maxAttempts = 1;
	}
}

export interface GraphRunnerOptions<NodeEnum> {
	graphName: string;
	nodes: GraphNode<any, any, NodeEnum>[];
	startNode: NodeEnum;
	input: any;
	logger?: Logger;
	maxExecutions?: number;
}

export class GraphRunner<NodeEnum> {
	graphName: string;
	nodes: GraphNode<any, any, NodeEnum>[];
	logger: Logger;
	startNode: NodeEnum;
	input: any;
	maxExecutions: number;
	private nodeMap: { [nodeId: string]: GraphNode<any, any, NodeEnum> };
	private graphId: string | null = null;

	constructor(params: GraphRunnerOptions<NodeEnum>) {
		this.graphName = params.graphName;
		this.nodes = params.nodes;
		this.startNode = params.startNode;
		this.input = params.input;
		this.logger = params.logger ?? new NoOpLogger();
		this.maxExecutions = params.maxExecutions ?? MAX_NODE_EXECUTIONS;

		this.nodeMap = {};
		this.initializeNodeMap();
	}

	private initializeNodeMap() {
		for (const node of this.nodes) {
			this.nodeMap[node.nodeType] = node;
		}
	}

	private async ensureGraphId(): Promise<string> {
		if (!this.graphId) {
			this.graphId = await this.logger.registerGraph(this.graphName);
		}
		return this.graphId!;
	}

	async run(): Promise<any> {
		const runId = crypto.randomUUID();
		const graphId = await this.ensureGraphId();

		let nextNode: GraphNode<any, any, NodeEnum> | undefined | null =
			this.nodeMap[String(this.startNode)];
		if (!nextNode) return;

		let input: any = this.input;
		let nextNodeId: NodeEnum | null = null;
		let execution = await this.executeNode(nextNode, input, runId, graphId, nextNode.maxAttempts);
		if (!execution) return;

		let output = execution.output;
		nextNodeId = execution.nextNodeId;
		nextNode = nextNodeId ? this.nodeMap[String(nextNodeId)] : null;

		let numExecutions = 1;
		while (nextNode && numExecutions < this.maxExecutions) {
			input = structuredClone(output);
			execution = await this.executeNode(nextNode, input, runId, graphId, nextNode.maxAttempts);
			if (!execution) return;
			output = execution.output;
			nextNodeId = execution.nextNodeId;
			nextNode = nextNodeId ? this.nodeMap[String(nextNodeId)] : null;
			numExecutions += 1;
		}

		if (numExecutions === this.maxExecutions) {
			const log: ExecutionLog = {
				id: crypto.randomUUID(),
				runId,
				graphId,
				nodeType: String(nextNode?.nodeType ?? "UNKNOWN"),
				input: serializeValue(input),
				output: "MAX ITERATIONS reached",
				routed: String(nextNode?.nodeType ?? "UNKNOWN"),
				datetime: new Date().toISOString(),
				success: false,
			};
			await this.logger.logExecution(log);
		}

		return output;
	}

	private async executeNode(
		node: GraphNode<any, any, NodeEnum>,
		input: any,
		runId: string,
		graphId: string,
		maxAttempts: number
	): Promise<{ output: any; nextNodeId: NodeEnum | null } | null> {
		try {
			const { output, nextNodeId } = await retry(async () => {
				const output = await node.exec(input);
				const nextNodeId = node.routing(output);

				const log: ExecutionLog = {
					id: crypto.randomUUID(),
					runId,
					graphId,
					nodeType: String(node.nodeType),
					input,
					output,
					routed: nextNodeId ? String(nextNodeId) : "END",
					datetime: new Date().toISOString(),
					success: true,
				};
				await this.logger.logExecution(log);

				return { output, nextNodeId };
			}, maxAttempts, 1);

			return { output, nextNodeId };
		} catch (err) {
			const log: ExecutionLog = {
				id: crypto.randomUUID(),
				runId,
				graphId,
				nodeType: String(node.nodeType),
				input,
				output: err,
				routed: String(node.nodeType),
				datetime: new Date().toISOString(),
				success: false,
			};
			await this.logger.logExecution(log);
			return null;
		}
	}
}
