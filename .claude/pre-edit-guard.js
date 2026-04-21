#!/usr/bin/env node
// pre-edit-guard.js — warns when editing central components (non-blocking, always exits 0)
// Wired as a PreToolUse hook for Edit|Write|MultiEdit. See docs/CENTRAL_COMPONENTS.md.
'use strict';

const fs = require('fs');
const path = require('path');

let raw = '';
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const filePath = event.tool_input?.file_path || '';
    if (!filePath) process.exit(0);

    const guardFile = path.join(__dirname, 'central-components.json');
    const { components } = JSON.parse(fs.readFileSync(guardFile, 'utf8'));

    const isCentral = components.some(c => filePath.endsWith(c) || filePath.includes(c));
    if (isCentral) {
      process.stdout.write(
        `⚠️  CENTRAL COMPONENT: ${filePath}\n` +
        `Follow the 4-step protocol in docs/CENTRAL_COMPONENTS.md before shipping:\n` +
        `  1. Read the full file before editing\n` +
        `  2. Run /adversarial-review after (even if build fails)\n` +
        `  3. Add a regression test if logic changed\n` +
        `  4. Update HANDOFF.md with what changed and why\n`
      );
    }
  } catch (_) {
    // Fail-open: any parse/IO error → silent skip
  }
  process.exit(0);
});
