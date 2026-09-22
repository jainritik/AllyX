// API availability is not proof of exclusion in a receiver's recording.
function getPlatformCapabilities(platform, release = '') {
    const parts = release.split('.').map(Number);
    const modernWindows = platform === 'win32' && parts.length >= 3 &&
        parts.every(Number.isFinite) && (parts[0] > 10 ||
            (parts[0] === 10 && parts[2] >= 19041));
    return {
        platform,
        release,
        captureExclusion: modernWindows ? 'api-available-unverified' :
            platform === 'darwin' ? 'not-guaranteed' : 'unsupported-or-unknown',
        receiverVerified: false,
        receiverVerificationStatus: 'not-tested',
        uncoveredSurfaces: ['native-menus', 'permission-prompts', 'notifications', 'system-dialogs'],
        automaticExternalSharingDetection: 'unknown',
        recommendedFallback: 'hide-locally',
    };
}

module.exports = { getPlatformCapabilities };
