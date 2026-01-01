import { InputNode } from "../../../library/core";
import { Database } from "bun:sqlite";
import * as path from "path";
import Firecrawl, { MapData } from '@mendable/firecrawl-js';

const dbPath = path.join(process.cwd(), "../../graph-mode.db");
const db = new Database(dbPath);
const GRAPH_NAME = "custom-newsletter";

export type ScriptInput = {
	sources: {
		url: string,
		instructions: string,
		limit: number,
	}[],
};

export type MappedLinks = {
	[url: string]: MapData
}

export enum NodeNames {
	INPUT_NODE = "INPUT_NODE",
	SELECTOR_NODE = "SELECTOR_NODE",
	SUMMARIZER_NODE = "SUMMARIZER_NODE",
	AGGREGATOR_NODE = "AGGREGATOR_NODE",
}

async function retry<T>(func: () => T | Promise<T>, maxAttempt: number = 3, attempt: number = 1, error?: Error): Promise<T> {
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

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

const scriptInput: ScriptInput = {
	sources: [
		{
			url: "https://news.ycombinator.com",
			instructions: `Pick articles that have to do with AI news, typescript, golang, architecture, product tastes, and game dev.

			Ignore posts about jobs, non-tech news, topics about medicine or hardware
			`,
			limit: 5
		}
	]
}

const inputNode = new InputNode<ScriptInput, MappedLinks, NodeNames>({
	db: db,
	name: "inputNode",
	graphName: GRAPH_NAME,
	input: scriptInput,
	exec: async (input: ScriptInput) => {
		const mappedLinks: MappedLinks = {};
		for (const source of input.sources) {
			const map: MapData = await retry(() => { return firecrawl.map(source.url) }, 4, 2);
			mappedLinks[source.url] = map;
		}
		return mappedLinks;
	},
	routing: (): NodeNames => {
		return NodeNames.SELECTOR_NODE;
	},
});


