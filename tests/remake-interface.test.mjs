import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../remake/web/app.js', import.meta.url), 'utf8');
test('continue watching uses recent real history and never invents duration', () => {
  function element(tag) {
    return { tag, children: [], append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; }, addEventListener() {}, setAttribute() {} };
  }
  const section = {}, list = element('div');
  const history = new Map([
    ['old', { title: 'old', position: 50, time: 1 }],
    ['first', { title: '<literal title>', position: 75, duration: 200, time: 4 }],
    ['second', { title: 'second', position: 100, time: 3 }],
    ['empty', { title: 'not started', position: 0, time: 5 }]
  ]);
  const context = vm.createContext({ history, document: { createElement: element },
    $: selector => selector === '#continue-watching' ? section : list, draw() {}, openSaved() {} });
  vm.runInContext(source.slice(source.indexOf('function renderContinueWatching()'), source.indexOf('function openSaved(')), context);
  context.renderContinueWatching();
  assert.equal(section.hidden, false);
  assert.equal(list.children.length, 2);
  const [first, second] = list.children.map(button => button.children[0]);
  assert.equal(first.children[0].textContent, '<literal title>');
  assert.equal(first.children[2].value, 75);
  assert.equal(first.children[2].max, 200);
  assert.equal(second.children.length, 2, 'Unknown duration must not show a guessed progress bar');
  history.clear();
  context.renderContinueWatching();
  assert.equal(section.hidden, true);
  assert.equal(list.children.length, 0);
});

test('capsule converges, stops scheduling frames, and respects reduced motion', () => {
  for (const reduced of [false, true]) {
    const queue = [], handlers = {};
    const capsule = { style: {}, setAttribute() {} };
    const button = { offsetLeft: 12, offsetTop: 24, offsetWidth: 150, offsetHeight: 46 };
    const group = { append() {}, querySelector: () => button,
      addEventListener: (name, fn) => { handlers[name] = fn; } };
    const context = vm.createContext({ document: { createElement: () => capsule },
      motion: { matches: !reduced, addEventListener() {} }, pointer: { matches: true },
      requestAnimationFrame: fn => { queue.push(fn); return queue.length; },
      MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} } });
    vm.runInContext(source.slice(source.indexOf('function setupCapsule('), source.indexOf("document.querySelectorAll('.navigation, .filters')")), context);
    context.setupCapsule(group);
    let frames = 0;
    while (queue.length && frames < 200) queue.shift()(++frames * 16.67);
    assert.equal(queue.length, 0);
    button.offsetTop = 136;
    handlers.pointerleave();
    frames = 0;
    while (queue.length && frames < 200) queue.shift()(++frames * 16.67);
    assert.equal(queue.length, 0, 'Animation must stop after settling');
    assert.ok(frames < 100);
    if (reduced) assert.equal(frames, 1);
    assert.match(capsule.style.transform, /translate\(12px,13[56]/);
  }
});
