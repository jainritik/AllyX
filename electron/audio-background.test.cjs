const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const interviewSource = fs.readFileSync(path.join(root, 'src/app/interview/page.tsx'), 'utf8');

test('audio detection continues while the main interview window is hidden', () => {
  assert.match(mainSource, /backgroundThrottling:\s*false/);
  assert.match(interviewSource, /vadTimerRef\.current\s*=\s*setInterval\(checkAudioLevel,\s*50\)/);
  assert.doesNotMatch(interviewSource, /requestAnimationFrame\(checkAudioLevel\)/);
});

