# graph-mode

A graph-based workflow execution framework for TypeScript. Define nodes with execution and routing logic, then let GraphRunner orchestrate the flow.

## Installation

```bash
npm install graph-mode
# or
bun add graph-mode
# or
yarn add graph-mode
```

## Quick Start

```typescript
import { GraphNode, GraphRunner } from 'graph-mode';

// Define your node types
enum Nodes {
  START = 'START',
  PROCESS = 'PROCESS',
}

// Create nodes with exec and routing functions
const startNode = new GraphNode({
  nodeType: Nodes.START,
  description: 'Initial node that prepares data',
  exec: (input: { data: string }) => ({ ...input, started: true }),
  routing: () => Nodes.PROCESS, // Route to PROCESS node
});

const processNode = new GraphNode({
  nodeType: Nodes.PROCESS,
  description: 'Process the data',
  exec: (input) => ({ ...input, processed: true }),
  routing: () => null, // End of graph (return null to stop)
});

// Create and run the graph
const runner = new GraphRunner({
  graphName: 'my-workflow',
  nodes: [startNode, processNode],
  startNode: Nodes.START,
  input: { data: 'hello' },
});

const result = await runner.run();
console.log(result); // { data: 'hello', started: true, processed: true }
```

## Features

- **Type-safe**: Full TypeScript support with generics for input/output types
- **Async support**: Node exec functions can be sync or async
- **Automatic retry**: Built-in retry with exponential backoff
- **Pluggable logging**: Optional execution logging with customizable backends
- **Universal**: Works with Node.js, Bun, and Deno

## Logging

By default, graph-mode doesn't log executions. You can enable logging by providing a logger:

### Console Logger (for debugging)

```typescript
import { GraphRunner, ConsoleLogger } from 'graph-mode';

const runner = new GraphRunner({
  graphName: 'my-workflow',
  nodes: [...],
  startNode: 'START',
  input: {},
  logger: new ConsoleLogger(),
});
```

### Bun SQLite Logger (for persistence)

If you're using Bun, you can use the built-in SQLite logger:

```typescript
import { GraphRunner } from 'graph-mode';
import { BunSQLiteLogger } from 'graph-mode/bun';
import { Database } from 'bun:sqlite';

const db = new Database('./executions.db');
const logger = new BunSQLiteLogger(db);

const runner = new GraphRunner({
  graphName: 'my-workflow',
  nodes: [...],
  startNode: 'START',
  input: {},
  logger,
});

await runner.run();

// Query execution history
const runs = logger.getRuns('my-workflow');
const executions = logger.getExecutions(runs[0]);
```

### Custom Logger

Implement the `Logger` interface to create your own logging backend:

```typescript
import { Logger, ExecutionLog } from 'graph-mode';

class MyCustomLogger implements Logger {
  registerGraph(graphName: string): string {
    // Register graph and return a unique ID
    return crypto.randomUUID();
  }

  logExecution(log: ExecutionLog): void {
    // Log the execution however you want
    console.log(log);
  }
}
```

## API Reference

### GraphNode

```typescript
new GraphNode<InputType, OutputType, NodeEnum>({
  nodeType: string,           // Unique identifier for this node
  description: string,        // Human-readable description
  exec: (input) => output,    // Execution function (sync or async)
  routing: (output) => next,  // Return next node ID or null to end
})
```

### GraphRunner

```typescript
new GraphRunner<NodeEnum>({
  graphName: string,          // Name for the workflow
  nodes: GraphNode[],         // Array of all nodes
  startNode: NodeEnum,        // Starting node identifier
  input: any,                 // Initial input to the graph
  logger?: Logger,            // Optional logger (default: NoOpLogger)
  maxExecutions?: number,     // Max iterations (default: 100)
})
```

#### Methods

- `run(): Promise<any>` - Execute the graph and return the final output

## License

MIT
