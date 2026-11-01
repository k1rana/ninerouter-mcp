import { type NinerouterConfig, requestGetJson } from '../ninerouter-client.js';
import { isCountryCode, toCountryCode, toCountryName } from './countries.js';
import type { WebAction } from './web-model.js';

/**
 * What each web-search provider actually honours. 9Router forwards every filter,
 * but a provider reads only the fields its own request builder knows and drops
 * the rest silently.
 */

/**
 * How a provider spells the country it receives. Shape matters (Tavily wants a
 * name, the rest an ISO 3166-1 alpha-2 code) and so does case: 9Router
 * lowercases it for serper, google-pse and searchapi, but passes it untouched
 * to brave-search, youcom and tinyfish, whose docs ask for uppercase.
 */
export type CountryFormat = 'name' | 'iso2-lower' | 'iso2-upper' | 'any';

export type WebSearchCapabilities = {
    /** Provider reads a `country` field. */
    country: boolean;
    /** Format the provider expects for `country`. */
    countryFormat: CountryFormat;
    /** Provider reads a `language` field. */
    language: boolean;
    /** Provider reads a `time_range` field. */
    timeRange: boolean;
    /** Provider reads a `domain_filter` field. */
    domainFilter: boolean;
};

/** Catalog alias -> provider id, for the providers whose alias differs. */
const PROVIDER_ALIASES: Readonly<Record<string, string>> = {
    brave: 'brave-search',
    gpse: 'google-pse',
    pplx: 'perplexity',
    pw: 'perplexity-web',
};

// Mirrors 9Router's per-provider request builders; keep in step with them.
const CAPABILITIES: Readonly<Record<string, WebSearchCapabilities>> = {
    tavily: {
        country: true,
        countryFormat: 'name',
        language: false,
        timeRange: false,
        domainFilter: true,
    },
    exa: {
        country: false,
        countryFormat: 'any',
        language: false,
        timeRange: false,
        domainFilter: true,
    },
    serper: {
        country: true,
        countryFormat: 'iso2-lower',
        language: true,
        timeRange: false,
        domainFilter: false,
    },
    'brave-search': {
        country: true,
        countryFormat: 'iso2-upper',
        language: true,
        timeRange: false,
        domainFilter: false,
    },
    // Searches through a chat model, which forwards the query and the result
    // count only.
    perplexity: {
        country: false,
        countryFormat: 'any',
        language: false,
        timeRange: false,
        domainFilter: false,
    },
    'google-pse': {
        country: true,
        countryFormat: 'iso2-lower',
        language: true,
        timeRange: true,
        domainFilter: false,
    },
    linkup: {
        country: false,
        countryFormat: 'any',
        language: false,
        timeRange: true,
        domainFilter: true,
    },
    searchapi: {
        country: true,
        countryFormat: 'iso2-lower',
        language: true,
        timeRange: false,
        domainFilter: false,
    },
    youcom: {
        country: true,
        countryFormat: 'iso2-upper',
        language: true,
        timeRange: true,
        domainFilter: true,
    },
    searxng: {
        country: false,
        countryFormat: 'any',
        language: true,
        timeRange: true,
        domainFilter: false,
    },
    xquik: {
        country: false,
        countryFormat: 'any',
        language: true,
        timeRange: false,
        domainFilter: false,
    },
    tinyfish: {
        country: true,
        countryFormat: 'iso2-upper',
        language: true,
        timeRange: false,
        domainFilter: true,
    },
    // Ollama forwards the country and language to its own API, which documents
    // only the query and the result count, and ignores both.
    'ollama-search': {
        country: false,
        countryFormat: 'any',
        language: false,
        timeRange: false,
        domainFilter: false,
    },
    glm: {
        country: false,
        countryFormat: 'any',
        language: false,
        timeRange: false,
        domainFilter: false,
    },
};

/** Providers that read each field, used to explain a dropped filter. */
const SUPPORTED_BY = {
    country: 'tavily, serper, brave-search, google-pse, searchapi, youcom, tinyfish',
    language: 'serper, brave-search, google-pse, searchapi, youcom, searxng, xquik, tinyfish',
    timeRange: 'google-pse, linkup, youcom, searxng',
    domainFilter: 'tavily, exa, linkup, youcom, tinyfish',
} as const;

/**
 * Capabilities of a provider, or undefined for an unknown one (a combo, or a
 * provider added to 9Router later). Unknown providers get every field as-is.
 */
export function lookupWebCapabilities(modelId: string): WebSearchCapabilities | undefined {
    const key = modelId.trim().toLowerCase();
    const providerId = PROVIDER_ALIASES[key] ?? key;
    return CAPABILITIES[providerId];
}

export type CountryConversion =
    { action: 'send'; value: string; warning?: string } | { action: 'drop'; warning: string };

/**
 * Rewrite a country filter into the format the provider expects. A value the
 * provider cannot accept is dropped, not forwarded: Tavily rejects the whole
 * request when its country enum does not match.
 */
export function convertCountry(
    value: string,
    format: CountryFormat,
    provider: string,
): CountryConversion {
    const raw = value.trim();
    if (format === 'any') {
        return { action: 'send', value: raw };
    }

    if (format === 'name') {
        const name = toCountryName(raw);
        if (!name) {
            return {
                action: 'drop',
                warning: `country "${raw}" has no name that ${provider} accepts, so the filter was dropped.`,
            };
        }
        if (name === raw) {
            return { action: 'send', value: name };
        }
        return {
            action: 'send',
            value: name,
            warning: `country "${raw}" went out as "${name}" because ${provider} expects a country name.`,
        };
    }

    const code = toCountryCode(raw);
    if (!code) {
        return {
            action: 'drop',
            warning: `country "${raw}" is not a known country, so the filter was dropped.`,
        };
    }

    const out = format === 'iso2-upper' ? code.toUpperCase() : code;
    if (out === raw) {
        return { action: 'send', value: out };
    }

    if (format === 'iso2-upper') {
        return {
            action: 'send',
            value: out,
            warning: `country "${raw}" went out as "${out}" because ${provider} expects an uppercase ISO 3166-1 alpha-2 code.`,
        };
    }

    if (isCountryCode(raw)) {
        // The provider lowercases the code itself, so the case difference never
        // reaches it.
        return { action: 'send', value: out };
    }

    return {
        action: 'send',
        value: out,
        warning: `country "${raw}" went out as "${out}" because ${provider} expects an ISO 3166-1 alpha-2 code.`,
    };
}

/** Message for a filter the provider never reads. */
export function unsupportedFilterWarning(
    parameter: keyof typeof SUPPORTED_BY,
    provider: string,
): string {
    return `${provider} does not read ${parameter}, so the filter was dropped. Only ${SUPPORTED_BY[parameter]} read it.`;
}

export type ProviderInfo = {
    /** Search types the provider accepts, when 9Router reports them. */
    searchTypes?: string[];
    /** Largest result count the provider accepts. */
    maxResults?: number;
};

const INFO_CACHE_TTL_MS = 60_000;
const infoCache = new Map<string, { expires: number; info: ProviderInfo | undefined }>();

/**
 * Per-provider metadata from 9Router's catalog. Providers without a dedicated
 * search API have no entry, and the caller gets no extra detail.
 */
export async function fetchProviderInfo(
    config: NinerouterConfig,
    modelId: string,
    action: WebAction,
): Promise<ProviderInfo | undefined> {
    const key = `${action}:${modelId}`;
    const cached = infoCache.get(key);
    if (cached && cached.expires > Date.now()) {
        return cached.info;
    }

    let info: ProviderInfo | undefined;
    try {
        const payload = await requestGetJson<Record<string, unknown>>(config, '/v1/models/info', {
            id: `${modelId}/${action}`,
        });
        info = {
            searchTypes: Array.isArray(payload.searchTypes)
                ? payload.searchTypes.filter((value): value is string => typeof value === 'string')
                : undefined,
            maxResults: typeof payload.maxResults === 'number' ? payload.maxResults : undefined,
        };
    } catch {
        info = undefined;
    }

    infoCache.set(key, { expires: Date.now() + INFO_CACHE_TTL_MS, info });
    return info;
}
