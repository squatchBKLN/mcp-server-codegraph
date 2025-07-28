#!/usr/bin/env node

import { spawn } from 'child_process';

// Start the MCP server
const server = spawn('node', ['dist/index.js', 'test'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

let responseBuffer = '';

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  // Try to parse JSON responses
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || ''; // Keep incomplete line
  
  lines.forEach(line => {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log('Response:', JSON.stringify(response, null, 2));
      } catch (e) {
        console.log('Non-JSON output:', line);
      }
    }
  });
});

server.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
});

// Test sequence for Mermaid diagram generation
const tests = [
  // Index the codebase first
  {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "index",
      arguments: {}
    }
  },
  // Generate dependency diagram
  {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "generate_mermaid",
      arguments: {
        type: "dependency"
      }
    }
  },
  // Generate entity diagram
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "generate_mermaid",
      arguments: {
        type: "entity"
      }
    }
  }
];

// Send tests with delays
let testIndex = 0;
function sendNextTest() {
  if (testIndex < tests.length) {
    const test = tests[testIndex++];
    console.log('Sending:', JSON.stringify(test, null, 2));
    server.stdin.write(JSON.stringify(test) + '\n');
    setTimeout(sendNextTest, 3000); // Wait 3 seconds between tests
  } else {
    setTimeout(() => {
      server.kill();
    }, 2000);
  }
}

// Start testing after a short delay
setTimeout(sendNextTest, 1000);
