const unsignedReleaseBase = "https://github.com/jainritik/AllyX/releases/download/allyx-v1.3.16-unsigned";

export const desktopDownloads = {
    macArm64: process.env.NEXT_PUBLIC_ALLYX_MAC_ARM64_URL
        || `${unsignedReleaseBase}/AllyX-1.3.16-arm64.dmg`,
    macX64: process.env.NEXT_PUBLIC_ALLYX_MAC_X64_URL
        || `${unsignedReleaseBase}/AllyX-1.3.16-x64.dmg`,
    windowsX64: process.env.NEXT_PUBLIC_ALLYX_WINDOWS_X64_URL
        || `${unsignedReleaseBase}/AllyX-1.3.16-Setup.exe`,
};
