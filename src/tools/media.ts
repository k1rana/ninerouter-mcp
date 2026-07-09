import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { createFileBlob, fileNameFromPath, type NinerouterConfig, requestBinary, requestJson, requestMultipartText } from "../ninerouter-client.js";
import { pickModel, toPrettyJson } from "./common.js";

export function registerMediaTools(server: McpServer, config: NinerouterConfig): void {
    server.registerTool(
        "ninerouter_generate_image",
        {
            description: "Generate an image through 9Router and return the upstream response as JSON or base64.",
            inputSchema: z.object({
                prompt: z.string().min(1).describe("Image prompt."),
                model: z.string().optional().describe("9Router image model id, for example gemini/gemini-3-pro-image-preview or openai/dall-e-3."),
                provider: z.string().optional().describe("Alias for model; accepted for compatibility with 9Router docs."),
                n: z.number().int().positive().max(10).optional().default(1),
                size: z.string().optional().default("1024x1024"),
                quality: z.enum(["standard", "hd"]).optional(),
                responseFormat: z.enum(["url", "b64_json", "binary"]).optional().default("url"),
            }),
        },
        async ({ prompt, model, provider, n, size, quality, responseFormat }) => {
            const selectedModel = pickModel(model, provider);

            if (responseFormat === "binary") {
                const binary = await requestBinary(
                    config,
                    "/v1/images/generations",
                    {
                        model: selectedModel,
                        prompt,
                        n,
                        size,
                        quality,
                    },
                    {
                        response_format: "binary",
                    },
                );

                return {
                    content: [{ type: "text", text: toPrettyJson({ model: selectedModel, contentType: binary.contentType, base64: binary.base64 }) }],
                };
            }

            const payload = await requestJson(config, "/v1/images/generations", {
                model: selectedModel,
                prompt,
                n,
                size,
                quality,
                response_format: responseFormat,
            });

            return {
                content: [{ type: "text", text: toPrettyJson(payload) }],
            };
        },
    );

    server.registerTool(
        "ninerouter_text_to_speech",
        {
            description: "Convert text to speech through 9Router and return base64-encoded audio.",
            inputSchema: z.object({
                input: z.string().min(1).describe("Text to synthesize."),
                model: z.string().optional().describe("9Router TTS model or voice id, for example openai/tts-1 or edge-tts/vi-VN-HoaiMyNeural."),
                provider: z.string().optional().describe("Alias for model; accepted for compatibility with 9Router docs."),
                responseFormat: z.enum(["json", "mp3"]).optional().default("json"),
            }),
        },
        async ({ input, model, provider, responseFormat }) => {
            const selectedModel = pickModel(model, provider);

            if (responseFormat === "mp3") {
                const binary = await requestBinary(
                    config,
                    "/v1/audio/speech",
                    {
                        model: selectedModel,
                        input,
                    },
                    {
                        response_format: "mp3",
                    },
                );

                return {
                    content: [{ type: "text", text: toPrettyJson({ model: selectedModel, contentType: binary.contentType, audioBase64: binary.base64, format: "mp3" }) }],
                };
            }

            const payload = await requestJson(config, "/v1/audio/speech", {
                model: selectedModel,
                input,
            }, {
                response_format: "json",
            });

            return {
                content: [{ type: "text", text: toPrettyJson(payload) }],
            };
        },
    );

    server.registerTool(
        "ninerouter_speech_to_text",
        {
            description: "Transcribe audio through 9Router using a local file path or a base64 payload.",
            inputSchema: z.object({
                model: z.string().optional().describe("9Router STT model id, for example openai/whisper-1 or groq/whisper-large-v3-turbo."),
                provider: z.string().optional().describe("Alias for model; accepted for compatibility with 9Router docs."),
                audioPath: z.string().optional().describe("Local path to an audio file."),
                audioBase64: z.string().optional().describe("Base64-encoded audio payload."),
                fileName: z.string().optional().describe("File name to use when uploading a base64 payload."),
                language: z.string().optional().describe("Optional ISO-639-1 language code, for example en or vi."),
                prompt: z.string().optional(),
                responseFormat: z.enum(["json", "text", "verbose_json", "srt", "vtt"]).optional().default("json"),
                temperature: z.number().min(0).max(1).optional(),
            }).refine((value) => Boolean(value.audioPath || value.audioBase64), {
                message: "Provide audioPath or audioBase64.",
            }),
        },
        async ({ model, provider, audioPath, audioBase64, fileName, language, prompt, responseFormat, temperature }) => {
            const selectedModel = pickModel(model, provider);
            const formData = new FormData();
            formData.append("model", selectedModel);

            if (audioPath) {
                const blob = await createFileBlob(audioPath);
                formData.append("file", blob, fileName ?? fileNameFromPath(audioPath));
            } else if (audioBase64) {
                const blob = new Blob([Buffer.from(audioBase64, "base64")]);
                formData.append("file", blob, fileName ?? "audio.bin");
            }

            if (language) {
                formData.append("language", language);
            }
            if (prompt) {
                formData.append("prompt", prompt);
            }
            if (temperature !== undefined) {
                formData.append("temperature", String(temperature));
            }

            const payload = await requestMultipartText(config, "/v1/audio/transcriptions", formData, {
                response_format: responseFormat,
            });

            return {
                content: [{ type: "text", text: payload.text }],
            };
        },
    );
}