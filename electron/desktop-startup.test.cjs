const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const start = mainSource.indexOf('async function loadAppContent()');
const end = mainSource.indexOf('\nfunction toggleApp()', start);
const loadAppContentSource = mainSource.slice(start, end);

test('desktop startup loads the app before checking remote compatibility', () => {
    assert.ok(start >= 0 && end > start, 'loadAppContent should be present');
    assert.match(loadAppContentSource, /mainAppWindow\.loadURL\(startUrl\)/);
    assert.match(loadAppContentSource, /void fetchCompatibilityWithRetry\(\)/);
    assert.doesNotMatch(loadAppContentSource, /dialog\.showErrorBox/);
});
