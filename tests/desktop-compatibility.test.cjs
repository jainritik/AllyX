const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const compatibilityRoute = fs.readFileSync(path.join(root, 'src/app/api/desktop-compat/route.ts'), 'utf8');

test('hosted renderer remains compatible with supported installed desktop builds', () => {
    const match = compatibilityRoute.match(/rendererVersion:\s*"(\d+\.\d+\.\d+)"\s*,\s*minimumDesktopVersion:\s*"(\d+\.\d+\.\d+)"/);
    assert.ok(match, 'desktop compatibility route should expose both versions');
    const parse = value => value.split('.').map(Number);
    const [renderer, minimum] = [parse(match[1]), parse(match[2])];
    for (let index = 0; index < renderer.length; index += 1) {
        if (renderer[index] !== minimum[index]) {
            assert.ok(renderer[index] > minimum[index], 'minimum desktop version cannot exceed renderer version');
            return;
        }
    }
    assert.deepEqual(renderer, minimum);
});
