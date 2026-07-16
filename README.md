9Router MCP Server
==================

[![CI](https://github.com/k1rana/ninerouter-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/k1rana/ninerouter-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/ninerouter-mcp.svg)](https://www.npmjs.com/package/ninerouter-mcp)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://www.npmjs.com/package/ninerouter-mcp)

MCP server that exposes 9Router capabilities as native tools for any MCP client: model discovery, automatic fallback, and Zod-validated inputs.

> **Status:** 9Router already hides provider-specific complexity behind a single API. This server exposes that API through MCP, so agents and apps can call web search, web fetch, image generation, TTS, STT, and embeddings as standard MCP tools — no skill-file loading, no per-provider glue code.

## Why use it

- Tools are always registered; no manual skill loading (saves tokens and context).
- Automatic model fallback when the primary model fails.
- Zod-validated inputs with clear error messages before any network call.
- One config file for endpoint, auth, and default models with fallback chains.
- Single transport (`stdio`); works with any MCP-capable client.

Chat / code generation is intentionally **not** included — that is what the host model is for.

## Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Run](#run)
- [Tools](#tools)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Installation

The package is `ninerouter-mcp` on npm. The JSON body is identical across every MCP client — only the top-level key and file path differ. Paste the block into the right key in your client's config:

```json
{
    "ninerouter": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "ninerouter-mcp"],
        "env": {
            "NINEROUTER_URL": "http://localhost:20128"
        }
    }
}
```

Top-level keys by client: VS Code (`servers`), OpenCode (`mcp`, rename `env` → `environment`, set `type: "local"` and `enabled: true`), Claude Code / Cursor / Windsurf / Claude Desktop / Zed (`mcpServers` or `context_servers`, drop the `type` line). JetBrains uses a UI dialog at **Settings → Tools → AI Assistant → MCP** with the same command, args, and env.

### Claude Code

```bash
claude mcp add --scope user ninerouter -e NINEROUTER_URL=http://localhost:20128 -- npx -y ninerouter-mcp
```

### Codex CLI

```bash
codex mcp add ninerouter --env NINEROUTER_URL=http://localhost:20128 -- npx -y ninerouter-mcp
```

### Hermes Agent

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
    ninerouter:
        command: npx
        args:
            - -y
            - ninerouter-mcp
        env:
            NINEROUTER_URL: http://localhost:20128
```

## Configuration

The server needs a 9Router base URL. Optionally it accepts an API key and default-model fallbacks for each tool.

Sources, in priority order (highest first):

1. CLI flag `--config <path>` (or `--config-file`, `-c`, `NINEROUTER_CONFIG` env)
2. `~/.config/ninerouter-mcp/config.toml`
3. Environment variables: `NINEROUTER_URL`, `NINEROUTER_KEY`

If the config file exists, it wins over environment variables.

### Quick setup

Generate a starter config file and edit it:

```bash
npx ninerouter-mcp create-config
```

This writes `~/.config/ninerouter-mcp/config.toml` and refuses to overwrite an existing file.

### Manual setup (env vars)

**Windows (PowerShell):**

```powershell
$env:NINEROUTER_URL = "http://localhost:20128"
$env:NINEROUTER_KEY = "sk-..."   # optional
```

**macOS / Linux:**

```bash
export NINEROUTER_URL=http://localhost:20128
export NINEROUTER_KEY=sk-...     # optional
```

`NINEROUTER_KEY` is optional and only required when your 9Router instance has auth enabled.

### Manual setup (config file)

```toml
# 9Router base URL (required)
base_url = "http://localhost:20128"

# Optional API key
# api_key = "sk-..."

# Default models with fallback support.
# Single string = one model.
# Array = tried in order, first success wins, errors are aggregated.
[default_models]
web_search      = ["tavily/search", "brave-search/search"]
web_fetch       = ["firecrawl/fetch", "jina-reader/fetch"]
generate_image  = "openai/dall-e-3"
text_to_speech  = "openai/tts-1"
speech_to_text  = ["openai/whisper-1", "groq/whisper-large-v3-turbo"]
embeddings      = "openai/text-embedding-3-small"
```

The `ninerouter` table is also accepted as an alias for top-level `base_url` and `api_key`:

```toml
[ninerouter]
base_url = "http://localhost:20128"
api_key  = "sk-..."
```

Point to a non-default config file:

```bash
npx -y ninerouter-mcp --config /path/to/config.toml
# or
NINEROUTER_CONFIG=/path/to/config.toml npx -y ninerouter-mcp
```

## Run

After `npm install` from this repo:

```bash
npm run build
npm start
```

Or in watch mode during development:

```bash
npm run dev
```

Published package users can run it directly:

```bash
npx -y ninerouter-mcp
```

## Tools

Every tool is registered with the MCP server at startup. Unless noted, all tools return a single text content block with pretty-printed JSON.

### `list_models`

Discover valid model ids before calling other tools.

| Parameter | Type   | Required | Description                                                                                              |
| --------- | ------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `kind`    | string | no       | One of `chat`, `image`, `tts`, `embedding`, `web`, `stt`, `image-to-text`. Omit for default chat models. |

### `web_search`

Search the web through 9Router.

| Parameter      | Type   | Default | Notes                                                                                                |
| -------------- | ------ | ------- | ---------------------------------------------------------------------------------------------------- |
| `query`        | string | —       | Required.                                                                                            |
| `model`        | string | —       | 9Router model id (e.g. `tavily/search`). Falls back to `provider`, then `default_models.web_search`. |
| `provider`     | string | —       | Alias for `model`.                                                                                   |
| `maxResults`   | number | `5`     | 1–20.                                                                                                |
| `searchType`   | string | `web`   | `web` or `news`.                                                                                     |
| `country`      | string | —       |                                                                                                      |
| `language`     | string | —       |                                                                                                      |
| `timeRange`    | string | —       |                                                                                                      |
| `domainFilter` | string | —       |                                                                                                      |

### `web_fetch`

Fetch a URL and return it as markdown, text, or HTML.

| Parameter       | Type   | Default    | Notes                                        |
| --------------- | ------ | ---------- | -------------------------------------------- |
| `url`           | string | —          | Required. Must be a valid URL.               |
| `model`         | string | —          | e.g. `jina-reader/fetch`, `firecrawl/fetch`. |
| `provider`      | string | —          | Alias for `model`.                           |
| `format`        | string | `markdown` | `markdown`, `text`, or `html`.               |
| `maxCharacters` | number | `8000`     | Truncation limit.                            |

### `generate_image`

Text-to-image generation. Always writes a file and returns the image as a base64 content block plus `{ outputPath, bytes, contentType }`. Omit `outputPath` to write to the OS temp dir.

| Parameter    | Type   | Default     | Notes                                                                                               |
| ------------ | ------ | ----------- | --------------------------------------------------------------------------------------------------- |
| `prompt`     | string | —           | Required.                                                                                           |
| `model`      | string | —           | e.g. `openai/dall-e-3`, `gemini/gemini-3-pro-image-preview`.                                        |
| `provider`   | string | —           | Alias for `model`.                                                                                  |
| `n`          | number | `1`         | 1–10.                                                                                               |
| `size`       | string | `1024x1024` |                                                                                                     |
| `quality`    | string | —           | `standard` or `hd`.                                                                                 |
| `outputPath` | string | OS tmpdir   | Where to write the file. Default `os.tmpdir()/ninerouter-<slug>-<ts>.<ext>`. Ext from content-type. |

### `text_to_speech`

Synthesize audio. Always writes a file and returns the audio as a base64 content block plus `{ outputPath, bytes, contentType }`. Omit `outputPath` to write to the OS temp dir.

| Parameter    | Type   | Default   | Notes                                                                                               |
| ------------ | ------ | --------- | --------------------------------------------------------------------------------------------------- |
| `input`      | string | —         | Required.                                                                                           |
| `model`      | string | —         | e.g. `openai/tts-1`, `edge-tts/vi-VN-HoaiMyNeural`.                                                 |
| `provider`   | string | —         | Alias for `model`.                                                                                  |
| `outputPath` | string | OS tmpdir | Where to write the file. Default `os.tmpdir()/ninerouter-<slug>-<ts>.<ext>`. Ext from content-type. |

### `speech_to_text`

Transcribe audio. Provide exactly one of `audioPath` or `audioBase64`.

| Parameter        | Type   | Default | Notes                                                   |
| ---------------- | ------ | ------- | ------------------------------------------------------- |
| `audioPath`      | string | —       | Local file path.                                        |
| `audioBase64`    | string | —       | Base64 payload.                                         |
| `fileName`       | string | derived | Used for the multipart upload filename.                 |
| `model`          | string | —       | e.g. `openai/whisper-1`, `groq/whisper-large-v3-turbo`. |
| `provider`       | string | —       | Alias for `model`.                                      |
| `language`       | string | —       | ISO-639-1 code, e.g. `en`, `vi`.                        |
| `prompt`         | string | —       |                                                         |
| `responseFormat` | string | `json`  | `json`, `text`, `verbose_json`, `srt`, `vtt`.           |
| `temperature`    | number | —       | 0–1.                                                    |

### `embeddings`

Generate embeddings for a string or a batch of strings.

| Parameter        | Type            | Default | Notes                                                         |
| ---------------- | --------------- | ------- | ------------------------------------------------------------- |
| `input`          | string \| array | —       | Required. Either one string or an array of non-empty strings. |
| `model`          | string          | —       | e.g. `openai/text-embedding-3-small`.                         |
| `provider`       | string          | —       | Alias for `model`.                                            |
| `encodingFormat` | string          | `float` | `float` or `base64`.                                          |
| `dimensions`     | number          | —       | Optional override.                                            |

## Behavior notes

- **Fallback chain.** For every model-using tool: if `model`/`provider` is set, only that model is tried. Otherwise the chain in `default_models.<tool>` is tried in order. If all entries fail, the tool throws an `All models failed. Errors: ...` error that includes every per-model message.
- **`provider` is an alias for `model`** on every tool that accepts a model. Set whichever reads better for your use case.
- **Image and audio are always written to a file and returned as a content block.** `generate_image` and `text_to_speech` request `b64_json` / `mp3` from upstream, write the bytes to `outputPath` (or the OS temp dir if you omit it), and return the asset as an MCP `image` / `audio` content block plus `{ outputPath, bytes, contentType }`. The host can display inline or just use the path. Extension is derived from upstream `content-type`.
- **Config file wins over env vars.** If you need different settings for a single run, prefer `--config` over exporting env vars.
- **STT multipart upload.** The tool sends the audio as `multipart/form-data`; `fileName` only matters when the upstream provider inspects the filename.
- **Config is read once at startup.** Edit `config.toml` or change `NINEROUTER_URL` / `NINEROUTER_KEY`, then restart the MCP server in your client. Hot-reload is not implemented.

## Troubleshooting

- **`NINEROUTER_URL is required`** — set the env var or create `~/.config/ninerouter-mcp/config.toml` with `base_url`.
- **`No model specified and no default_models.<tool> configured`** — either pass `model` in the call or add a `default_models` entry to your config.
- **`All models failed. Errors: ...`** — every fallback model returned an error; the aggregated message includes each one for diagnosis.
- **Auth errors (401/403)** — your 9Router instance requires a key; set `NINEROUTER_KEY` or `api_key` in the config file.
- **STT fails with "Provide audioPath or audioBase64"** — exactly one of those two must be set.

## Development

```bash
npm install
npm run dev          # tsx watch mode
npm run build        # tsc -> dist/
npm start            # node dist/index.js
npm run check        # typecheck + lint + prettier --check
```

Project layout:

```
src/
  index.ts               # bin entry; dispatches create-config or server
  server.ts              # McpServer setup
  ninerouter-client.ts   # config + HTTP helpers
  create-config.ts       # `ninerouter-mcp create-config` subcommand
  tools/
    models.ts            # list_models
    web.ts               # web_search, web_fetch
    media.ts             # generate_image, text_to_speech, speech_to_text
    embeddings.ts        # embeddings
    common.ts            # shared fallback + json helpers
config.example.toml      # sample config (mirrors create-config output)
```

## License

Apache-2.0. See [LICENSE](LICENSE).
