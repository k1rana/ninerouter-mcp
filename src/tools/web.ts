import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { type NinerouterConfig, requestJson } from '../ninerouter-client.js';
import { tryModelsWithFallback, toPrettyJson } from './common.js';

export function registerWebTools(server: McpServer, config: NinerouterConfig): void {
    server.registerTool(
        'web_search',
        {
            description:
                'Search the web and return the raw upstream search payload as JSON. Use when the user needs current information, links, or news. Pass `model` (or its alias `provider`) to pick a specific search backend (e.g. `tavily/search`, `brave-search/search`); otherwise the configured `default_models.web_search` fallback chain is tried in order.',
            inputSchema: z.object({
                query: z.string().min(1).describe('Search query to send to the backend.'),
                model: z
                    .string()
                    .optional()
                    .describe(
                        'Web-search model id, for example tavily/search or brave-search/search.',
                    ),
                provider: z.string().optional().describe('Alias for model.'),
                maxResults: z.number().int().positive().max(20).optional().default(5),
                searchType: z.enum(['web', 'news']).optional().default('web'),
                country: z.string().optional(),
                language: z.string().optional(),
                timeRange: z.string().optional(),
                domainFilter: z.string().optional(),
            }),
        },
        async ({
            query,
            model,
            provider,
            maxResults,
            searchType,
            country,
            language,
            timeRange,
            domainFilter,
        }) => {
            const userModel = model ?? provider;
            const defaultModels = config.defaultModels?.webSearch ?? [];
            const modelsToTry = userModel ? [userModel] : defaultModels;

            if (modelsToTry.length === 0) {
                throw new Error('No model specified and no default_models.web_search configured.');
            }

            const payload = await tryModelsWithFallback(modelsToTry, async (selectedModel) => {
                return await requestJson(config, '/v1/search', {
                    model: selectedModel,
                    query,
                    max_results: maxResults,
                    search_type: searchType,
                    country,
                    language,
                    time_range: timeRange,
                    domain_filter: domainFilter,
                });
            });

            return {
                content: [{ type: 'text', text: toPrettyJson(payload) }],
            };
        },
    );

    server.registerTool(
        'web_fetch',
        {
            description:
                'Fetch a URL and return its content as markdown (default), plain text, or HTML. Use when the user gives a link and you need its readable body. Output is truncated to `maxCharacters` (default 8000). Pass `model` (alias `provider`) to choose a fetcher (e.g. `jina-reader/fetch`, `firecrawl/fetch`); otherwise the configured `default_models.web_fetch` fallback chain is tried in order.',
            inputSchema: z.object({
                url: z.string().url().describe('URL to fetch and extract.'),
                model: z
                    .string()
                    .optional()
                    .describe(
                        'Web-fetch model id, for example jina-reader/fetch or firecrawl/fetch.',
                    ),
                provider: z.string().optional().describe('Alias for model.'),
                format: z.enum(['markdown', 'text', 'html']).optional().default('markdown'),
                maxCharacters: z.number().int().nonnegative().optional().default(8000),
            }),
        },
        async ({ url, model, provider, format, maxCharacters }) => {
            const userModel = model ?? provider;
            const defaultModels = config.defaultModels?.webFetch ?? [];
            const modelsToTry = userModel ? [userModel] : defaultModels;

            if (modelsToTry.length === 0) {
                throw new Error('No model specified and no default_models.web_fetch configured.');
            }

            const payload = await tryModelsWithFallback(modelsToTry, async (selectedModel) => {
                return await requestJson(config, '/v1/web/fetch', {
                    model: selectedModel,
                    url,
                    format,
                    max_characters: maxCharacters,
                });
            });

            return {
                content: [{ type: 'text', text: toPrettyJson(payload) }],
            };
        },
    );
}
