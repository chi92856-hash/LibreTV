import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/player.js', import.meta.url), 'utf8');
const start = source.indexOf('function createNextEpisodeControl()');
const end = source.indexOf('// 自定义M3U8 Loader', start);

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
