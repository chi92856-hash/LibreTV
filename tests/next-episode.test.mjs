import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/player.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function harness(episodes, index) {
    const listeners = {}, calls = [];
    const button = { disabled: false, addEventListener: (name, fn) => { listeners[name] = fn; } };
    const wrapper = { querySelector: () => button };
    const pageButton = () => ({ classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} });
    const context = vm.createContext({
        currentEpisodes: episodes, currentEpisodeIndex: index,
        playEpisode: next => { calls.push(next); context.currentEpisodeIndex = next; },
        art: { controls: { 'next-episode': wrapper } },
        document: { getElementById: pageButton }
    });
    vm.runInContext(section('function createNextEpisodeControl()', 'function initPlayer('), context);
    vm.runInContext(section('function playNextEpisode()', '// 复制播放链接'), context);
    vm.runInContext(section('function updateButtonStates()', '// 渲染集数按钮'), context);
    const control = context.createNextEpisodeControl();
    control.mounted(wrapper);
    return { context, button, calls, control, click: () => listeners.click({ stopPropagation() {} }) };
}
test('control bar button advances through the existing episode action', () => {
    const state = harness(['one', 'two', 'three'], 0);
    assert.equal(state.control.position, 'left');
    assert.ok(state.control.index > 10 && state.control.index < 20);
    assert.match(state.control.html, /type="button"/);
    assert.match(state.control.html, /aria-label="下一集"/);
    assert.equal(state.button.disabled, false);
    state.click();
    assert.deepEqual(state.calls, [1]);
    state.context.updateButtonStates();
    assert.equal(state.button.disabled, false);
    state.click();
    state.context.updateButtonStates();
    assert.equal(state.button.disabled, true);
    state.click();
    assert.deepEqual(state.calls, [1, 2]);
});
test('last episode, single episodes and missing episode lists are disabled', () => {
    for (const [episodes, index] of [[['one', 'two'], 1], [['one'], 0], [[], 0]]) {
        const state = harness(episodes, index);
        assert.equal(state.button.disabled, true);
        state.click();
        assert.equal(state.calls.length, 0);
    }
});
