const unsignedReleaseBase = "https://github.com/jainritik/ZedxAI/releases/download/allyx-v1.3.4-unsigned";

export const desktopDownloads = {
    macArm64: process.env.NEXT_PUBLIC_ALLYX_MAC_ARM64_URL
        || process.env.NEXT_PUBLIC_ZEDX_MAC_ARM64_URL
        || `${unsignedReleaseBase}/AllyX-1.3.4-arm64.dmg`,
    macX64: process.env.NEXT_PUBLIC_ALLYX_MAC_X64_URL
        || process.env.NEXT_PUBLIC_ZEDX_MAC_X64_URL
        || `${unsignedReleaseBase}/AllyX-1.3.4-x64.dmg`,
    windowsX64: process.env.NEXT_PUBLIC_ALLYX_WINDOWS_X64_URL
        || process.env.NEXT_PUBLIC_ZEDX_WINDOWS_X64_URL
        || `${unsignedReleaseBase}/AllyX-1.3.4-Setup.exe`,
};
