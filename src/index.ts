#!/usr/bin/env node
// Check if user wants to create config
if (process.argv.includes('create-config')) {
    await import('./create-config.js');
} else {
    // Start MCP server
    await import('./server.js');
}
