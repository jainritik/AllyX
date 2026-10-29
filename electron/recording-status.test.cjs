const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('overlay reports stopped, microphone, meeting-only, combined and finalizing audio accurately', () => {
    const source = fs.readFileSync('electron/overlay.html', 'utf8');
    const handlerLine = source.split('\n').find(line => line.includes('api.onRecordingState('));
    let handler;
    const listenButton = { classList: { toggle() {} } };
    const audioNote = {};
    const statuses = [];
    vm.runInNewContext(handlerLine, { api: { onRecordingState: fn => { handler = fn; } }, listenButton, audioNote, setStatus: (...args) => statuses.push(args) });
    for (const [listening, meetingAudio, finalizing, label] of [
        [true, true, false, 'Mic + meeting audio active'],
        [true, false, false, 'Microphone active'],
        [false, true, false, 'Meeting audio active'],
        [false, false, true, 'Finishing audio…'],
        [false, false, false, 'Audio stopped'],
    ]) {
        handler({ listening, meetingAudio, finalizing });
        assert.equal(audioNote.textContent, label);
        assert.equal(listenButton.disabled, finalizing);
    }
    assert.equal(listenButton.textContent, 'Start listening');
    assert.equal(statuses.some(([, tone]) => tone === 'error'), false, 'microphone-only listening is not a permission error');
});
