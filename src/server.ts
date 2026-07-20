import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { getConfig, resolveConfigPath } from './ninerouter-client.js';
import { registerEmbeddingTools } from './tools/embeddings.js';
import { registerMediaTools } from './tools/media.js';
import { registerModelTools } from './tools/models.js';
import { registerWebTools } from './tools/web.js';
import type { NinerouterConfig } from './ninerouter-client.js';

export function buildServer(): McpServer {
    const server = new McpServer(
        {
            name: 'ninerouter-mcp',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );
    return server;
}

export function registerTools(server: McpServer, config: NinerouterConfig): void {
    registerModelTools(server, config);
    registerWebTools(server, config);
    registerMediaTools(server, config);
    registerEmbeddingTools(server, config);
}

async function main(): Promise<void> {
    const configPath = resolveConfigPath(process.argv);
    const config = await getConfig({ configPath });

    const server = buildServer();
    registerTools(server, config);

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
