import assert from 'node:assert/strict';
import { test } from 'node:test';
import catalog from '../remake/catalog.cjs';

test('catalog excludes embedded-player webpages and keeps actual episode order', () => {
  const result = catalog.episodes({
    vod_play_from: 'liangzi$$$lzm3u8',
    vod_play_url: '第1集$https://example.invalid/share/one#第2集$https://example.invalid/share/two$$$第1集$https://example.invalid/1/index.m3u8?token=abc#第2集$https://example.invalid/2/index.m3u8'
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'lzm3u8');
  assert.deepEqual(result[0].episodes.map(episode => episode.title), ['第1集', '第2集']);
  assert.match(result[0].episodes[0].url, /token=abc$/);
});

test('catalog retains supported direct media and drops invalid or page-only lines', () => {
  const result = catalog.episodes({ vod_play_from: 'web$$$video', vod_play_url: '页面$https://example.invalid/watch.html$$$电影$https://example.invalid/a.mp4#预告$https://example.invalid/a.webm#无效$javascript:alert(1)' });
  assert.equal(result.length, 1);
  assert.equal(result[0].episodes.length, 2);
});
