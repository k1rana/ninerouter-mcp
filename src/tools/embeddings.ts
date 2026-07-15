import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { type NinerouterConfig, requestJson } from '../ninerouter-client.js';
import { pickModel, toPrettyJson, tryModelsWithFallback } from './common.js';

export function registerEmbeddingTools(server: McpServer, config: NinerouterConfig): void {
    server.registerTool(
        'embeddings',
        {
            description:
                'Generate embeddings through 9Router and return the raw embedding payload.',
            inputSchema: z.object({
                model: z
                    .string()
                    .optional()
                    .describe(
                        '9Router embedding model id, for example openai/text-embedding-3-small.',
                    ),
                provider: z
                    .string()
                    .optional()
                    .describe('Alias for model; accepted for compatibility with 9Router docs.'),
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
