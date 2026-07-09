import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { type NinerouterConfig, requestJson } from "../ninerouter-client.js";
import { pickModel, toPrettyJson } from "./common.js";

export function registerWebTools(server: McpServer, config: NinerouterConfig): void {
    server.registerTool(
        "ninerouter_web_search",
        {
            description: "Search the web through 9Router and return the raw search payload.",
            inputSchema: z.object({
                query: z.string().min(1).describe("Search query to send to 9Router."),
                model: z.string().optional().describe("9Router web-search model id, for example tavily/search or brave-search/search."),
                provider: z.string().optional().describe("Alias for model; accepted for compatibility with 9Router docs."),
                maxResults: z.number().int().positive().max(20).optional().default(5),
                searchType: z.enum(["web", "news"]).optional().default("web"),
                country: z.string().optional(),
                language: z.string().optional(),
                timeRange: z.string().optional(),
                domainFilter: z.string().optional(),
            }),
        },
        async ({ query, model, provider, maxResults, searchType, country, language, timeRange, domainFilter }) => {
            const payload = await requestJson(config, "/v1/search", {
                model: pickModel(model, provider),
                query,
                max_results: maxResults,
                search_type: searchType,
                country,
                language,
                time_range: timeRange,
                domain_filter: domainFilter,
            });

            return {
                content: [{ type: "text", text: toPrettyJson(payload) }],
            };
        },
    );

    server.registerTool(
        "ninerouter_web_fetch",
        {
            description: "Fetch a URL through 9Router and return markdown, text, or HTML extraction output.",
            inputSchema: z.object({
                url: z.string().url().describe("URL to fetch and extract."),
                model: z.string().optional().describe("9Router web-fetch model id, for example jina-reader/fetch or firecrawl/fetch."),
                provider: z.string().optional().describe("Alias for model; accepted for compatibility with 9Router docs."),
                format: z.enum(["markdown", "text", "html"]).optional().default("markdown"),
                maxCharacters: z.number().int().nonnegative().optional().default(8000),
            }),
        },
        async ({ url, model, provider, format, maxCharacters }) => {
            const payload = await requestJson(config, "/v1/web/fetch", {
                model: pickModel(model, provider),
                url,
                format,
                max_characters: maxCharacters,
            });

            return {
                content: [{ type: "text", text: toPrettyJson(payload) }],
            };
        },
    );
}