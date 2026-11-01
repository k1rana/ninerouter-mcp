import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { type NinerouterConfig, requestJson } from '../ninerouter-client.js';
import { tryModelsWithFallback, toPrettyJson } from '../lib/common.js';

export function registerEmbeddingTools(server: McpServer, config: NinerouterConfig): void {
    server.registerTool(
        'embeddings',
        {
            description:
                'Generate vector embeddings for a single string or a batch of strings. Returns the raw upstream payload (vectors, usage). Use for retrieval, semantic search, clustering, or similarity. Leave `model` unset to use the configured `default_models.embeddings` fallback chain; set it only to force an embedding model (e.g. `openai/text-embedding-3-small`).',
            inputSchema: z.object({
                model: z
                    .string()
                    .optional()
                    .describe(
                        'Omit it to use the configured default_models.embeddings chain. Set it to force an embedding model, for example openai/text-embedding-3-small.',
                    ),
                provider: z
                    .string()
                    .optional()
                    .describe(
                        'Alias for `model`. Omit it to use the configured default_models.embeddings chain.',
                    ),
                input: z
                    .union([z.string(), z.array(z.string().min(1))])
                    .describe('Text input or a batch of text inputs.'),
                encodingFormat: z.enum(['float', 'base64']).optional().default('float'),
                dimensions: z.number().int().positive().optional(),
            }),
        },
        async ({ model, provider, input, encodingFormat, dimensions }) => {
            const userModel = model ?? provider;
            const defaultModels = config.defaultModels?.embeddings ?? [];
            const modelsToTry = userModel ? [userModel] : defaultModels;

            if (modelsToTry.length === 0) {
                throw new Error('No model specified and no default_models.embeddings configured.');
            }

            const payload = await tryModelsWithFallback(modelsToTry, async (selectedModel) => {
                return await requestJson(config, '/v1/embeddings', {
                    model: selectedModel,
                    input,
                    encoding_format: encodingFormat,
                    dimensions,
                });
            });

            return {
                content: [{ type: 'text', text: toPrettyJson(payload) }],
            };
        },
    );
}
