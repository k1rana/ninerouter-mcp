import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { type NinerouterConfig, requestGetJson } from '../ninerouter-client.js';
import { toPrettyJson } from './common.js';

const MODEL_KINDS = ['chat', 'image', 'tts', 'embedding', 'web', 'stt', 'image-to-text'] as const;

type ModelListResponse = {
    object?: string;
    data?: Array<Record<string, unknown>>;
};

export function registerModelTools(server: McpServer, config: NinerouterConfig): void {
    server.registerTool(
        'list_models',
        {
            description:
                'List available model ids. Call this first to discover a valid `model` value before using web_search, web_fetch, generate_image, text_to_speech, speech_to_text, or embeddings. Pass `kind` to filter by capability.',
            inputSchema: z.object({
                kind: z
                    .enum(MODEL_KINDS)
                    .optional()
                    .describe('Optional model category. Omit to list default chat models.'),
            }),
        },
        async ({ kind }) => {
            const payload = kind
                ? await requestGetJson<ModelListResponse>(config, `/v1/models/${kind}`)
                : await requestGetJson<ModelListResponse>(config, '/v1/models');

            return {
                content: [{ type: 'text', text: toPrettyJson(payload) }],
            };
        },
    );
}
