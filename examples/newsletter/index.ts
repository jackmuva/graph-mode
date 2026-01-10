import { GraphNode, GraphRunner } from "../../src/core";
import { Database } from "bun:sqlite";
import * as path from "path";
import Firecrawl, { Document } from '@mendable/firecrawl-js';
import { retry } from "../../src/utils";
import { generateText, Output } from 'ai';
import { z } from 'zod';

const dbPath = path.join(import.meta.dir, "graph-mode.db");
const db = new Database(dbPath);
const GRAPH_NAME = "custom-newsletter";

export type ScriptInput = {
	sources: {
		url: string,
		instructions: string,
		limit: number,
	}[],
};

export type MdLinks = {
	[url: string]: {
		md: string,
		instructions: string,
		limit: number,
	}
}

export type EnrichedLinks = {
	[url: string]: {
		instructions: string,
		limit: number,
		links: {
			url: string,
			title: string,
			summary?: string,
		}[],
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
			limit: 2
		},
		{
			url: "https://theringer.com",
			instructions: `I enjoy mostly reading about NBA, player features, and unusual trends about any sport really`,
			limit: 2
		},
	]
}

const inputNode = new GraphNode<ScriptInput, MdLinks, NodeNames>({
	nodeType: NodeNames.INPUT_NODE,
	description: "input websites with instructions on how the agent should look for articles",
	exec: async (input: ScriptInput) => {
		const mappedLinks: MdLinks = {};
		for (const source of input.sources) {
			const mdDoc: Document = await retry(() => { return firecrawl.scrape(source.url, { formats: ["markdown"] }) }, 1, 1);
			if (!mdDoc.markdown) throw new Error("firecrawl unable to get markdown");
			mappedLinks[source.url] = {
				md: mdDoc.markdown,
				instructions: source.instructions,
				limit: source.limit,
			};
		}
		return mappedLinks;
	},
	routing: (): NodeNames | null => {
		console.log("finished inputNode");
		return NodeNames.SELECTOR_NODE;
	},
});

const selectorNode = new GraphNode<MdLinks, EnrichedLinks, NodeNames>({
	nodeType: NodeNames.SELECTOR_NODE,
	description: "From a webpage, an agent will select the most interesting articles with links",
	exec: async (input: MdLinks) => {
		const systemPrompt: string = `You are a content curator tasked with selecting article titles that will interest the unique reader. 

		Readers will give you a page with articles and you will select only the top "x" number of articles that they may like.

		Only respond with the list of article titles!`;

		const filteredLinks: EnrichedLinks = {};
		for (const url of Object.keys(input)) {
			const prompt: string = `${input[url].instructions} 

						Select up to ${input[url].limit} articles from this page:

						${input[url].md}`;

			const articleList: { title: string, url: string }[] = await retry<{ title: string, url: string }[]>(async () => {
				const { output } = await generateText({
					model: "google/gemini-3-flash",
					system: systemPrompt,
					prompt: prompt,
					output: Output.array({
						element: z.object({
							title: z.string().describe("Title of the article picked"),
							url: z.string().describe("url of the article picked"),
						}),
					}),
				});
				return output
			}, 4, 3);
			console.log(articleList);
			filteredLinks[url] = {
				...input[url],
				links: articleList
			}
		}

		return filteredLinks;
	},
	routing: (): NodeNames | null => {
		console.log("finished selecting");
		return NodeNames.SUMMARIZER_NODE;
	},
});

const summarizerNode = new GraphNode<EnrichedLinks, EnrichedLinks, NodeNames>({
	nodeType: NodeNames.SUMMARIZER_NODE,
	description: "An agent will read each article and summarize the contents",
	exec: async (input: EnrichedLinks) => {
		const summarizedLinks: EnrichedLinks = { ...input };
		const systemPrompt: string = `You are an amazing newsletter writer, that specializes in writing 1-2 sentence summaries of articles
						that will get readers to click on the article link`;

		for (const source of Object.keys(input)) {
			const links: { url: string, title: string, summary?: string }[] = [];
			for (const link of input[source].links) {
				const scraped: Document = await retry<Document>(async () => {
					return await firecrawl.scrape(link.url, { formats: ["markdown"] });
				}, 4, 2);

				const summary: string = await retry<string>(async () => {
					const { text } = await generateText({
						model: "google/gemini-3-flash",
						system: systemPrompt,
						prompt: `Write one summary (just one, no options) for this article please: \n${scraped.markdown}`,
					});
					return text;
				}, 4, 3);
				console.log(link.title, summary);

				const newRes: { url: string, title: string, summary?: string } = {
					...link,
					summary: summary,
				}
				links.push(newRes);
			}
			summarizedLinks[source].links = links;
		}

		return summarizedLinks;
	},
	routing: (): NodeNames | null => {
		console.log("finished summarizing");
		return NodeNames.AGGREGATOR_NODE;
	}
});

const aggregatorNode = new GraphNode<EnrichedLinks, { newsletter: string }, NodeNames>({
	nodeType: NodeNames.AGGREGATOR_NODE,
	description: "This agent will read each summary and write a unifying overview and create the final markdown",
	exec: async (input: EnrichedLinks) => {
		let newsletter: string = "# Your Curated Newsletter\n";
		const newsletterOutline: {
			[source: string]: {
				connectingSummary: string,
				articles: { url: string, title: string, summary?: string }[],
			}
		} = {};
		const systemPrompt: string = `You are an amazing newsletter writer who is skilled at making connections and tying together topics`

		for (const source of Object.keys(input)) {
			let allSummaries = "";
			for (const link of input[source].links) {
				allSummaries += `## ${link.title}\n`;
				allSummaries += `${link.summary}\n\n`;
			}

			const sourceSummary: string = await retry<string>(async () => {
				const { text } = await generateText({
					model: "google/gemini-3-flash",
					system: systemPrompt,
					prompt: `Write one concise summary (just one, no options) that ties together these articles with a theme or idea in 2-3 sentences.
						${allSummaries}`,
				});
				return text;
			}, 4, 3);

			newsletterOutline[source] = {
				connectingSummary: sourceSummary,
				articles: input[source].links,
			}
		}

		for (const source of Object.keys(newsletterOutline)) {
			newsletter += `## From ${source}\n`;
			newsletter += newsletterOutline[source].connectingSummary + "\n\n";
			for (const article of newsletterOutline[source].articles) {
				newsletter += `### ${article.title}\n`;
				newsletter += `${article.summary}\n\n`;
				newsletter += `[${article.title}](${article.url})\n\n`;
			}
		}
		console.log(newsletter);
		return { newsletter };
	},
	routing: (): NodeNames | null => {
		console.log("finished aggregating");
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
	await graphRunner.run();
} catch (err) {
	console.error("[GRAPH RUNNER]: ", err);
} finally {
	db.close();
}
