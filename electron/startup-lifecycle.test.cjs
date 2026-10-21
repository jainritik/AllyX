const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

test('duplicate launch can quit before Electron is ready without touching global shortcuts', () => {
    assert.match(
        mainSource,
        /app\.on\('before-quit',[\s\S]*?if \(app\.isReady\(\)\) globalShortcut\.unregisterAll\(\);/,
    );
});
