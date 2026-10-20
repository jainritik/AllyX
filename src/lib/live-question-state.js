/**
 * Keeps the current spoken practice question separate from the text displayed
 * to the participant. Segment boundaries from a speech-to-text provider often
 * repeat a few words, so appending naïvely produces duplicate captions.
 */
function appendNovelTranscript(existing, incoming) {
    const base = String(existing || '').trim();
    const addition = String(incoming || '').trim();
    if (!addition) return base;
    if (!base) return addition;

    const baseWords = base.split(/\s+/);
    const additionWords = addition.split(/\s+/);
    const normalize = (word) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
    const maxOverlap = Math.min(baseWords.length, additionWords.length, 24);

    for (let count = maxOverlap; count > 0; count--) {
        const tail = baseWords.slice(-count).map(normalize).join(' ');
        const head = additionWords.slice(0, count).map(normalize).join(' ');
        if (tail && tail === head) {
            return `${base} ${additionWords.slice(count).join(' ')}`.trim();
        }
    }

    return `${base} ${addition}`.trim();
}

function createLiveQuestionState() {
    let value = '';

    return {
        append(text) {
            value = appendNovelTranscript(value, text);
            return value;
        },
        current() {
            return value;
        },
        consume() {
            const question = value;
            value = '';
            return question;
        },
        clear() {
            value = '';
        },
    };
}

module.exports = { appendNovelTranscript, createLiveQuestionState };
