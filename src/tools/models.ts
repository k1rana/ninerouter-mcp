import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { type NinerouterConfig, requestGetJson } from "../ninerouter-client.js";
import { toPrettyJson } from "./common.js";

const MODEL_KINDS = ["chat", "image", "tts", "embedding", "web", "stt", "image-to-text"] as const;

type ModelKind = (typeof MODEL_KINDS)[number];

type ModelListResponse = {
    object?: string;
    data?: Array<Record<string, unknown>>;
};

export function registerModelTools(server: McpServer, config: NinerouterConfig): void {
    server.registerTool(
        "ninerouter_list_models",
        {
            description: "List available 9Router models. Call this first to choose a valid model id before using any other 9Router tool.",
            inputSchema: z.object({
                kind: z.enum(MODEL_KINDS).optional().describe("Optional model category. Omit to list default chat models."),
            }),
        },
        async ({ kind }) => {
            const payload = kind
                ? await requestGetJson<ModelListResponse>(config, `/v1/models/${kind}`)
                : await requestGetJson<ModelListResponse>(config, "/v1/models");

            return {
                content: [{ type: "text", text: toPrettyJson(payload) }],
            };
        },
    );
}