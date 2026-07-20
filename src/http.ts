import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
    WebStandardStreamableHTTPServerTransport,
    isJsonContentType,
} from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { getConfig, resolveConfigPath } from './ninerouter-client.js';
import type { NinerouterConfig } from './ninerouter-client.js';
import { buildServer, registerTools } from './server.js';

type HttpArgs = {
    port: number;
    host: string;
    path: string;
    configPath: string | undefined;
};

function parseHttpArgs(argv: string[]): HttpArgs {
    let port = 3000;
    let host = '127.0.0.1';

    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index];
        const nextValue = argv[index + 1];

        if (argument === '--port' || argument === '-p') {
            if (!nextValue) throw new Error(`Missing value for ${argument}.`);
            const parsed = Number.parseInt(nextValue, 10);
            if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
                throw new Error(`Invalid port: ${nextValue}`);
            }
            port = parsed;
            index += 1;
        } else if (argument === '--host') {
            if (!nextValue) throw new Error(`Missing value for --host.`);
            host = nextValue;
            index += 1;
        }
    }

    return { port, host, path: '/mcp', configPath: resolveConfigPath(argv) };
}

function toWebRequest(req: IncomingMessage): Request {
    const host = req.headers.host ?? 'localhost';
    const protocol = 'http';
    const url = `${protocol}://${host}${req.url ?? '/'}`;

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            for (const v of value) headers.append(name, v);
        } else {
            headers.set(name, value);
        }
    }

    const init: RequestInit = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = new ReadableStream<Uint8Array>({
            start(controller) {
                req.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
                req.on('end', () => controller.close());
                req.on('error', (error) => controller.error(error));
            },
        });
        (init as RequestInit & { duplex: 'half' }).duplex = 'half';
    }
    return new Request(url, init);
}

async function sendWebResponse(
    nodeResponse: import('node:http').ServerResponse,
    response: Response,
): Promise<void> {
    applyCors(nodeResponse);
    nodeResponse.statusCode = response.status;
    response.headers.forEach((value, name) => {
        if (name.toLowerCase() === 'set-cookie') return;
        if (name.toLowerCase().startsWith('access-control-')) return;
        nodeResponse.setHeader(name, value);
    });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) nodeResponse.appendHeader('set-cookie', cookie);

    if (response.body) {
        const reader = response.body.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) nodeResponse.write(Buffer.from(value));
            }
        } finally {
            reader.releaseLock();
        }
    }
    nodeResponse.end();
}

const CORS_HEADERS: Record<string, string> = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers':
        'content-type, mcp-session-id, mcp-protocol-version, mcp-method, mcp-name, accept',
    'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
    'access-control-max-age': '86400',
};

function applyCors(res: import('node:http').ServerResponse): void {
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(name, value);
    }
}

type Session = {
    transport: WebStandardStreamableHTTPServerTransport;
    server: McpServer;
};

async function main(): Promise<void> {
    const args = parseHttpArgs(process.argv);
    const config: NinerouterConfig = await getConfig({ configPath: args.configPath });

    const sessions = new Map<string, Session>();

    const createSession = async (): Promise<{
        transport: WebStandardStreamableHTTPServerTransport;
        server: McpServer;
    }> => {
        const server = buildServer();
        registerTools(server, config);
        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
                sessions.set(sessionId, { transport, server });
            },
            onsessionclosed: (sessionId) => {
                sessions.delete(sessionId);
            },
        });
        await server.connect(transport);
        return { transport, server };
    };

    const server = createServer(async (req, res) => {
        const start = Date.now();
        const log = (status: number): void => {
            const ms = Date.now() - start;
            const size = Number(res.getHeader('content-length')) || 0;
            const mcpMethod = req.headers['mcp-method'];
            const tag = mcpMethod ? ` ${String(mcpMethod)}` : '';
            const sid = req.headers['mcp-session-id'];
            const sidTag = sid ? ` sid=${String(sid).slice(0, 8)}` : '';
            process.stderr.write(
                `[${new Date().toISOString()}] ${req.method} ${req.url}${tag}${sidTag} → ${status} ${ms}ms ${size}B\n`,
            );
        };

        try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            if (url.pathname !== args.path) {
                applyCors(res);
                res.statusCode = 404;
                res.setHeader('content-type', 'text/plain');
                res.end('Not Found');
                log(404);
                return;
            }

            if (req.method === 'OPTIONS') {
                applyCors(res);
                res.statusCode = 204;
                res.end();
                log(204);
                return;
            }

            if (req.method === 'POST' && !isJsonContentType(req.headers['content-type'] ?? null)) {
                applyCors(res);
                res.statusCode = 415;
                res.setHeader('content-type', 'text/plain');
                res.end('Content-Type must be application/json');
                log(415);
                return;
            }

            const sessionHeader = req.headers['mcp-session-id'];
            const sessionId = typeof sessionHeader === 'string' ? sessionHeader : undefined;

            let transport: WebStandardStreamableHTTPServerTransport;

            if (sessionId && sessions.has(sessionId)) {
                transport = sessions.get(sessionId)!.transport;
            } else {
                const created = await createSession();
                transport = created.transport;
            }

            const request = toWebRequest(req);
            const response = await transport.handleRequest(request);
            await sendWebResponse(res, response);
            log(response.status);
        } catch (error) {
            console.error(error);
            if (!res.headersSent) {
                applyCors(res);
                res.statusCode = 500;
                res.setHeader('content-type', 'text/plain');
            }
            res.end('Internal Server Error');
            log(500);
        }
    });

    await new Promise<void>((resolve) => server.listen(args.port, args.host, resolve));
    console.error(`ninerouter-mcp HTTP listening on http://${args.host}:${args.port}${args.path}`);

    const shutdown = (): void => {
        server.close(() => {
            for (const { transport, server: s } of sessions.values()) {
                void transport.close();
                void s.close?.();
            }
            process.exit(0);
        });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

void main();
