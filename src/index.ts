#!/usr/bin/env node
function hasFlag(flag: string): boolean {
    return process.argv.includes(flag);
}

// Check if user wants to create config
if (hasFlag('create-config')) {
    await import('./create-config.js');
} else if (hasFlag('--http')) {
    // Start MCP server over Streamable HTTP
    await import('./http.js');
} else {
    // Start MCP server over stdio
    await import('./server.js');
}
