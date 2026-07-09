# 9Router MCP

Thin MCP wrapper around 9Router that exposes a small, consistent tool set.

## Why this exists

9Router already hides provider-specific complexity behind a single API. This project wraps that API in MCP so clients can call one server instead of handling raw HTTP, request shapes, and provider differences themselves.

The goal is not to replace 9Router or duplicate its docs. The goal is to make 9Router easier to use from MCP-native clients.

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

Chat/code-gen is intentionally left out in this wrapper.

## Setup

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

   You can also use a config file at `~/.config/9router-mcp/config.toml`.
   TOML settings override environment variables.

   Example:

   ```toml
   base_url = "http://localhost:20128"
   api_key = "sk-..."
   ```

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
npx -y 9router-mcp
```

That works because the package exposes a `bin` entry and builds `dist/index.js` during packing.

If you want to run from the repo without publishing, use:

```bash
npx tsx src/index.ts
```

## Available Tools

- `ninerouter_list_models`
- `ninerouter_web_search`
- `ninerouter_web_fetch`
- `ninerouter_generate_image`
- `ninerouter_text_to_speech`
- `ninerouter_speech_to_text`
- `ninerouter_embeddings`

## Notes

- The server expects a local or reachable 9Router base URL in `NINEROUTER_URL`.
- If present, `~/.config/9router-mcp/config.toml` is loaded first and wins over env vars.
- `ninerouter_list_models` can list default chat models or a specific capability kind like `image`, `tts`, `embedding`, `web`, `stt`, or `image-to-text`.
- STT accepts either a local `audioPath` or a base64 payload.
- Image and audio tools return JSON text, including base64 data when the upstream API returns binary content.
