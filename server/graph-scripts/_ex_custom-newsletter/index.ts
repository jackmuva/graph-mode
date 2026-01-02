import { GraphNode, GraphRunner } from "../../../library/core";
import { Database } from "bun:sqlite";
import * as path from "path";
import Firecrawl, { MapData, SearchResultWeb, Document } from '@mendable/firecrawl-js';
import { retry } from "../../../library/utils";
import { generateText, Output } from 'ai';
import { z } from 'zod';

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
	[url: string]: {
		mapData: MapData,
		instructions: string,
		limit: number,
	}
}

export enum NodeNames {
	INPUT_NODE = "INPUT_NODE",
	SELECTOR_NODE = "SELECTOR_NODE",
	SUMMARIZER_NODE = "SUMMARIZER_NODE",
	AGGREGATOR_NODE = "AGGREGATOR_NODE",
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

const inputNode = new GraphNode<ScriptInput, MappedLinks, NodeNames>({
	nodeType: NodeNames.INPUT_NODE,
	exec: async (input: ScriptInput) => {
		const mappedLinks: MappedLinks = {};
		for (const source of input.sources) {
			const map: MapData = await retry(() => { return firecrawl.map(source.url) }, 4, 2);
			mappedLinks[source.url] = {
				mapData: map,
				instructions: source.instructions,
				limit: source.limit,
			};
		}
		return mappedLinks;
	},
	routing: (): NodeNames | null => {
		return NodeNames.SELECTOR_NODE;
	},
});

const selectorNode = new GraphNode<MappedLinks, MappedLinks, NodeNames>({
	nodeType: NodeNames.SELECTOR_NODE,
	exec: async (input: MappedLinks) => {
		const systemPrompt: string = `You are a content curator tasked with selecting article titles that will interest the unique reader. 

		Readers will give you a list of articles with descriptions and you will select only the top "x" number of articles that they may like.

		Only respond with the list of article titles!`;

		const filteredLinks: MappedLinks = {};
		for (const url of Object.keys(input)) {
			const headlines: string = input[url].mapData.links.map((searchRes: SearchResultWeb) => {
				return searchRes.title;
			}).join("\n");
			const prompt: string = `${input[url].instructions} 

						Select up to ${input[url].limit} articles!`;

			const titleList: string[] = await retry<string[]>(async () => {
				const { output } = await generateText({
					model: "google/gemini-3-flash",
					system: systemPrompt,
					prompt: prompt,
					output: Output.array({
						element: z.string().describe("Title of the article picked"),
					}),
				});
				return output
			}, 4, 3);
			filteredLinks[url] = {
				...input[url],
				mapData: {
					...input[url].mapData,
					links: input[url].mapData.links.filter((searchRes: SearchResultWeb) => searchRes.title && titleList.includes(searchRes.title))
				}
			}
		}

		return filteredLinks;
	},
	routing: (): NodeNames | null => {
		return NodeNames.SUMMARIZER_NODE;
	},
});

const summarizerNode = new GraphNode<MappedLinks, MappedLinks, NodeNames>({
	nodeType: NodeNames.SUMMARIZER_NODE,
	exec: async (input: MappedLinks) => {
		const summarizedLinks: MappedLinks = { ...input };
		const systemPrompt: string = `You are an amazing newsletter writer, that specializes in writing 1-2 sentence summaries of articles
						that will get readers to click on the article link`;

		for (const source of Object.keys(input)) {
			const links: SearchResultWeb[] = [];
			for (const link of input[source].mapData.links) {
				const scraped: Document = await retry<Document>(async () => {
					return await firecrawl.scrape(link.url, { formats: ["markdown"] });
				}, 4, 2);

				const summary: string = await retry<string>(async () => {
					const { text } = await generateText({
						model: "google/gemini-3-flash",
						system: systemPrompt,
						prompt: `Summarize this article please: \n${scraped.markdown}`,
					});
					return text;
				}, 4, 3);

				const newRes: SearchResultWeb = {
					...link,
					description: summary,
				}
				links.push(newRes);
			}
			summarizedLinks[source].mapData.links = links;
		}

		return summarizedLinks;
	},
	routing: (): NodeNames | null => {
		return NodeNames.AGGREGATOR_NODE;
	}
});

const aggregatorNode = new GraphNode<MappedLinks, string, NodeNames>({
	nodeType: NodeNames.AGGREGATOR_NODE,
	exec: async (input: MappedLinks) => {
		let newsletter: string = "# Your Curated Newsletter";
		const newsletterOutline: {
			[source: string]: {
				connectingSummary: string,
				articles: SearchResultWeb[]
			}
		} = {};
		const systemPrompt: string = `You are an amazing newsletter writer who is skilled at making connections and tying together topics.`

		for (const source of Object.keys(input)) {
			let allSummaries = "";
			for (const link of input[source].mapData.links) {
				allSummaries += `## ${link.title}\n`;
				allSummaries += `${link.description}\n\n`;
			}

			const sourceSummary: string = await retry<string>(async () => {
				const { text } = await generateText({
					model: "google/gemini-3-flash",
					system: systemPrompt,
					prompt: `Write a concise summary that ties together these articles with a theme or idea in 2-3 sentences.
						${allSummaries}`,
				});
				return text;
			}, 4, 3);

			newsletterOutline[source] = {
				connectingSummary: sourceSummary,
				articles: input[source].mapData.links,
			}
		}

		for (const source of Object.keys(newsletterOutline)) {
			newsletter += `## From ${source}\n`;
			newsletter += newsletterOutline[source].connectingSummary + "\n\n";
			for (const article of newsletterOutline[source].articles) {
				newsletter += `### ${article.title}\n`;
				newsletter += `${article.description}\n\n`;
				newsletter += `[${article.title}](${article.url})\n\n`;
			}
		}
		return newsletter;
	},
	routing: (): NodeNames | null => {
		return null;
	}
});

const graphRunner = new GraphRunner<NodeNames>({
	graphName: GRAPH_NAME,
	nodes: [inputNode, selectorNode, summarizerNode, aggregatorNode],
	input: scriptInput,
	db: db,
	startNode: NodeNames.INPUT_NODE,
});

try {
	graphRunner.run();
} catch (err) {
	console.error("[GRAPH RUNNER]: ", err);
} finally {
	db.close();
}
