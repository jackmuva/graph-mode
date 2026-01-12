import { GraphNode, GraphRunner } from "../../src/index";
import { BunSQLiteLogger } from "../../src/loggers/bun-sqlite";
import { Database } from "bun:sqlite";
import * as path from "path";
import { retry } from "../../src/utils";
import { generateText, Output } from 'ai';
import { z } from 'zod';

const dbPath = path.join(import.meta.dir, "graph-mode.db");
const db = new Database(dbPath);
const GRAPH_NAME = "proofreader";

type PointOfEmphasis = {
	point: string,
	examples?: string,
	type: "SPECIFIC" | "HIGH_LEVEL",
}

type ArticleInstructions = {
	md: string
	pointsOfEmphasis: PointOfEmphasis[]
}

type ParsedArticles = {
	sections: string[],
	pointsOfEmphasis: PointOfEmphasis[],
}

type Feedback = {
	sections: string[],
	sectionFeedback?: {
		[sectionId: number]: {
			feedback: string,
			score: number,
		}[],
	}
	pointsOfEmphasis: PointOfEmphasis[],
	overallFeedback?: {
		feedback: string,
		score: number,
	}[],
}

export enum ProofreaderNodes {
	PARSER_NODE = "PARSER_NODE",
	SECTION_PROOFREADER_NODE = "SECTION_PROOFREADER_NODE",
	FULL_PROOFREADER_NODE = "FULL_PROOFREADER_NODE",
	PRIORITIZER_NODE = "PRIORITIZER_NODE",
}

const articleWithInstruction: ArticleInstructions = {
	md: `
# Orchestrating and Freeing Agents on a Saturday Night

Yes, it's Saturday night. And yes, I'm spending it tinkering with different agent implementations. No, this is not for work.

With all of that out of the way, I've been seriously interested in building two types of AI applications:
1. A strictly orchestrated agent workflow
2. A "liberated agent," free to loop and tool call away.

I have a task in mind that works really well for both use cases. 

> Create a custom newsletter from websites that I frequently scan for articles

Let's see what happens!

---

## Orchestrated vs Free Agents
A task like writing a newsletter can be broken down into a series of subtasks. 
The workflow for writing a newsletter if I were to do it myself would be something like this:

1. I skim a website like HackerNews, reading the post titles
2. I click on links that interest me to read more
3. I write a summary of articles that I like
4. I pick a theme that ties together the articles I pick for the newsletter

It's not hard to imagine these steps written in code, especially with LLMs to structure 
unstructured data. 

![ascii-workflow](https://api.vimnotion.com/image/5cad7fa8-7703-44c6-bb00-080ebf24da2b)

### The Orchestrated Agent
An **orchestrated agent** is one where I define the agent's workflow explicitly. 
Every step (or node in the workflow graph) runs either 

* code to call APIs like Firecrawl and re-structure data
* an LLM step to generate text or generate structured data

My orchestration framework was inspired by the likes of ai-sdk's workflows, 
LangChain's LangGraph, and my operations research classes. (I miss the good old 
Simplex Method and Min-Cut Flow Algorithm, but I digress.)

The LLM capability to "generate structure data aspect" is truly magical. 
It's a bridge that lets us take text and extract the information to a structured schema 
with type safety for further code steps (bridging code together, impossible without language models).

\`\`\`typescript
const selectorNode = new GraphNode<MdLinks, EnrichedLinks, NodeNames>({
	nodeType: NodeNames.SELECTOR_NODE,
	description: "From a webpage, an agent will select the most interesting articles with links",
	exec: async (input: MdLinks) => {
		const systemPrompt: string = \`You are a content curator tasked with selecting article titles that will interest the unique reader. 
		Readers will give you a page with articles and you will select only the top "x" number of articles that they may like.
		Only respond with the list of article titles!\`;

		const filteredLinks: EnrichedLinks = {};
		for (const url of Object.keys(input)) {
			const prompt: string = \`\${input[url]?.instructions} 
						Select up to \${input[url]?.limit} articles from this page:
						\${input[url]?.md}\`;
			const articleList: { title: string, url: string }[] = await retry<{ title: string, url: string }[]>(async () => {
				const { output } = await generateText({
					model: "anthropic/claude-sonnet-4.5",
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
			}, 3, 1);
			filteredLinks[url] = { ...input[url], links: articleList }
		}
		return filteredLinks;
	},
	routing: (): NodeNames | null => {
		return NodeNames.SUMMARIZER_NODE;
	},
});
\`\`\`

### The Liberated Free Agent
The **free agent** is an agent that's given a harness with a runtime, tools, prompts, 
and filesystem, and just loops until task completion. I used LangChain's 
[deepagents](https://docs.langchain.com/oss/javascript/deepagents/overview)
because it comes with a pre-configured harness for working with subagents and filesystem tools.

\`\`\`typescript
const agent = createAgent({
	model: "claude-sonnet-4-5-20250929",
	middleware: [
		toolCallLimitMiddleware({
			toolName: "markdown_search",
			threadLimit: 8,
			runLimit: 8,
		}),
		modelCallLimitMiddleware({
			threadLimit: 15,
			runLimit: 15,
			exitBehavior: "end",
		}),
		todoListMiddleware({}),
		createFilesystemMiddleware({
			backend: new FilesystemBackend({
				rootDir: "./"
			})
		}),
	],
	tools: [markdownSearch],
});
\`\`\`

I enforced some limits to not burn through my Firecrawl and Anthropic credits, but 
besides that, this agent was born to go as deep as it wanted to with the deepagent harness 
and as far as it wanted in any direction.

---

## Who Writes a Better Newsletter? The Structured or the Creative?
I gave both the agents similar input prompts. For the orchestrated agent:


\`\`\` typescript
const scriptInput: ScriptInput = {
	sources: [
		{
			url: "https://news.ycombinator.com",
			instructions: \`Pick articles that have to do with AI news, typescript, golang, architecture, product tastes, and game dev.
			Ignore posts about jobs, non-tech news, topics about medicine or hardware\`,
			limit: 2
		},
		{
			url: "https://theringer.com",
			instructions: \`I enjoy mostly reading about NBA, player features, and unusual trends about any sport really\`,
			limit: 2
		},
	]
}
\`\`\`

For the free agent:

> Please write a newsletter with 2 articles from hackernews.com  and 2 from theringer.com.
>
> For tech, I like articles with AI news, typescript, golang, architecture, product tastes, and game dev.
>
> For sports, I enjoy reading mostly about the NBA, player features, and unusual trends in any sport really.

Here are both newsletters so you can judge for yourself!

[Curated Newsletter by the Structured Graph Agent](https://www.vimnotion.com/doc/94d52ee5-367e-4826-b7c8-3f9e2ed2ddd4)

[Curated Newsletter by the Freelancing DeepAgent](https://www.vimnotion.com/doc/0fce5392-0a94-4675-8d98-7accb7a1c4d3)

I personally like the free agent newsletter a bit better. Perhaps it was my prompts in some of the 
bridge LLM nodes, but the orchestrated agent's newsletter was wordier and more click-baity.

Self-reflecting, I was also a bit more excited for the free agent's newsletter, because I didn't know what 
it would write. Whereas in the orchestrated workflow, because I wrote every step, I knew the exact
newsletter structure, ruining a bit of the excitement and unknown factor.

---

## Agent Design Implications
This was a fun exercise building agents with two different design philosophies.

My overall takeaways are actually not performance based (I think both agents did great, and 
the orchestrated graph agent is easier to tune):

### 1. Better models and better harnesses result in agents capable of running longer to complete even complex tasks
    
Breaking down tasks to essentially creating their own workflows with
"todo" tools, writing large text in files to save context, reading files from a filesystem
locally for low-latency RAG - these are all examples of better tooling for agents.

### 2. Orchestrating is like doing the reasoning for the agent

Better models and harnesses means building a world where agents can reason out even complex tasks.
But what I didn't mention from running the sandboxed deepagent is that the **token and cost usage was 
astronomically higher than the orchestrated agent**. The free agent cost ~2 dollars to run this prompt 
a few times as I tested the tooling. Controlling the exact inputs for the orchestrated agent 
was extremely token efficient and took much fewer LLM turns.

### 3. Gain control, sacrifice flexibility

Code has always been a way to express our thoughts in a very direct way. You can misconstrue words, 
but code is interpreted the same way every time. It can be powerful to control every LLM call, put 
in exact inputs, get exact outputs. But the orchestrated agent can really only do one thing. Take 
that same orchestrated graph agent and force it to proofread articles, and it will fail miserably. 
Free agents have harnesses that are universally useful. Prompts are its scripts. Prompts are its code.
Sometimes that code will be misinterpreted, but it's easier to iterate on a prompt than iterate on 
code (even with coding agents).

What's still interesting to debate is if it's easier to evaluate and iterate on orchestrated agents 
or free-running agents. Writing a new prompt for a new use case will be easier and faster than 
creating a new orchestration flow, but the tracing, the tuning, and the path to production may 
be faster with orchestrated agents. Maybe?

That'll be a question for another Saturday night.

:wq

-Jack
`,
	pointsOfEmphasis: [
		{
			point: "Look for a compelling hook in the intro paragraph that will keep a reader reading.",
			type: "HIGH_LEVEL",
		},
		{
			point: "Make sure this article has a reason that readers care, that it's not self-indulging",
			type: "HIGH_LEVEL",
		},
		{
			point: "Try to use action verbs in the present tense if possible",
			type: "SPECIFIC",
			examples: "AI supercharges engineering teams... Harnesses wrangle non-deterministic LLMS..."
		},
		{
			point: "If relevant, try storytelling with personal experience or putting the reader in the article",
			type: "HIGH_LEVEL"
		},
		{
			point: "Use metaphors, similes, and analogies if relevant.",
			type: "SPECIFIC",
		},
		{
			point: "Add imagery and more senses like sound, smell, and taste.",
			type: "SPECIFIC",
			examples: "The crickets sang in the grasses... from the back of a rain-soaked bycicle"
		}
	],
}

const parserNode = new GraphNode<ArticleInstructions, ParsedArticles, ProofreaderNodes>({
	nodeType: ProofreaderNodes.PARSER_NODE,
	description: "Parse markdown, breaking it down into sections and ignoring code blocks",
	exec: async (articleInstructions: ArticleInstructions): Promise<ParsedArticles> => {
		const parsed: ParsedArticles = {
			sections: [],
			pointsOfEmphasis: [],
		}

		let cur: number = 0;
		let codeBlocks: string[] = [];
		while (articleInstructions.md.indexOf("```", cur) != -1) {
			const firstPos: number = articleInstructions.md.indexOf("```", cur);
			const secondPos: number = articleInstructions.md.indexOf("```", firstPos + 3);
			if (firstPos !== -1 && secondPos === -1) {
				codeBlocks.push(articleInstructions.md.slice(firstPos));
				break;
			} else {
				codeBlocks.push(articleInstructions.md.slice(firstPos, secondPos + 3));
			}
			cur = secondPos + 3;
		}

		let cleanedArticle: string = articleInstructions.md;
		for (const codeBlock of codeBlocks) {
			cleanedArticle = cleanedArticle.replace(codeBlock, "");
		}

		parsed.sections = cleanedArticle.split("\n\n");
		parsed.pointsOfEmphasis = articleInstructions.pointsOfEmphasis;

		return parsed;
	},
	routing: (output?: ParsedArticles): ProofreaderNodes | null => {
		console.log("parsed section; ", output?.sections);
		let hasSpecific: boolean = false;
		let hasHighLevel: boolean = false;
		for (const point of output!.pointsOfEmphasis) {
			if (point.type === "SPECIFIC") hasSpecific = true;
			if (point.type === "HIGH_LEVEL") hasHighLevel = true;
		}
		if (!hasSpecific && !hasHighLevel) {
			return null;
		} else if (hasSpecific) {
			return ProofreaderNodes.SECTION_PROOFREADER_NODE;
		} else {
			return ProofreaderNodes.FULL_PROOFREADER_NODE;
		}
	}
});

const sectionNode = new GraphNode<ParsedArticles, Feedback, ProofreaderNodes>({
	nodeType: ProofreaderNodes.SECTION_PROOFREADER_NODE,
	description: "Proofreads each section for the SPECIFIC points of emphasis",
	exec: async (parsed: ParsedArticles): Promise<Feedback> => {
		const feedback: Feedback = { ...parsed, sectionFeedback: {} }
		for (const point of parsed.pointsOfEmphasis) {
			if (point.type !== "SPECIFIC") continue;
			const systemPrompt: string = `You are a writing editor with experience in writing high quality articles.

							Your specialized task is to read this section of the article looking for this point of emphasis: ${point.point}

							${point.examples ? `Here are good examples: ${point.examples}` : ""}

							Write a 1 sentence piece of feedback if the point of emphasis was not hit and provide an example.
							If the point was hit or the point is not relevant to this section, say it's not relevant or a 1 sentence acknowledgement of good work.`;

			let sectionIndex: number = 0;
			for (const section of parsed.sections) {
				if (section.length < 10) {
					sectionIndex++;
					continue;
				}
				const prompt: string = `Proofread this section for the point of emphasis: ${section}

							Assign the feedback a score for how important it is to address on a scale from 1 to 5 (5 being a MUST CHANGE and 1 being a nice-to-have).

							If the feedback, give it a score of 0. If the feedback is not relevant, git it a score of -1`
				const { output } = await retry(async () => await generateText({
					model: "anthropic/claude-haiku-4.5",
					system: systemPrompt,
					prompt: prompt,
					output: Output.object({
						schema: z.object({
							feedback: z.string().describe("The one sentence feedback"),
							score: z.number().describe("score of importance from 0 to 5")
						})
					})
				}), 3, 1);
				if (!feedback.sectionFeedback![sectionIndex]) {
					feedback.sectionFeedback![sectionIndex] = [output];
				} else {
					feedback.sectionFeedback![sectionIndex].push(output);
				}
				sectionIndex++;
			}
		}
		return feedback;
	},
	routing: (output?: Feedback): ProofreaderNodes | null => {
		console.log("finished section feedback");
		let hasHighLevel: boolean = false;
		for (const point of output!.pointsOfEmphasis) {
			if (point.type === "HIGH_LEVEL") hasHighLevel = true;
		}
		return hasHighLevel ? ProofreaderNodes.FULL_PROOFREADER_NODE : ProofreaderNodes.PRIORITIZER_NODE;
	}
});

const highLevelNode = new GraphNode<Feedback | ParsedArticles, Feedback, ProofreaderNodes>({
	nodeType: ProofreaderNodes.FULL_PROOFREADER_NODE,
	description: "Proofreads the entire article for the HIGH_LEVEL points of emphasis",
	exec: async (input: Feedback | ParsedArticles): Promise<Feedback> => {
		const feedback: Feedback = {
			...input,
			overallFeedback: [],
		};
		for (const point of input.pointsOfEmphasis) {
			if (point.type !== "HIGH_LEVEL") continue;
			const systemPrompt: string = `You are a writing editor with experience in writing high quality articles.

							Your specialized task is to read this article looking for this point of emphasis: ${point.point}

							${point.examples ? `Here are good examples: ${point.examples}` : ""}

							Write concise feedback if the point of emphasis was not hit and provide an example.
							If the point was hit or the point is not relevant to this section, say it's not relevant or a 1 sentence acknowledgement of good work.`;
			const prompt: string = `Proofread this article for the point of emphasis: ${input.sections.join("\n")}

							Assign the feedback a score for how important it is to address on a scale from 0 to 5 (5 being a MUST CHANGE and 1 being a nice-to-have).

							If the feedback, give it a score of 0. If the feedback is not relevant, git it a score of -1`
			const { output } = await retry(async () => await generateText({
				model: "google/gemini-3-flash",
				system: systemPrompt,
				prompt: prompt,
				output: Output.object({
					schema: z.object({
						feedback: z.string().describe("The one sentence feedback"),
						score: z.number().describe("score of importance from 0 to 5")
					})
				})

			}), 3, 1);
			feedback.overallFeedback?.push(output);
		}

		return feedback;
	},
	routing: (): ProofreaderNodes | null => {
		console.log("finished high level feedback");
		return ProofreaderNodes.PRIORITIZER_NODE;
	}
});

const prioritizerNode = new GraphNode<Feedback, string, ProofreaderNodes>({
	nodeType: ProofreaderNodes.PRIORITIZER_NODE,
	description: "Sorts the feedback scores and writes a report",
	exec: (feedback: Feedback): string => {
		let report: string = "# Proofreading report\n";

		if (feedback.overallFeedback && feedback.overallFeedback.length > 0) {
			report += "## High-level Points\n\n";
			for (const point of feedback.overallFeedback) {
				if (point.score < 4) continue;
				report += `${point.feedback}\n\n`;
			}
		}

		if (feedback.sectionFeedback && Object.keys(feedback.sectionFeedback)) {
			report += "---\n\n## Section-level Points\n\n";
			for (const sectionId of Object.keys(feedback.sectionFeedback)) {
				if (feedback.sectionFeedback[sectionId]
					.filter((point: { feedback: string, score: number }) => point.score > 3).length === 0) continue;
				for (const line of feedback.sections[sectionId].split("\n")) {
					report += `> ${line}\n`
				}
				report += "\n\n";
				for (const point of feedback.sectionFeedback[sectionId]) {
					if (point.score < 4) continue;
					report += `${point.feedback}\n\n`;
				}
			}
		}

		report += "---\n\n## Low Priority Feedback\n\n";
		if (feedback.overallFeedback && feedback.overallFeedback.length > 0) {
			report += "### High-level Points\n\n";
			for (const point of feedback.overallFeedback) {
				if (point.score > 3 || point.score === 0) continue;
				report += `${point.feedback}\n\n`;
			}
		}

		if (feedback.sectionFeedback && Object.keys(feedback.sectionFeedback)) {
			report += "---\n\n### Section-level Points\n\n";
			for (const sectionId of Object.keys(feedback.sectionFeedback)) {
				if (feedback.sectionFeedback[sectionId]
					.filter((point: { feedback: string, score: number }) => point.score < 4 && point.score > 0).length === 0) continue;
				for (const line of feedback.sections[sectionId].split("\n")) {
					report += `> ${line}\n`
				}
				report += "\n\n";
				for (const point of feedback.sectionFeedback[sectionId]) {
					if (point.score > 3 || point.score === 0) continue;
					report += `${point.feedback}\n\n`;
				}
			}
		}

		report += "---\n\n## Kudos\n\n";
		if (feedback.overallFeedback && feedback.overallFeedback.length > 0) {
			report += "### High-level Points\n\n";
			for (const point of feedback.overallFeedback) {
				if (point.score !== 0) continue;
				report += `${point.feedback}\n\n`;
			}
		}

		if (feedback.sectionFeedback && Object.keys(feedback.sectionFeedback)) {
			report += "---\n\n### Section-level Points\n\n";
			for (const sectionId of Object.keys(feedback.sectionFeedback)) {
				if (feedback.sectionFeedback[sectionId]
					.filter((point: { feedback: string, score: number }) => point.score === 0).length === 0) continue;
				for (const line of feedback.sections[sectionId].split("\n")) {
					report += `> ${line}\n`
				}
				report += "\n\n";
				for (const point of feedback.sectionFeedback[sectionId]) {
					if (point.score !== 0) continue;
					report += `${point.feedback}\n\n`;
				}
			}
		}

		console.log(report);
		return report;
	},
	routing: (): null => {
		return null;
	}
});


const logger = new BunSQLiteLogger(db);

const graphRunner = new GraphRunner<ProofreaderNodes>({
	graphName: GRAPH_NAME,
	nodes: [parserNode, sectionNode, highLevelNode, prioritizerNode],
	input: articleWithInstruction,
	logger: logger,
	startNode: ProofreaderNodes.PARSER_NODE,
});

try {
	await graphRunner.run();
} catch (err) {
	console.error("[GRAPH RUNNER]: ", err);
} finally {
	db.close();
}
