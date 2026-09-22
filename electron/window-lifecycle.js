function shouldPreventWindowClose(isQuitting) {
    return !isQuitting;
}

module.exports = { shouldPreventWindowClose };
