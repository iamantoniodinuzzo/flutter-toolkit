'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '../../skills/dev-issue');
const files = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]);

test('dev-issue carries no project-specific names', () => {
  const banned = /pollicino|tomcat|common_ui|engage-srl|pegasus|#1\d{3}\b/i;
  for (const file of files(dir)) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), banned, path.relative(dir, file));
  }
});
