const bindings = [
    ['CommandOrControl+Shift+Up', 'up'],
    ['CommandOrControl+Shift+Down', 'down'],
    ['CommandOrControl+Shift+Left', 'top'],
    ['CommandOrControl+Shift+Right', 'bottom'],
    ['CommandOrControl+Shift+P', 'toggle-cursor'],
];

function bindOverlayShortcuts(window, shortcuts) {
    const registered = [];
    const clear = () => { for (const key of registered.splice(0)) shortcuts.unregister(key); };
    const refresh = () => {
        clear();
        if (window.isDestroyed() || !window.isVisible()) return;
        const unavailable = [];
        for (const [key, action] of bindings) {
            if (shortcuts.register(key, () => {
                if (!window.isDestroyed() && window.isVisible()) window.webContents.send('overlay-keyboard-action', action);
            })) registered.push(key);
            else unavailable.push(key);
        }
        window.webContents.send('overlay-shortcut-status', unavailable);
    };
    window.on('show', refresh);
    window.on('hide', clear);
    window.on('closed', clear);
    return { refresh, clear };
}
module.exports = { bindOverlayShortcuts, bindings };
