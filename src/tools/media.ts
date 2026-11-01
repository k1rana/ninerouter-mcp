import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import {
    createFileBlob,
    fileNameFromPath,
    type NinerouterConfig,
    requestBinary,
    requestJson,
    requestMultipartText,
} from '../ninerouter-client.js';
import { tryModelsWithFallback, toPrettyJson } from '../lib/common.js';
import {
    LOCAL_RUNTIME,
    type MediaDelivery,
    type MediaRuntime,
    resolveMediaDelivery,
} from '../lib/media-output.js';

function defaultOutputPath(prefix: string, ext: string): string {
    const safe =
        prefix
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'output';
    return path.join(os.tmpdir(), `ninerouter-${safe}-${Date.now()}${ext}`);
}

function extFromContentType(contentType: string | null, fallback: string): string {
    if (!contentType) return fallback;
    const map: Record<string, string> = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'image/svg+xml': '.svg',
        'audio/mpeg': '.mp3',
        'audio/mp3': '.mp3',
        'audio/wav': '.wav',
        'audio/x-wav': '.wav',
        'audio/ogg': '.ogg',
        'audio/webm': '.webm',
        'audio/flac': '.flac',
        'audio/aac': '.aac',
    };
    return map[contentType.split(';')[0].trim().toLowerCase()] ?? fallback;
}

const RETURN_MODES = ['auto', 'path', 'inline'] as const;

function returnParam() {
    return z
        .enum(RETURN_MODES)
        .optional()
        .default('auto')
        .describe(
            'How the bytes reach you. `auto` returns a content block under stdio and a signed download URL under HTTP; `inline` forces the content block; `path` returns the server-side path alone.',
        );
}

/** The fields a media tool reads off its handler context. */
type ToolContext = { sessionId?: string; http?: { req?: Request } };

/**
 * Hand back a written file as a content block, a signed download URL, or the
 * path alone. A URL replaces `outputPath` because the client is on another host
 * and cannot open a path the server wrote.
 */
async function mediaResult(input: {
    runtime: MediaRuntime;
    delivery: MediaDelivery;
    blockType: 'image' | 'audio';
    data: string;
    mimeType: string;
    filePath: string;
    bytes: number;
    contentType: string;
    ctx: ToolContext | undefined;
}): Promise<CallToolResult> {
    const content: CallToolResult['content'] = [];
    if (input.delivery.inline) {
        content.push({ type: input.blockType, data: input.data, mimeType: input.mimeType });
    }

    const details: Record<string, unknown> = {
        bytes: input.bytes,
        contentType: input.contentType,
    };

    if (input.delivery.url && input.runtime.expose) {
        const exposed = input.runtime.expose({
            path: input.filePath,
            contentType: input.contentType,
            fileName: path.basename(input.filePath),
            sessionId: input.ctx?.sessionId,
            request: input.ctx?.http?.req,
        });
        details.url = exposed.location;
        if (exposed.expiresAt !== undefined) {
            details.urlExpiresAt = new Date(exposed.expiresAt).toISOString();
        }
    } else {
        details.outputPath = input.filePath;
    }

    content.push({ type: 'text', text: toPrettyJson(details) });
    return { content };
}

export function registerMediaTools(
    server: McpServer,
    config: NinerouterConfig,
    runtime: MediaRuntime = LOCAL_RUNTIME,
): void {
    server.registerTool(
        'generate_image',
        {
            description:
                'Generate an image from a text prompt. Writes the file, then hands it back per `return`: a base64 content block under stdio (plus `{ outputPath, bytes, contentType }`), or a signed, time-limited download URL under HTTP. Omit `outputPath` to write to a temp file with extension auto-derived from upstream content-type (.png default).',
            inputSchema: z.object({
                prompt: z.string().min(1).describe('Image prompt.'),
                model: z
                    .string()
                    .optional()
                    .describe(
                        'Image model id, for example gemini/gemini-3-pro-image-preview or openai/dall-e-3. Omit it to use the configured default_models.generate_image chain.',
                    ),
                provider: z
                    .string()
                    .optional()
                    .describe(
                        'Alias for `model`. Omit it to use the configured default_models.generate_image chain.',
                    ),
                n: z.number().int().positive().max(10).optional().default(1),
                size: z.string().optional().default('1024x1024'),
                quality: z.enum(['standard', 'hd']).optional(),
                outputPath: z
                    .string()
                    .optional()
                    .describe(
                        'Where to write the image. Default: temp dir, extension derived from upstream content-type.',
                    ),
                return: returnParam(),
            }),
        },
        async (
            { prompt, model, provider, n, size, quality, outputPath, return: returnMode },
            ctx,
        ) => {
            const userModel = model ?? provider;
            const defaultModels = config.defaultModels?.generateImage ?? [];
            const modelsToTry = userModel ? [userModel] : defaultModels;

            if (modelsToTry.length === 0) {
                throw new Error(
                    'No model specified and no default_models.generate_image configured.',
                );
            }

            const fetchImage = async (selectedModel: string) => {
                const payload = (await requestJson(config, '/v1/images/generations', {
                    model: selectedModel,
                    prompt,
                    n,
                    size,
                    quality,
                    response_format: 'b64_json',
                })) as {
                    data?: Array<{ b64_json?: string }>;
                };

                const first = payload.data?.[0];
                const b64 = first?.b64_json;
                if (!b64) {
                    throw new Error('Image response contained no b64_json data.');
                }
                const bytes = Buffer.from(b64, 'base64');
                const contentType = 'image/png';
                return { bytes, contentType, b64 };
            };

            const result = await tryModelsWithFallback(modelsToTry, fetchImage);
            const ext = extFromContentType(result.contentType, '.png');
            const resolvedPath = outputPath ?? defaultOutputPath(prompt, ext);
            await writeFile(resolvedPath, result.bytes);
            return await mediaResult({
                runtime,
                delivery: resolveMediaDelivery(returnMode, runtime),
                blockType: 'image',
                data: result.b64,
                mimeType: result.contentType ?? 'image/png',
                filePath: resolvedPath,
                bytes: result.bytes.length,
                contentType: result.contentType,
                ctx,
            });
        },
    );

    server.registerTool(
        'text_to_speech',
        {
            description:
                'Convert text to speech. Writes the audio file, then hands it back per `return`: a base64 audio content block under stdio (plus `{ outputPath, bytes, contentType }`), or a signed, time-limited download URL under HTTP. Omit `outputPath` to write to a temp file as .mp3; pass a path to control location.',
            inputSchema: z.object({
                input: z.string().min(1).describe('Text to synthesize.'),
                model: z
                    .string()
                    .optional()
                    .describe(
                        'TTS model or voice id, for example openai/tts-1 or edge-tts/vi-VN-HoaiMyNeural. Omit it to use the configured default_models.text_to_speech chain.',
                    ),
                provider: z
                    .string()
                    .optional()
                    .describe(
                        'Alias for `model`. Omit it to use the configured default_models.text_to_speech chain.',
                    ),
                outputPath: z
                    .string()
                    .optional()
                    .describe(
                        'Where to write the audio. Default: temp dir, extension derived from upstream content-type (.mp3 default).',
                    ),
                return: returnParam(),
            }),
        },
        async ({ input, model, provider, outputPath, return: returnMode }, ctx) => {
            const userModel = model ?? provider;
            const defaultModels = config.defaultModels?.textToSpeech ?? [];
            const modelsToTry = userModel ? [userModel] : defaultModels;

            if (modelsToTry.length === 0) {
                throw new Error(
                    'No model specified and no default_models.text_to_speech configured.',
                );
            }

            const fetchAudio = async (selectedModel: string) => {
                const binary = await requestBinary(
                    config,
                    '/v1/audio/speech',
                    { model: selectedModel, input },
                    { response_format: 'mp3' },
                );
                return {
                    bytes: Buffer.from(binary.base64, 'base64'),
                    contentType: binary.contentType ?? 'audio/mpeg',
                    b64: binary.base64,
                };
            };

            const result = await tryModelsWithFallback(modelsToTry, fetchAudio);
            const ext = extFromContentType(result.contentType, '.mp3');
            const resolvedPath = outputPath ?? defaultOutputPath(input, ext);
            await writeFile(resolvedPath, result.bytes);
            return await mediaResult({
                runtime,
                delivery: resolveMediaDelivery(returnMode, runtime),
                blockType: 'audio',
                data: result.b64,
                mimeType: result.contentType,
                filePath: resolvedPath,
                bytes: result.bytes.length,
                contentType: result.contentType,
                ctx,
            });
        },
    );

    server.registerTool(
        'speech_to_text',
        {
            description:
                'Transcribe audio. Provide exactly one of `audioPath` (local file) or `audioBase64` (base64 payload); both are sent as multipart upload. `responseFormat` selects the output shape (`json`, `text`, `verbose_json`, `srt`, `vtt`). Leave `model` unset to use the configured `default_models.speech_to_text` fallback chain; set it only to force a transcriber (e.g. `openai/whisper-1`, `groq/whisper-large-v3-turbo`).',
            inputSchema: z
                .object({
                    model: z
                        .string()
                        .optional()
                        .describe(
                            'STT model id, for example openai/whisper-1 or groq/whisper-large-v3-turbo. Omit it to use the configured default_models.speech_to_text chain.',
                        ),
                    provider: z
                        .string()
                        .optional()
                        .describe(
                            'Alias for `model`. Omit it to use the configured default_models.speech_to_text chain.',
                        ),
                    audioPath: z.string().optional().describe('Local path to an audio file.'),
                    audioBase64: z.string().optional().describe('Base64-encoded audio payload.'),
                    fileName: z
                        .string()
                        .optional()
                        .describe('File name to use when uploading a base64 payload.'),
                    language: z
                        .string()
                        .optional()
                        .describe('Optional ISO-639-1 language code, for example en or vi.'),
                    prompt: z.string().optional(),
                    responseFormat: z
                        .enum(['json', 'text', 'verbose_json', 'srt', 'vtt'])
                        .optional()
                        .default('json'),
                    temperature: z.number().min(0).max(1).optional(),
                })
                .refine((value) => Boolean(value.audioPath || value.audioBase64), {
                    message: 'Provide audioPath or audioBase64.',
                }),
        },
        async ({
            model,
            provider,
            audioPath,
            audioBase64,
            fileName,
            language,
            prompt,
            responseFormat,
            temperature,
        }) => {
            const userModel = model ?? provider;
            const defaultModels = config.defaultModels?.speechToText ?? [];
            const modelsToTry = userModel ? [userModel] : defaultModels;

            if (modelsToTry.length === 0) {
                throw new Error(
                    'No model specified and no default_models.speech_to_text configured.',
                );
            }

            const payload = await tryModelsWithFallback(modelsToTry, async (selectedModel) => {
                const formData = new FormData();
                formData.append('model', selectedModel);

                if (audioPath) {
                    const blob = await createFileBlob(audioPath);
                    formData.append('file', blob, fileName ?? fileNameFromPath(audioPath));
                } else if (audioBase64) {
                    const blob = new Blob([Buffer.from(audioBase64, 'base64')]);
                    formData.append('file', blob, fileName ?? 'audio.bin');
                }

                if (language) {
                    formData.append('language', language);
                }
                if (prompt) {
                    formData.append('prompt', prompt);
                }
                if (temperature !== undefined) {
                    formData.append('temperature', String(temperature));
                }

                return await requestMultipartText(config, '/v1/audio/transcriptions', formData, {
                    response_format: responseFormat,
                });
            });

            return {
                content: [{ type: 'text', text: payload.text }],
            };
        },
    );
}
