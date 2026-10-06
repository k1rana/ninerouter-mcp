import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import {
    LIST_MODELS_DEFAULTS,
    type NinerouterConfig,
    requestGetJson,
} from '../ninerouter-client.js';
import { toPrettyJson } from './common.js';

const MODEL_KINDS = ['chat', 'image', 'tts', 'embedding', 'web', 'stt', 'image-to-text'] as const;

// Upper bound for an explicit `limit`; `0` still means "everything".
const MAX_LIMIT = 500;

// `/v1/models` rebuilds the whole catalog per request (~7s observed), and the payload
// is tiny (~0.5 MB), so cache the full list briefly instead of refetching on every call.
const LIST_KEYS = ['data', 'models'] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Best-effort label for an entry so `search` can match strings and objects alike.
function entryLabel(item: unknown): string | undefined {
    if (typeof item === 'string') {
        return item;
    }
    if (!isRecord(item)) {
        return undefined;
    }
    for (const key of ['id', 'name', 'model']) {
        const value = item[key];
        if (typeof value === 'string') {
            return value;
        }
    }
    return undefined;
}

// Locate the array of models in the payload (the payload itself, or a `data`/`models` field).
function findListArray(payload: unknown): { key?: string; items: unknown[] } | null {
    if (Array.isArray(payload)) {
        return { items: payload };
    }
    if (isRecord(payload)) {
        for (const key of LIST_KEYS) {
            const value = payload[key];
            if (Array.isArray(value)) {
                return { key, items: value };
            }
        }
    }
    return null;
}

export function registerModelTools(server: McpServer, config: NinerouterConfig): void {
    const cache = new Map<string, { expires: number; payload: unknown }>();

    const defaultLimit = config.listModels?.limit ?? LIST_MODELS_DEFAULTS.limit;
    const defaultOffset = config.listModels?.offset ?? LIST_MODELS_DEFAULTS.offset;
    const cacheTtlMs = config.listModels?.cacheTtlMs ?? LIST_MODELS_DEFAULTS.cacheTtlMs;

    // The cache is what makes repeat calls cheap; `refresh` lets a caller force a refetch.
    const fetchModels = async (kind: string | undefined, refresh: boolean): Promise<unknown> => {
        const cacheKey = kind ?? '';
        const cached = cache.get(cacheKey);
        if (!refresh && cached && cached.expires > Date.now()) {
            return cached.payload;
        }

        const payload = await requestGetJson<unknown>(
            config,
            kind ? `/v1/models/${kind}` : '/v1/models',
        );
        if (cacheTtlMs > 0) {
            cache.set(cacheKey, { expires: Date.now() + cacheTtlMs, payload });
        }
        return payload;
    };

    server.registerTool(
        'list_models',
        {
            description: `List available model ids. Call this first to discover a valid \`model\` value before using web_search, web_fetch, generate_image, text_to_speech, speech_to_text, or embeddings. Pass \`kind\` to filter by capability. Results are filtered by \`search\`, then paged with \`offset\`/\`limit\` (page size defaults to ${LIST_MODELS_DEFAULTS.limit}; \`limit: 0\` returns everything). The response carries \`total\`, \`count\`, \`offset\`, and \`nextOffset\` (absent when there is no next page). Results are cached briefly, so repeat calls are fast.`,
            inputSchema: z.object({
                kind: z
                    .enum(MODEL_KINDS)
                    .optional()
                    .describe('Optional model category. Omit to list default chat models.'),
                search: z
                    .string()
                    .optional()
                    .describe('Case-insensitive substring match against model ids/names.'),
                limit: z
                    .number()
                    .int()
                    .nonnegative()
                    .max(MAX_LIMIT)
                    .optional()
                    .describe(
                        `Page size (config default ${defaultLimit}, max ${MAX_LIMIT}). Use 0 for the whole list.`,
                    ),
                offset: z
                    .number()
                    .int()
                    .nonnegative()
                    .optional()
                    .describe(
                        `Index of the first model to return (config default ${defaultOffset}). Use \`nextOffset\` to page.`,
                    ),
                refresh: z
                    .boolean()
                    .optional()
                    .describe('Bypass the cache and refetch from 9Router.'),
            }),
        },
        async ({ kind, search, limit, offset, refresh }) => {
            const payload = await fetchModels(kind, refresh ?? false);

            const found = findListArray(payload);
            if (!found) {
                // Not a list-shaped response (e.g. voices or a single object) — return as-is.
                return {
                    content: [{ type: 'text', text: toPrettyJson(payload) }],
                };
            }

            const { key, items } = found;
            const needle = search?.trim().toLowerCase();
            const matched = needle
                ? items.filter((item) => entryLabel(item)?.toLowerCase().includes(needle))
                : items;

            const effectiveLimit = (limit ?? defaultLimit) || matched.length;
            const effectiveOffset = Math.min(offset ?? defaultOffset, matched.length);
            const shown = matched.slice(effectiveOffset, effectiveOffset + effectiveLimit);
            const nextOffset = effectiveOffset + shown.length;
            const hasMore = nextOffset < matched.length;

            const result: JsonRecord = isRecord(payload)
                ? { ...payload, [key ?? 'data']: shown }
                : { object: 'list', data: shown };

            result.total = items.length;
            result.count = shown.length;
            result.offset = effectiveOffset;
            if (needle) {
                result.matched = matched.length;
                result.search = search;
            }
            if (hasMore) {
                result.nextOffset = nextOffset;
                result.hint = `Returned ${shown.length} of ${matched.length}${
                    needle ? ' matched' : ''
                } models. Call again with \`offset: ${nextOffset}\` for the next page, or raise \`limit\` (0 = all).`;
            }

            return {
                content: [{ type: 'text', text: toPrettyJson(result) }],
            };
        },
    );
}
