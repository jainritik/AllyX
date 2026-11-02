// Explicit reading mode. Escape is also handled natively by Chromium.
function setupPointerLock({ document, window, answer, button, status }) {
    let pending = false;
    let wanted = false;
    const locked = () => document.pointerLockElement === answer;
    const update = () => {
        button.disabled = pending;
        button.textContent = locked() ? 'Unlock pointer' : 'Lock pointer';
        button.setAttribute('aria-pressed', String(locked()));
        status.textContent = locked() ? 'Pointer locked. Scroll to read; press Escape to unlock.' : 'Lock holds the local pointer while reading. Screen-share appearance depends on the meeting app.';
    };
    const release = () => {
        wanted = false;
        if (locked()) document.exitPointerLock();
    };
    const fail = () => {
        pending = false;
        wanted = false;
        update();
        status.textContent = 'Pointer lock unavailable. Click Lock pointer again, or use keyboard scrolling.';
    };
    button.addEventListener('click', async () => {
        if (locked()) { release(); return; }
        if (pending) return;
        pending = true; wanted = true; update();
        try { await answer.requestPointerLock(); }
        catch { fail(); }
    });
    document.addEventListener('pointerlockchange', () => {
        pending = false;
        if (locked() && !wanted) { document.exitPointerLock(); return; }
        if (!locked()) wanted = false;
        update();
    });
    document.addEventListener('pointerlockerror', fail);
    document.addEventListener('wheel', event => {
        if (!locked()) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? answer.clientHeight : 1;
        answer.scrollTop += event.deltaY * unit;
        answer.scrollLeft += event.deltaX * unit;
    }, { passive: false });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') release(); });
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    window.addEventListener('pagehide', release);
    update();
    return { release };
}
if (typeof module !== 'undefined') module.exports = { setupPointerLock };
