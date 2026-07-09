import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { getConfig, resolveConfigPath } from "./ninerouter-client.js";
import { registerEmbeddingTools } from "./tools/embeddings.js";
import { registerMediaTools } from "./tools/media.js";
import { registerModelTools } from "./tools/models.js";
import { registerWebTools } from "./tools/web.js";

const server = new McpServer({
    name: "9router-mcp",
    version: "0.1.0",
});

async function main(): Promise<void> {
    const configPath = resolveConfigPath(process.argv);
    const config = await getConfig({ configPath });

    registerModelTools(server, config);
    registerWebTools(server, config);
    registerMediaTools(server, config);
    registerEmbeddingTools(server, config);

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});