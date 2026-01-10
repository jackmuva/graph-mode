/**
 * graph-mode
 * 
 * A graph-based workflow execution framework for TypeScript.
 * Define nodes with exec and routing functions, then let GraphRunner
 * orchestrate the execution flow.
 * 
 * @example
 * ```ts
 * import { GraphNode, GraphRunner } from 'graph-mode';
 * 
 * enum Nodes {
 *   START = 'START',
 *   PROCESS = 'PROCESS',
 *   END = 'END',
 * }
 * 
 * const startNode = new GraphNode({
 *   nodeType: Nodes.START,
 *   description: 'Initial node',
 *   exec: (input) => ({ ...input, started: true }),
 *   routing: () => Nodes.PROCESS,
 * });
 * 
 * const processNode = new GraphNode({
 *   nodeType: Nodes.PROCESS,
 *   description: 'Process data',
 *   exec: (input) => ({ ...input, processed: true }),
 *   routing: () => null, // End of graph
 * });
 * 
 * const runner = new GraphRunner({
 *   graphName: 'my-workflow',
 *   nodes: [startNode, processNode],
 *   startNode: Nodes.START,
 *   input: { data: 'hello' },
 * });
 * 
 * const result = await runner.run();
 * ```
 * 
 * @packageDocumentation
 */

// Core exports
export { GraphNode, GraphRunner } from "./core.js";
export type { GraphRunnerOptions } from "./core.js";

// Logger exports
export { NoOpLogger, ConsoleLogger } from "./logger.js";
export type { Logger, ExecutionLog } from "./logger.js";

// Utility exports
export { retry, serializeValue } from "./utils.js";
