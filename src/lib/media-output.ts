/**
 * How generated media reaches the caller. Under stdio the MCP server shares the
 * client's filesystem, so a path is enough. Under HTTP the server may sit on
 * another host, where a path points at a filesystem the client cannot open and
 * the bytes need a URL instead.
 */

/** What the caller asked for: `auto` follows the transport, the rest force a shape. */
export type MediaAccessMode = 'auto' | 'path' | 'inline';

export type FileRequest = {
    /** Absolute path the file was written to. */
    path: string;
    contentType: string;
    fileName: string;
    /** MCP session that produced the file, when the transport reports one. */
    sessionId?: string;
    /** The HTTP request being served, used to build an absolute download URL. */
    request?: Request;
};

export type ExposedFile = {
    /** Value the caller uses to reach the bytes. */
    location: string;
    kind: 'path' | 'url';
    /** Unix ms after which a URL stops working. */
    expiresAt?: number;
};

/** Turns a written file into a signed download URL. */
export type FileExposer = (file: FileRequest) => ExposedFile;

export type MediaRuntime = {
    /** True when the server serves over HTTP, so the client may not share its filesystem. */
    remote: boolean;
    /** Present only in remote mode. */
    expose?: FileExposer;
};

export const LOCAL_RUNTIME: MediaRuntime = { remote: false };

export type MediaDelivery = { inline: boolean; url: boolean };

/**
 * `auto` inlines the bytes under stdio and hands back a URL over HTTP. A remote
 * server without an exposer falls back to inlining, because a path it cannot
 * serve is worse than a large response.
 */
export function resolveMediaDelivery(mode: MediaAccessMode, runtime: MediaRuntime): MediaDelivery {
    if (mode === 'path') {
        return { inline: false, url: false };
    }
    if (mode === 'inline') {
        return { inline: true, url: false };
    }
    return runtime.remote && runtime.expose
        ? { inline: false, url: true }
        : { inline: true, url: false };
}
