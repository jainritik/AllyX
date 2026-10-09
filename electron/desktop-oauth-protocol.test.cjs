const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const authNavigation = fs.readFileSync(path.join(root, 'src/lib/auth-navigation.ts'), 'utf8');

test('desktop OAuth uses the system browser and registers a secure return protocol', () => {
    assert.match(mainSource, /shell\.openExternal\(authorizationUrl\)/);
    assert.match(mainSource, /setAsDefaultProtocolClient\(DEEP_LINK_SCHEME/);
    assert.match(mainSource, /app\.on\('open-url'/);
    assert.match(builderConfig, /schemes:\s*\n\s*- allyx/);
    assert.match(authNavigation, /desktop.*1/s);
    assert.match(authNavigation, /\/auth\/callback/);
});
