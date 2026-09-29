const unsignedReleaseBase = "https://github.com/jainritik/AllyX/releases/download/allyx-v1.3.14-unsigned";
const previousUnsignedReleaseBase = "https://github.com/jainritik/AllyX-Releases/releases/download/v1.3.5-unsigned";

export const desktopDownloads = {
    macArm64: process.env.NEXT_PUBLIC_ALLYX_MAC_ARM64_URL
        || `${unsignedReleaseBase}/AllyX-1.3.14-arm64.dmg`,
    macX64: process.env.NEXT_PUBLIC_ALLYX_MAC_X64_URL
        || `${previousUnsignedReleaseBase}/AllyX-1.3.5-x64.dmg`,
    windowsX64: process.env.NEXT_PUBLIC_ALLYX_WINDOWS_X64_URL
        || `${previousUnsignedReleaseBase}/AllyX-1.3.5-Setup.exe`,
};
