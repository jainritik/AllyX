function shouldPreventWindowClose(isQuitting) {
    return !isQuitting;
}

function shouldShowInterviewOverlay({ rendererReady, isInterviewPage, presentationSafeMode }) {
    return Boolean(rendererReady && isInterviewPage && !presentationSafeMode);
}

module.exports = { shouldPreventWindowClose, shouldShowInterviewOverlay };
