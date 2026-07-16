import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse as parseToml } from 'toml';

export type NinerouterConfig = {
    baseUrl: string;
    apiKey?: string;
    defaultModels?: {
        webSearch?: string[];
        webFetch?: string[];
        generateImage?: string[];
        textToSpeech?: string[];
        speechToText?: string[];
        embeddings?: string[];
    };
};

export type NinerouterConfigFile = {
    base_url?: string;
    api_key?: string;
    ninerouter?: {
        base_url?: string;
        api_key?: string;
    };
    default_models?: {
        web_search?: string | string[];
        web_fetch?: string | string[];
        generate_image?: string | string[];
        text_to_speech?: string | string[];
        speech_to_text?: string | string[];
        embeddings?: string | string[];
    };
};

export type NinerouterConfigOptions = {
    configPath?: string;
};

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'ninerouter-mcp', 'config.toml');

export function getDefaultConfigPath(): string {
    return DEFAULT_CONFIG_PATH;
}

export function resolveConfigPath(argv: string[]): string | undefined {
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--config' || argument === '--config-file' || argument === '-c') {
            const nextValue = argv[index + 1];
            if (!nextValue) {
                throw new Error(`Missing value for ${argument}.`);
            }
            return nextValue;
        }

        if (argument.startsWith('--config=') || argument.startsWith('--config-file=')) {
            return argument.slice(argument.indexOf('=') + 1);
        }
    }

    return process.env.NINEROUTER_CONFIG?.trim() || undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function pickConfigValue(
    configFile: NinerouterConfigFile,
    key: 'base_url' | 'api_key',
): string | undefined {
    const nestedValue = configFile.ninerouter?.[key];
    if (typeof nestedValue === 'string' && nestedValue.trim()) {
        return nestedValue.trim();
    }

    const topLevelValue = configFile[key];
    if (typeof topLevelValue === 'string' && topLevelValue.trim()) {
        return topLevelValue.trim();
    }

    return undefined;
}

async function loadConfigFile(configPath: string): Promise<NinerouterConfigFile | null> {
    try {
        await access(configPath);
    } catch {
        return null;
    }

    const raw = await readFile(configPath, 'utf8');
    const parsed = parseToml(raw);
    return parsed as NinerouterConfigFile;
}

export async function getConfig(options: NinerouterConfigOptions = {}): Promise<NinerouterConfig> {
    const configFile = await loadConfigFile(options.configPath ?? DEFAULT_CONFIG_PATH);
    const baseUrlFromFile = configFile ? pickConfigValue(configFile, 'base_url') : undefined;
    const apiKeyFromFile = configFile ? pickConfigValue(configFile, 'api_key') : undefined;

    const baseUrl = baseUrlFromFile ?? process.env.NINEROUTER_URL;
    if (!baseUrl) {
        throw new Error(
            `NINEROUTER_URL is required. Set it in ${options.configPath ?? DEFAULT_CONFIG_PATH} or as an environment variable.`,
        );
    }

    const apiKey = apiKeyFromFile ?? process.env.NINEROUTER_KEY?.trim();

    // Convert snake_case to camelCase and normalize string to array
    const normalizeToArray = (value: string | string[] | undefined): string[] | undefined => {
        if (!value) return undefined;
        return Array.isArray(value) ? value : [value];
    };

    const defaultModels = configFile?.default_models
        ? {
              webSearch: normalizeToArray(configFile.default_models.web_search),
              webFetch: normalizeToArray(configFile.default_models.web_fetch),
              generateImage: normalizeToArray(configFile.default_models.generate_image),
              textToSpeech: normalizeToArray(configFile.default_models.text_to_speech),
              speechToText: normalizeToArray(configFile.default_models.speech_to_text),
              embeddings: normalizeToArray(configFile.default_models.embeddings),
          }
        : undefined;

    return {
        baseUrl: normalizeBaseUrl(baseUrl),
        apiKey: apiKey ? apiKey : undefined,
        defaultModels,
    };
}

function buildUrl(
    baseUrl: string,
    pathname: string,
    query?: Record<string, string | number | boolean | undefined>,
): URL {
    const url = new URL(pathname.replace(/^\//, ''), baseUrl);

    for (const [key, value] of Object.entries(query ?? {})) {
        if (value === undefined) {
            continue;
        }
        url.searchParams.set(key, String(value));
    }

    return url;
}

function authHeaders(apiKey?: string): Record<string, string> {
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function readErrorMessage(response: Response): Promise<string> {
    const text = await response.text();
    if (!text) {
        return `${response.status} ${response.statusText}`;
    }

    try {
        const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
        if (typeof parsed.message === 'string') {
            return parsed.message;
        }
        if (typeof parsed.error === 'string') {
            return parsed.error;
        }
        if (parsed.error && typeof parsed.error === 'object' && 'message' in parsed.error) {
            const message = (parsed.error as { message?: unknown }).message;
            if (typeof message === 'string') {
                return message;
            }
        }
    } catch {
        // Fall through to the raw text body.
    }

    return text;
}

function ensureOk(response: Response, action: string): Promise<Response> | Response {
    if (response.ok) {
        return response;
    }

    return readErrorMessage(response).then((message) => {
        throw new Error(`9Router ${action} failed with ${response.status}: ${message}`);
    });
}

export async function requestJson<TResponse>(
    config: NinerouterConfig,
    pathname: string,
    body: unknown,
    query?: Record<string, string | number | boolean | undefined>,
): Promise<TResponse> {
    const response = await fetch(buildUrl(config.baseUrl, pathname, query), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(config.apiKey),
        },
        body: JSON.stringify(body),
    });

    await ensureOk(response, pathname);
    return (await response.json()) as TResponse;
}

export async function requestGetJson<TResponse>(
    config: NinerouterConfig,
    pathname: string,
    query?: Record<string, string | number | boolean | undefined>,
): Promise<TResponse> {
    const response = await fetch(buildUrl(config.baseUrl, pathname, query), {
        method: 'GET',
        headers: {
            ...authHeaders(config.apiKey),
        },
    });

    await ensureOk(response, pathname);
    return (await response.json()) as TResponse;
}

export async function requestBinary(
    config: NinerouterConfig,
    pathname: string,
    body: unknown,
    query?: Record<string, string | number | boolean | undefined>,
): Promise<{ base64: string; contentType: string | null }> {
    const response = await fetch(buildUrl(config.baseUrl, pathname, query), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(config.apiKey),
        },
        body: JSON.stringify(body),
    });

    await ensureOk(response, pathname);
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
        base64: buffer.toString('base64'),
        contentType: response.headers.get('content-type'),
    };
}

export async function requestMultipartText(
    config: NinerouterConfig,
    pathname: string,
    formData: FormData,
    query?: Record<string, string | number | boolean | undefined>,
): Promise<{ text: string; contentType: string | null }> {
    const response = await fetch(buildUrl(config.baseUrl, pathname, query), {
        method: 'POST',
        headers: {
            ...authHeaders(config.apiKey),
        },
        body: formData,
    });

    await ensureOk(response, pathname);
    return {
        text: await response.text(),
        contentType: response.headers.get('content-type'),
    };
}

export async function createFileBlob(filePath: string): Promise<Blob> {
    const content = await readFile(filePath);
    return new Blob([content]);
}

export function fileNameFromPath(filePath: string): string {
    return path.basename(filePath);
}
