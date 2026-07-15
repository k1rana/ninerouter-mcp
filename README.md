# NineRouter MCP

MCP server for 9Router with model discovery, automatic fallback, and type-safe validation.

## Why this exists

9Router already hides provider-specific complexity behind a single API. This project exposes that API through MCP so clients can use 9Router capabilities directly as native tools.

**Benefits over skill-based approaches:**

- No repeated skill file loading (saves tokens and reduces context usage)
- Tools are always available without manual skill invocation
- Automatic model fallback when primary models fail
- Type-safe validation with proper error messages
- Direct integration into MCP-native workflows

The goal is not to replace 9Router or duplicate its docs. The goal is to make 9Router capabilities immediately accessible from any MCP client.

## What it provides

- Model discovery for choosing valid model ids
- Web search for finding current information
- Web fetch for turning URLs into readable text or markdown
- Image generation for text-to-image workflows
- Text-to-speech for voice output
- Speech-to-text for transcription
- Embeddings for retrieval and semantic search

## When to use it

Use this server when you want an AI agent or app to work with 9Router through MCP instead of custom integration code for each capability.

It is especially useful when you want one backend that can access multiple providers but still present a single tool interface to the model.

If your client can already call MCP tools directly, you do not need separate 9Router skill docs; the MCP server becomes the integration layer.

Chat/code-gen is intentionally left out of this MCP server.

## Installation

**Kilo CLI / VS Code**

Add to your `kilo.json`:

```json
{
    "mcp": {
        "ninerouter": {
            "type": "local",
            "command": ["npx", "-y", "ninerouter-mcp"],
            "environment": {
                "NINEROUTER_URL": "http://localhost:20128"
            },
            "enabled": true
        }
    }
}
```

**Claude Code**

```bash
claude mcp add --scope user ninerouter -e NINEROUTER_URL=http://localhost:20128 -- npx -y ninerouter-mcp
```

**Codex CLI**

```bash
codex mcp add ninerouter --env NINEROUTER_URL=http://localhost:20128 -- npx -y ninerouter-mcp
```

**Agent Manager (VS Code Extension)**

Use the MCP settings in your workspace `kilo.json` (same as Kilo CLI above). Agent Manager automatically inherits MCP servers from Kilo config.

## Configuration

### Quick Setup

Create a config file with defaults:

```bash
npx ninerouter-mcp create-config
```

This creates `~/.config/ninerouter-mcp/config.toml` with sample configuration. Edit it to set your 9Router base URL and optionally configure default models.

### Manual Setup

1. Install dependencies:

    ```bash
    npm install
    ```

2. Configure the 9Router endpoint:

    ```bash
    set NINEROUTER_URL=http://localhost:20128
    set NINEROUTER_KEY=sk-...
    ```

    `NINEROUTER_KEY` is optional when your 9Router instance does not require auth.

    You can also use a config file at `~/.config/ninerouter-mcp/config.toml`.
    TOML settings override environment variables.

    Example:

    ```toml
    base_url = "http://localhost:20128"
    api_key = "sk-..."

    # Optional: default models with fallback support
    [default_models]
    web_search = ["tavily/search", "brave-search/search"]
    web_fetch = "firecrawl/fetch"
    generate_image = "openai/dall-e-3"
    text_to_speech = "openai/tts-1"
    speech_to_text = ["openai/whisper-1", "groq/whisper-large-v3-turbo"]
    embeddings = "openai/text-embedding-3-small"
    ```

    Default models can be a single string or array of strings. When array, models are tried in order until one succeeds. If all fail, errors are aggregated.

    To pass a different config file at startup, use `--config`:

    ```bash
    npm start -- --config D:\path\to\config.toml
    ```

3. Build the server:

    ```bash
    npm run build
    ```

4. Start the MCP server over stdio:

    ```bash
    npm start
    ```

## Run

For local development in this repo:

```bash
npm run build
npm start
```

If you publish the package to npm, users can run it directly with npx:

```bash
npx -y ninerouter-mcp
```

That works because the package exposes a `bin` entry and builds `dist/index.js` during packing.

If you want to run from the repo without publishing, use:

```bash
npx tsx src/index.ts
```

## Available Tools

- `list_models`
- `web_search`
- `web_fetch`
- `generate_image`
- `text_to_speech`
- `speech_to_text`
- `embeddings`

## Notes

- The server expects a local or reachable 9Router base URL in `NINEROUTER_URL`.
- If present, `~/.config/ninerouter-mcp/config.toml` is loaded first and wins over env vars.
- `list_models` can list default chat models or a specific capability kind like `image`, `tts`, `embedding`, `web`, `stt`, or `image-to-text`.
- STT accepts either a local `audioPath` or a base64 payload.
- Image and audio tools return JSON text, including base64 data when the upstream API returns binary content.
