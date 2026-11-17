import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/player.js', import.meta.url), 'utf8');
const start = source.indexOf('function createNextEpisodeControl()');
const end = source.indexOf('// 自定义M3U8 Loader', start);

function recoveryHarness() {
    const calls = [], handlers = {}, videoEvents = {};
    const video = { currentTime: 45, paused: false, canPlayType: () => '',
        addEventListener: (event, fn) => { videoEvents[event] = fn; } };
    class Hls {
        static DefaultConfig = { loader() {} };
        static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest', FRAG_LOADED: 'frag', LEVEL_LOADED: 'level' };
        static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
        static isSupported() { return true; }
        on(event, fn) { handlers[event] = fn; }
        loadSource(url) { calls.push(['load', url]); }
        attachMedia() {}
        startLoad(time) { calls.push(['resume', time]); }
        recoverMediaError() { calls.push(['recover']); }
        stopLoad() { calls.push(['stop']); }
    }
    class Player {
        constructor(options) { options.customType.m3u8(video, options.url); }
        on() { return this; }
    }
    const context = vm.createContext({ art: null, currentHls: null,
        lastPlaybackError: '', adFilteringEnabled: false, currentVideoTitle: '测试',
        document: { getElementById: () => ({ style: {} }) }, navigator: {}, Hls, Artplayer: Player,
        getPlaybackType: () => 'm3u8', setupLongPressSpeedControl() {},
        setTimeout() {}, clearTimeout() {}, showError: message => calls.push(['error', message])
    });
    vm.runInContext(source.slice(start, end), context);
    context.initPlayer('https://fixture.invalid/video.m3u8');
    const error = (type = 'networkError', details = 'fragLoadError', fatal = true) => handlers.error(null, { type, details, fatal });
    return { calls, video, videoEvents, error };
}

test('HLS warnings do not exhaust retries and recovery resumes at the current position', () => {
    const h = recoveryHarness();
    for (let i = 0; i < 10; i++) h.error('mediaError', 'bufferStalledError', false);
    h.error();
    assert.deepEqual(h.calls.at(-1), ['resume', 45]);
    h.error();
    h.video.currentTime += 0.25;
    h.videoEvents.timeupdate();
    h.error();
    assert.deepEqual(h.calls.at(-1), ['resume', 45.25]);
    h.error('mediaError', 'bufferAppendError');
    assert.deepEqual(h.calls.at(-1), ['recover']);
    h.error();
    assert.deepEqual(h.calls.at(-1), ['stop']);
    assert.ok(h.calls.some(call => call[0] === 'error'));
});

test('HLS manifest failures reload the manifest instead of only starting segment loading', () => {
    const h = recoveryHarness();
    h.error('networkError', 'manifestLoadError');
    h.error('networkError', 'manifestLoadTimeOut');
    assert.equal(h.calls.filter(call => call[0] === 'load').length, 3);
    h.error();
    assert.deepEqual(h.calls.at(-1), ['stop']);
});

for (const fullscreen of [true, false]) {
    test('replacing a player cleans its DOM and preserves web fullscreen: ' + fullscreen, () => {
        const events = [];
        let movedToBody = fullscreen;
        const old = {
            get fullscreenWeb() { return movedToBody; },
            set fullscreenWeb(value) { movedToBody = value; events.push('exit-fullscreen'); },
            destroy() {
                assert.equal(movedToBody, false, 'The old player must be back in its container before destroy');
                events.push('destroy');
            }
        };
        class Player {
            constructor(options) { this.options = options; this.fullscreenWeb = false; }
            on() { return this; }
        }
        const context = vm.createContext({
            art: old, currentHls: { destroy: () => events.push('hls-destroy') },
            lastPlaybackError: '', adFilteringEnabled: false, currentVideoTitle: '测试',
            currentEpisodeIndex: 1, currentEpisodes: ['one', 'two', 'three'],
            document: { getElementById: () => ({ style: {} }) },
            navigator: { language: 'zh-cn' }, Hls: { DefaultConfig: { loader() {} } },
            Artplayer: Player, getPlaybackType: () => 'm3u8',
            setupLongPressSpeedControl() {}, setTimeout() {}, clearTimeout() {}
        });
        vm.runInContext(source.slice(start, end), context);
        context.initPlayer('https://fixture.invalid/next.m3u8');
        assert.notEqual(context.art, old);
        assert.equal(context.art.fullscreenWeb, fullscreen);
        assert.equal(context.currentHls, null);
        assert.equal(events.filter(event => event === 'destroy').length, 1);
        if (fullscreen) assert.ok(events.indexOf('exit-fullscreen') < events.indexOf('destroy'));
    });
}
