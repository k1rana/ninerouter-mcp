import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { type NinerouterConfig, requestJson } from '../ninerouter-client.js';
import { attachWarnings, tryModelsWithFallback, toPrettyJson } from '../lib/common.js';
import {
    convertCountry,
    fetchProviderInfo,
    lookupWebCapabilities,
    unsupportedFilterWarning,
} from '../lib/web-capabilities.js';
import { resolveWebModelId } from '../lib/web-model.js';

function normalizeDomains(value: string | string[] | undefined): string[] {
    if (!value) {
        return [];
    }
    const entries = Array.isArray(value) ? value : value.split(',');
    return entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

export function registerWebTools(server: McpServer, config: NinerouterConfig): void {
    server.registerTool(
        'web_search',
        {
            description:
                'Search the web and return the raw upstream search payload as JSON. Use when the user needs current information, links, or news. Pass `model` (or its alias `provider`) to pick a search backend: a provider id (`tavily`, `serper`), a catalog id (`tavily/search`), or a combo (`search-combo`). Without it, the server tries the configured `default_models.web_search` chain in order. When the chosen provider does not read a filter, the server drops it and reports it in `warnings`, so check that field before trusting a filtered result set.',
            inputSchema: z.object({
                query: z.string().min(1).describe('Search query to send to the backend.'),
                model: z
                    .string()
                    .optional()
                    .describe(
                        'Search backend to use: a provider id (`tavily`), a catalog id (`tavily/search`), or a combo name (`search-combo`). Omit it to use the configured default_models.web_search chain.',
                    ),
                provider: z.string().optional().describe('Alias for model.'),
                maxResults: z
                    .number()
                    .int()
                    .positive()
                    .max(100)
                    .optional()
                    .default(5)
                    .describe(
                        'How many results to return (1-100). 9Router caps it to the provider limit and reports the cap in `warnings`.',
                    ),
                searchType: z
                    .enum(['web', 'news', 'research_paper'])
                    .optional()
                    .default('web')
                    .describe(
                        'Result type. Only tinyfish reads `research_paper`; other providers fall back to their own type and say so in `warnings`.',
                    ),
                country: z
                    .string()
                    .optional()
                    .describe(
                        'Country filter: a country name (`united states`) or an ISO 3166-1 alpha-2 code (`us`). The server rewrites it to the format the provider expects, and drops it with a warning when the provider does not read it.',
                    ),
                language: z
                    .string()
                    .optional()
                    .describe(
                        'Language filter, for example `en` or `vi`. The server drops it with a warning when the provider does not read it.',
                    ),
                timeRange: z
                    .enum(['day', 'week', 'month', 'year'])
                    .optional()
                    .describe(
                        'Keep only results from the last day, week, month or year. Only google-pse, linkup, youcom and searxng read it; the server drops it with a warning everywhere else.',
                    ),
                domainFilter: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe(
                        'Restrict results to specific sites. Pass an array of domains (`["snyk.io"]`) or a comma-separated string. Prefix a domain with `-` to exclude it instead (`["-reddit.com"]`). The server drops it with a warning when the provider does not read it.',
                    ),
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

            const domains = normalizeDomains(domainFilter);

            const outcome = await tryModelsWithFallback(modelsToTry, async (selectedModel) => {
                const resolved = resolveWebModelId(selectedModel);
                const capabilities = lookupWebCapabilities(resolved.id);
                const info = await fetchProviderInfo(config, resolved.id, 'search');
                const warnings: string[] = [];

                const body: Record<string, unknown> = {
                    model: resolved.id,
                    query,
                    max_results: maxResults,
                    search_type: searchType,
                };

                if (country) {
                    if (capabilities && !capabilities.country) {
                        warnings.push(unsupportedFilterWarning('country', resolved.id));
                    } else {
                        const conversion = convertCountry(
                            country,
                            capabilities?.countryFormat ?? 'any',
                            resolved.id,
                        );
                        if (conversion.action === 'send') {
                            body.country = conversion.value;
                            if (conversion.warning) {
                                warnings.push(conversion.warning);
                            }
                        } else {
                            warnings.push(conversion.warning);
                        }
                    }
                }

                if (language) {
                    if (capabilities && !capabilities.language) {
                        warnings.push(unsupportedFilterWarning('language', resolved.id));
                    } else {
                        body.language = language;
                    }
                }

                if (timeRange) {
                    if (capabilities && !capabilities.timeRange) {
                        warnings.push(unsupportedFilterWarning('timeRange', resolved.id));
                    } else {
                        body.time_range = timeRange;
                    }
                }

                if (domains.length > 0) {
                    if (capabilities && !capabilities.domainFilter) {
                        warnings.push(unsupportedFilterWarning('domainFilter', resolved.id));
                    } else {
                        body.domain_filter = domains;
                    }
                }

                if (info?.maxResults && maxResults > info.maxResults) {
                    warnings.push(
                        `maxResults ${maxResults} exceeds the ${resolved.id} limit of ${info.maxResults}; 9Router returns fewer.`,
                    );
                }

                if (info?.searchTypes?.length && !info.searchTypes.includes(searchType)) {
                    warnings.push(
                        `${resolved.id} does not read searchType "${searchType}"; it searches ${info.searchTypes.join(', ')} instead.`,
                    );
                }

                const payload = await requestJson(config, '/v1/search', body);
                return { payload, warnings };
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: toPrettyJson(attachWarnings(outcome.payload, outcome.warnings)),
                    },
                ],
            };
        },
    );

    server.registerTool(
        'web_fetch',
        {
            description:
                'Fetch a URL and return its content as markdown (default), plain text, or HTML. Use when the user gives a link and you need its readable body. The server truncates the output to `maxCharacters` (default 8000). Pass `model` (alias `provider`) to choose a fetcher: a provider id (`tavily`), a catalog id (`tavily/fetch`), or a combo (`fetch-combo`). Without it, the server tries the configured `default_models.web_fetch` chain in order.',
            inputSchema: z.object({
                url: z.string().url().describe('URL to fetch and extract.'),
                model: z
                    .string()
                    .optional()
                    .describe(
                        'Fetch backend to use: a provider id (`tavily`), a catalog id (`tavily/fetch`), or a combo name (`fetch-combo`). Omit it to use the configured default_models.web_fetch chain.',
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
                const resolved = resolveWebModelId(selectedModel);
                return await requestJson(config, '/v1/web/fetch', {
                    model: resolved.id,
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
