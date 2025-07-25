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

// Test sequence for cross-file relationships
const tests = [
  // Index the codebase
  {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "index",
      arguments: {}
    }
  },
  // List entities in main.pl (should show imports and method calls)
  {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "list_file_entities",
      arguments: {
        path: "perl/main.pl"
      }
    }
  },
  // List entities in Utils.pm
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "list_file_entities",
      arguments: {
        path: "perl/Utils.pm"
      }
    }
  },
  // Check relationships for Utils import in main.pl
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "list_entity_relationships",
      arguments: {
        path: "perl/main.pl",
        name: "Utils"
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
    setTimeout(sendNextTest, 2000); // Wait 2 seconds between tests
  } else {
    setTimeout(() => {
      server.kill();
    }, 2000);
  }
}

// Start testing after a short delay
setTimeout(sendNextTest, 1000);
