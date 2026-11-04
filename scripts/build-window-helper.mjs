import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Arch } from 'builder-util';

export default function beforePack(context) {
    if (context.electronPlatformName !== 'darwin') return;
    const arch = Arch[context.arch];
    if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported window-helper architecture: ${arch}`);
    const root = context.packager.projectDir;
    execFileSync('/usr/bin/xcrun', ['swiftc', '-O', '-target', `${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macos11.0`,
        path.join(root, 'electron/native/window-list.swift'), '-o', path.join(root, `electron/assets/window-list-${arch}`)], { stdio: 'inherit' });
}
