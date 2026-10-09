const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('release checksum script produces a deterministic manifest for one installer', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allyx-release-'));
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist', 'AllyX-test-arm64.dmg'), 'signed-installer-fixture');
    const result = spawnSync(process.execPath, [path.resolve('scripts/create-release-checksums.mjs'), 'macos-arm64'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const manifest = fs.readFileSync(path.join(root, 'dist', 'SHA256SUMS-macos-arm64.txt'), 'utf8');
    assert.match(manifest, /^[a-f0-9]{64}  AllyX-test-arm64\.dmg\n$/);
});

test('tagged releases are blocked when signing secrets are absent', () => {
    const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
    const result = spawnSync(process.execPath, [path.resolve('scripts/check-desktop-release.mjs'), 'windows-x64'], {
        env: { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: `desktop-v${version}`, WIN_CSC_LINK: '', WIN_CSC_KEY_PASSWORD: '' },
        encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Signed release blocked/);
});

test('explicit unsigned prerelease tags do not require signing secrets', () => {
    const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
    const result = spawnSync(process.execPath, [path.resolve('scripts/check-desktop-release.mjs'), 'windows-x64'], {
        env: { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: `allyx-v${version}-unsigned`, WIN_CSC_LINK: '', WIN_CSC_KEY_PASSWORD: '' },
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
});

test('desktop workflow separates signed releases from explicitly unsigned prereleases', () => {
    const workflow = fs.readFileSync('.github/workflows/desktop-installers.yml', 'utf8');
    assert.match(workflow, /Verify Apple signature and notarization/);
    assert.match(workflow, /Verify Windows Authenticode signature/);
    assert.match(workflow, /needs: build/);
    assert.match(workflow, /gh release create/);
    assert.match(workflow, /publish_unsigned_release/);
    assert.match(workflow, /--prerelease/);
    assert.match(workflow, /Verify desktop OAuth return protocol/);
    assert.match(workflow, /unknown-publisher warning/);
    assert.match(workflow, /ALLYX_ADHOC_SIGN/);
    assert.match(workflow, /Verify unsigned macOS bundle integrity/);
    assert.match(fs.readFileSync('electron-builder.yml', 'utf8'), /afterSign: scripts\/after-sign\.mjs/);
});
