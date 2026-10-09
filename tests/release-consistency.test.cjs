const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const downloadLinks = fs.readFileSync(path.join(root, 'src/lib/download-links.ts'), 'utf8');
const compatibilityRoute = fs.readFileSync(path.join(root, 'src/app/api/desktop-compat/route.ts'), 'utf8');

test('download URLs and desktop compatibility identify the packaged version', () => {
    const version = packageJson.version;
    assert.match(downloadLinks, new RegExp(`allyx-v${version.replaceAll('.', '\\.')}-unsigned`));
    assert.match(downloadLinks, new RegExp(`AllyX-${version.replaceAll('.', '\\.')}-arm64\\.dmg`));
    assert.match(downloadLinks, new RegExp(`AllyX-${version.replaceAll('.', '\\.')}-x64\\.dmg`));
    assert.match(downloadLinks, new RegExp(`AllyX-${version.replaceAll('.', '\\.')}-Setup\\.exe`));
    assert.match(compatibilityRoute, new RegExp(`rendererVersion:\\s*["']${version.replaceAll('.', '\\.')}["']`));
});
