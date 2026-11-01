import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ExposedFile, FileExposer, FileRequest } from './media-output.js';

/** How long a download URL stays valid. */
export const DOWNLOAD_TTL_MS = 15 * 60 * 1000;

export type DownloadEntry = {
    path: string;
    contentType: string;
    fileName: string;
    sessionId: string;
    expiresAt: number;
};

export type MintedLink = {
    sessionId: string;
    id: string;
    expiresAt: number;
    token: string;
};

/** Strip characters that would break out of the Content-Disposition header. */
function safeFileName(name: string): string {
    return name.replace(/["\\\r\n]/g, '');
}

/**
 * Signed, time-limited download URLs. The server holds a random secret for its
 * lifetime; a link carries the session, the file id and an expiry, and the HMAC
 * over all three is the only thing that authorizes the download. That lets a
 * browser fetch the file without the MCP session, while the secret stays local.
 *
 * A session id is assigned when the transport does not report one, so every
 * link is bound to a session either way.
 */
export class DownloadStore {
    private readonly entries = new Map<string, DownloadEntry>();

    constructor(
        private readonly secret: Buffer = randomBytes(32),
        private readonly ttlMs: number = DOWNLOAD_TTL_MS,
    ) {}

    private key(sessionId: string, id: string): string {
        return `${sessionId}:${id}`;
    }

    private sign(sessionId: string, id: string, expiresAt: number): string {
        return createHmac('sha256', this.secret)
            .update(`${sessionId}:${id}:${expiresAt}`)
            .digest('base64url');
    }

    mint(file: FileRequest, now: number = Date.now()): MintedLink {
        const sessionId = file.sessionId ?? randomUUID();
        const id = randomUUID();
        const expiresAt = now + this.ttlMs;
        this.entries.set(this.key(sessionId, id), {
            path: file.path,
            contentType: file.contentType,
            fileName: safeFileName(file.fileName),
            sessionId,
            expiresAt,
        });
        return { sessionId, id, expiresAt, token: this.sign(sessionId, id, expiresAt) };
    }

    /** The entry a valid token points at, or undefined when it is forged or expired. */
    verify(
        sessionId: string,
        id: string,
        expiresAt: number,
        token: string,
        now: number = Date.now(),
    ): DownloadEntry | undefined {
        if (!Number.isFinite(expiresAt) || expiresAt <= now) {
            return undefined;
        }
        const expected = Buffer.from(this.sign(sessionId, id, expiresAt));
        const given = Buffer.from(token);
        if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
            return undefined;
        }
        const entry = this.entries.get(this.key(sessionId, id));
        if (!entry || entry.expiresAt !== expiresAt) {
            return undefined;
        }
        return entry;
    }

    prune(now: number = Date.now()): void {
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) {
                this.entries.delete(key);
            }
        }
    }
}

/**
 * Build an exposer that mints links against the origin the client reached the
 * server on. `publicUrl` wins when set (a deployment behind a proxy), then the
 * request's own host, then `fallbackOrigin` when the transport reports none.
 */
export function createUrlExposer(
    store: DownloadStore,
    filesPath: string,
    publicUrl?: string,
    fallbackOrigin = '',
): FileExposer {
    return (file: FileRequest): ExposedFile => {
        const { sessionId, id, expiresAt, token } = store.mint(file);
        const origin = publicUrl ?? (originFromRequest(file.request) || fallbackOrigin);
        return {
            location: `${origin}${filesPath}/${sessionId}/${id}?exp=${expiresAt}&sig=${token}`,
            kind: 'url',
            expiresAt,
        };
    };
}

/** Prefer the proxy headers when present, then the Host the client used. */
function originFromRequest(request?: Request): string {
    if (!request) {
        return '';
    }
    let parsed: URL;
    try {
        parsed = new URL(request.url);
    } catch {
        return '';
    }
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const host = forwardedHost || request.headers.get('host') || parsed.host;
    if (!host) {
        return '';
    }
    const proto = forwardedProto || parsed.protocol.replace(':', '') || 'http';
    return `${proto}://${host}`;
}
