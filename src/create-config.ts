#!/usr/bin/env node
import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { constants } from 'node:fs';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'ninerouter-mcp');
const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, 'config.toml');

const DEFAULT_CONFIG = `# NineRouter MCP Configuration
# Generated on ${new Date().toISOString()}

# 9Router base URL (required)
base_url = "http://localhost:20128"

# Optional API key (if your 9Router instance requires auth)
# api_key = "sk-your-key-here"

# Optional: default models with fallback support
# Can be a single string or array of strings for fallback
# If user doesn't specify a model, these will be tried in order
[default_models]

# Web search - tries tavily first, falls back to brave if tavily fails
web_search = ["tavily/search", "brave-search/search"]

# Or use single string for just one default
# web_search = "tavily/search"

# Web fetch - tries firecrawl first, then jina-reader
web_fetch = ["firecrawl/fetch", "jina-reader/fetch"]

# Image generation
generate_image = "openai/dall-e-3"

# Text to speech
text_to_speech = "openai/tts-1"

# Speech to text - tries openai whisper, falls back to groq
speech_to_text = ["openai/whisper-1", "groq/whisper-large-v3-turbo"]

# Embeddings
embeddings = "openai/text-embedding-3-small"
`;

async function createConfig(): Promise<void> {
    try {
        // Create config directory if it doesn't exist
        await mkdir(DEFAULT_CONFIG_DIR, { recursive: true });

        // Check if config file already exists
        try {
            await access(DEFAULT_CONFIG_PATH, constants.F_OK);
            console.log(`⚠️  Config file already exists at: ${DEFAULT_CONFIG_PATH}`);
            console.log('To avoid overwriting your config, the operation was cancelled.');
            console.log('\nTo create a new config, first backup or delete the existing file.');
            return;
        } catch {
            // File doesn't exist, safe to create
        }

        // Write config file
        await writeFile(DEFAULT_CONFIG_PATH, DEFAULT_CONFIG, 'utf8');

        console.log(`✅ Config file created at: ${DEFAULT_CONFIG_PATH}`);
        console.log('\nNext steps:');
        console.log('1. Edit the config file to set your 9Router base URL');
        console.log('2. Optionally configure default models for each tool');
        console.log('3. Restart your MCP client to load the new config');
    } catch (error) {
        console.error('❌ Failed to create config file:', error);
        process.exit(1);
    }
}

createConfig();
