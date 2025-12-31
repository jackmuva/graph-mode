# Graph-Mode

## Getting Started
To install dependencies:
```bash
bun install
```

To run:
```bash
bun run dev
```

## Why Graph-Mode
The goal of Graph-Mode is to provide a framework for tightly defined agents. LLMs are used as "transformers," 
transforming unstructured data to structured. This structured data will run code and provide predictable results 
with non-deterministic LLM steps.

## Primitives
There are 3 types of nodes in Graph-Mode agents:
1. `Agent Nodes` for transforming unstructured data to structured and decisioning on where to route next
2. `Human Nodes` for human-in-the-loop systems
3. `Code Nodes` for when non-deterministic systems are not needed

**Every node must have inputs and **routing.** 

Agent nodes can have **context injection** and code execution via tools. Context injection is a big 
piece of Graph-Mode as part of having a well-defined graph to model agent workflows. Graphs and tracking
paths can provide excellent predicitive analytics and context as a graph is used.

With enough training data, graph analytics should be injected as context to `Agent Nodes` as a way to 
steer their routing responsibilities to choose paths and subsequent nodes to achieve results.

This training and graph tracking is a form of **evaluation** that Graph-Mode agents should leverage.

## How to build using the Graph-Mode framework
At its core, Graph-Mode agents are **scripts** that start with an input and have a defined end.

Inputs could be text, a json payload, a file, or a directory.

Graph-Mode agents could be built with just code (similar to LangGraph) or with a workflow builder that 
turns a graph in the UI into a script (in code).

As mentioned in the *Primitives* section, **Context Injection and Evaluation** are core to Graph-Mode.
Outputs should be judged first by the human user and eventially may be judged by an LLM. Tracing steps (or nodes)
in the script will be essential for identifying paths that are probabilistically more favorable.

## Workflow
1. In the `graph-scripts` directory, you can start creating scripts directly in your local editor using the primitives
in `library`
2. Conversely, you can also start building a graph in the UI
3. The UI will only build a skeleton of your graph-script. Any code, will need to be edited in your graph-script file
4. Execute graph-scripts in the UI or run the script from your terminal (For frequently used scripts, you can alias them in your .zshrc, .profile, .bashrc, etc.)
