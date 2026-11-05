const icons = {
  brand: '<path d="M4 6h12v12H4z"/><path d="m9 9 5 3-5 3z" fill="currentColor"/><path d="M19 8v8"/>',
  compass: '<circle cx="12" cy="12" r="8"/><path d="m15 9-2 4-4 2 2-4z"/>',
  history: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  bookmark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  sliders: '<path d="M4 8h16M4 16h16M9 5v6m6 2v6"/>',
  minus: '<path d="M6 12h12"/>', square: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  restore: '<rect x="5" y="9" width="10" height="10" rx="1"/><path d="M9 5h10v10"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>', play: '<path d="m8 5 11 7-11 7z" fill="currentColor"/>',
  pause: '<path d="M9 5v14m6-14v14"/>', left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  refresh: '<path d="M19 10a7 7 0 0 0-12-3L5 9m0-4v4h4m-4 5a7 7 0 0 0 12 3l2-2m0 4v-4h-4"/>'
};
const $ = selector => document.querySelector(selector);
function draw(element, name) {
  element.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
}
document.querySelectorAll('[data-icon]').forEach(element => draw(element, element.dataset.icon));

const picks = [
  ['interstellar', '星际穿越', '2014', '科幻 / 冒险', 'movie', '穿越虫洞，寻找人类的新家园。'],
  ['dune', '沙丘2', '2024', '科幻 / 冒险', 'movie', '保罗与弗雷曼人并肩走进厄拉克斯的沙漠。'],
  ['blade', '银翼杀手2049', '2017', '科幻 / 悬疑', 'movie', '一名银翼杀手踏上追查旧日秘密的旅程。'],
  ['severance', '人生切割术', '2022', '剧情 / 悬疑', 'series', '工作与生活的记忆被切开，直到两端开始交汇。'],
  ['arcane', '英雄联盟：双城之战', '2021', '动画 / 奇幻', 'series', '姐妹两人在双城的冲突中走向不同道路。'],
  ['last', '最后生还者', '2023', '剧情 / 冒险', 'series', '乔尔护送艾莉穿过疫情后的美国。']
].map(([id, title, year, genre, kind, note]) => ({ id, title, year, genre, kind, note, poster: `/media/${id}.jpg` }));
const shelfPicks = [...picks, ...[
  ['inception', '盗梦空间', '2010', '科幻 / 悬疑', 'movie'],
  ['matrix', '黑客帝国', '1999', '科幻 / 动作', 'movie'],
  ['arrival', '降临', '2016', '科幻 / 剧情', 'movie'],
  ['breaking-bad', '绝命毒师', '2008', '剧情 / 犯罪', 'series'],
  ['dark', '暗黑', '2017', '科幻 / 悬疑', 'series'],
  ['better-call-saul', '风骚律师', '2015', '剧情 / 犯罪', 'series']
].map(([id, title, year, genre, kind]) => ({ id, title, year, genre, kind, poster: `/media/${id}.jpg` }))];
function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(`libretv-remake:${key}`)) ?? fallback; }
  catch { return fallback; }
}
function write(key, value) {
  localStorage.setItem(`libretv-remake:${key}`, JSON.stringify(value));
}
const library = new Map(read('library', []));
const history = new Map(read('history', []));
const settings = { source: '', autoNext: false, ...read('settings', {}) };
const customSources = read('sources', []);
const customTags = read('tags', []);
const presetTags = [...new Set(shelfPicks.flatMap(item => item.genre.split(' / ')))].map(name => ({ id: `preset-${name}`, name }));
const findTag = id => customTags.find(tag => tag.id === id) || presetTags.find(tag => tag.id === id);
const motion = matchMedia('(prefers-reduced-motion: no-preference)');
const pointer = matchMedia('(hover: hover) and (pointer: fine)');
const video = $('#video');
const searchDialog = $('#search');
const settingsDialog = $('#settings');
const tagDialog = $('#tag-dialog');
const searchInput = $('#search-form input');
let view = 'discover';
let previousView = 'discover';
let kind = 'all';
let recommendationRequest;
let liveBatch;
const recommendationOffsets = new Map();
const seenRecommendations = new Set();
let featureIndex = 0;
let rotationPaused = !motion.matches;
let rotation;
let toastTimer;
let searchRequest;
let playback;
let hls;
let lastSave = 0;

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2000);
}
function titleMeta(item) {
  return [item.year, item.genre, item.provider].filter(Boolean).join(' · ');
}
function trackPoster(surface, area, maxX, maxY) {
  area.addEventListener('pointermove', event => {
    if (!motion.matches || !pointer.matches || event.pointerType !== 'mouse') return;
    const bounds = area.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    surface.style.setProperty('--rx', `${(0.5 - y) * maxX}deg`);
    surface.style.setProperty('--ry', `${(x - 0.5) * maxY}deg`);
    surface.style.setProperty('--gx', `${x * 100}%`);
    surface.style.setProperty('--gy', `${y * 100}%`);
    surface.classList.add('tracking');
  });
  area.addEventListener('pointerleave', () => surface.classList.remove('tracking'));
}
function card(item, open, meta = titleMeta(item)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'poster';
  const cover = document.createElement('span');
  cover.className = 'poster-image';
  if (item.poster) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = item.poster;
    image.addEventListener('error', () => image.remove(), { once: true });
    cover.append(image);
  }
  const title = document.createElement('strong');
  title.textContent = item.title;
  const caption = document.createElement('small');
  caption.textContent = meta;
  button.append(cover, title, caption);
  button.addEventListener('click', open);
  trackPoster(button, button, 9, 12);
  return button;
}
function renderCatalog() {
  const tag = findTag(kind);
  const items = liveBatch || shelfPicks.filter(item => tag
    ? `${item.title} ${item.genre} ${item.year}`.toLowerCase().includes(tag.name.toLowerCase())
    : kind === 'all' || item.kind === kind);
  $('#catalog-empty').hidden = !tag || items.length > 0;
  const next = $('#shuffle-shelf');
  next.disabled = Boolean(recommendationRequest) || recommendationOffsets.get(recommendationKey()) === null;
  next.title = recommendationOffsets.get(recommendationKey()) === null ? '当前分类没有更多推荐' : '获取新一批推荐影片';
  const visible = items.slice(0, liveBatch || kind === 'all' ? 6 : 3);
  for (const item of visible) seenRecommendations.add(recommendationTitle(item.title));
  $('#catalog').replaceChildren(...visible.map(item => card(item, () => openSearch(item.title))));
  if (motion.matches) $('#catalog').animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
}
function recommendationTitle(title) {
  return title.normalize('NFKC').trim().toLowerCase();
}
function recommendationKey() {
  return findTag(kind)?.name || kind;
}
function resetRecommendations() {
  recommendationRequest?.abort();
  recommendationRequest = undefined;
  liveBatch = undefined;
  $('#recommend-status').hidden = true;
}
async function refreshRecommendations() {
  if (recommendationRequest) return;
  const key = recommendationKey();
  let offset = recommendationOffsets.has(key) ? recommendationOffsets.get(key) : 0;
  if (offset === null) return;
  const request = new AbortController();
  recommendationRequest = request;
  const button = $('#shuffle-shelf');
  const status = $('#recommend-status');
  button.disabled = true;
  status.hidden = false;
  status.textContent = '正在获取新推荐…';
  const tag = findTag(kind);
  try {
    for (let page = 0; page < 3 && offset !== null; page++) {
      const params = new URLSearchParams({ kind: tag ? 'all' : kind, tag: tag?.name || '热门', offset });
      const data = await get(`/api/recommendations?${params}`, request.signal);
      if (request.signal.aborted) return;
      offset = data.nextOffset;
      recommendationOffsets.set(key, offset);
      const fresh = [];
      for (const item of data.items) {
        const title = recommendationTitle(item.title);
        if (seenRecommendations.has(title) || fresh.some(entry => recommendationTitle(entry.title) === title)) continue;
        fresh.push(item);
      }
      if (fresh.length) {
        liveBatch = fresh;
        status.hidden = true;
        return;
      }
    }
    status.textContent = offset === null ? '这个分类暂无更多新推荐。' : '刚才几批都已看过，可以再换一批。';
  } catch {
    if (!request.signal.aborted) status.textContent = '推荐暂时加载失败，点「换一批」重试。';
  } finally {
    if (recommendationRequest === request) {
      recommendationRequest = undefined;
      renderCatalog();
    }
  }
}
function showFeature(index) {
  featureIndex = (index + picks.length) % picks.length;
  const item = picks[featureIndex];
  const art = $('.feature-art');
  const image = document.createElement('img');
  image.alt = '';
  image.src = item.id === 'interstellar' ? '/media/interstellar-wide.jpg' : item.poster;
  art.replaceChildren(image);
  $('#feature-title').textContent = item.title;
  $('#feature-meta').textContent = titleMeta(item);
  $('#feature-note').textContent = item.note;
  $('#feature-count').textContent = `${featureIndex + 1} / ${picks.length}`;
  if (motion.matches) image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
}
function updateRotation() {
  clearInterval(rotation);
  const button = $('#feature-pause');
  button.setAttribute('aria-label', rotationPaused ? '继续轮播' : '暂停轮播');
  draw(button.firstElementChild, rotationPaused ? 'play' : 'pause');
  if (!rotationPaused) rotation = setInterval(() => {
    if (view === 'discover' && !document.hidden && !document.querySelector('dialog[open]') && !$('.feature').matches(':hover, :focus-within')) showFeature(featureIndex + 1);
  }, 6500);
}

function setView(next) {
  if (view === 'watch' && next !== 'watch') stopPlayback();
  view = next;
  $('#discover').hidden = next !== 'discover';
  $('#collection').hidden = !['history', 'library'].includes(next);
  $('#watch').hidden = next !== 'watch';
  document.querySelectorAll('.navigation [data-view]').forEach(button => {
    if (button.dataset.view === next) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (next === 'history' || next === 'library') renderCollection(next);
  window.scrollTo(0, 0);
}
function renderCollection(next) {
  const items = next === 'history' ? [...history.values()].sort((a, b) => b.time - a.time) : [...library.values()];
  $('#collection-title').textContent = next === 'history' ? '观看历史' : '我的片单';
  $('#collection-status').textContent = items.length ? `${items.length} 部影片` : next === 'history' ? '播放一部影片后，可以从这里接着看。' : '打开影片详情，即可加入片单。';
  $('#collection-items').replaceChildren(...items.map(item => card(item, () => openSaved(item), item.position ? `已观看 ${Math.floor(item.position / 60)} 分钟` : titleMeta(item))));
}
function openSaved(item) {
  if (item.direct) return openWatch(item, { resume: item.position || 0 });
  return openDetail(item, item);
}
async function get(path, signal, source) {
  const headers = source ? { 'X-LibreTV-Endpoint': source.endpoint } : undefined;
  const response = await fetch(path, { signal, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}
function openSearch(title = '') {
  if (!searchDialog.open) searchDialog.showModal();
  if (title) {
    searchInput.value = title;
    search(title);
  }
  searchInput.focus();
}
async function search(term) {
  term = term.trim();
  if (!term) return;
  searchRequest?.abort();
  const request = new AbortController();
  searchRequest = request;
  const status = $('#search-status');
  const results = $('#search-results');
  status.textContent = '正在查找片源…';
  results.replaceChildren();
  try {
    const keys = settings.source ? [settings.source] : ['', ...customSources.map(source => source.id)];
    const responses = await Promise.allSettled(keys.map(async key => {
      const source = customSources.find(item => item.id === key);
      const params = new URLSearchParams({ q: term, source: key });
      const data = await get(`/api/search?${params}`, request.signal, source);
      if (source) for (const item of data.items) item.provider = source.name;
      return data;
    }));
    if (request.signal.aborted) return;
    if (responses.every(result => result.status === 'rejected')) throw responses[0].reason;
    const data = {
      items: responses.flatMap(result => result.value?.items || []),
      partial: responses.some(result => result.status === 'rejected' || result.value.partial)
    };
    status.textContent = data.items.length ? `${data.items.length} 条结果${data.partial ? '，部分片源暂不可用' : ''}` : '没有找到影片，试试其他片名。';
    results.replaceChildren(...data.items.map(item => {
      const button = document.createElement('button');
      button.type = 'button';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const meta = document.createElement('small');
      meta.textContent = [item.year, item.provider].filter(Boolean).join(' · ');
      button.append(title, meta);
      button.addEventListener('click', () => openDetail(item));
      return button;
    }));
  } catch (error) {
    if (!request.signal.aborted) status.textContent = error.message;
  }
}
async function openDetail(item, resume = {}) {
  searchRequest?.abort();
  const request = new AbortController();
  searchRequest = request;
  if (searchDialog.open) $('#search-status').textContent = '正在读取播放线路…';
  else notify('正在读取播放线路…');
  try {
    const source = customSources.find(entry => entry.id === item.source);
    if (item.source.startsWith('custom-') && !source) throw new Error('此片源已移除，请重新搜索影片。');
    const params = new URLSearchParams({ id: item.id, source: item.source });
    const detail = await get(`/api/detail?${params}`, request.signal, source);
    if (source) detail.provider = source.name;
    if (!request.signal.aborted) openWatch(detail, resume);
  } catch (error) {
    if (request.signal.aborted) return;
    if (searchDialog.open) $('#search-status').textContent = error.message;
    else notify(error.message);
  }
}
function keyFor(item) {
  return `${item.source}:${item.id}`;
}
function snapshot(item) {
  return { id: item.id, source: item.source, title: item.title, year: item.year, genre: item.genre, poster: item.poster, provider: item.provider, ...(item.direct ? { direct: true, lines: item.lines } : {}) };
}
function saveProgress() {
  if (!playback?.started) return;
  const { item, line, episode } = playback;
  history.set(keyFor(item), { ...snapshot(item), line, episode, position: video.currentTime || 0, time: Date.now() });
  write('history', [...history].sort((a, b) => b[1].time - a[1].time).slice(0, 80));
}
function releaseMedia() {
  hls?.destroy();
  hls = null;
  video.pause();
  video.removeAttribute('src');
  video.load();
}
function stopPlayback() {
  saveProgress();
  playback = null;
  releaseMedia();
}
function openWatch(item, resume = {}) {
  if (view !== 'watch') previousView = view;
  stopPlayback();
  for (const dialog of [searchDialog, settingsDialog]) if (dialog.open) dialog.close();
  setView('watch');
  const line = item.lines[resume.line] ? resume.line : 0;
  const episode = item.lines[line]?.episodes[resume.episode] ? resume.episode : 0;
  playback = { item, line, episode, started: false };
  $('#watch-title').textContent = item.title;
  $('#watch-meta').textContent = titleMeta(item);
  video.poster = item.poster || '';
  syncSave();
  renderEpisodes();
  const position = line === resume.line && episode === resume.episode ? resume.position : resume.resume;
  if (item.lines.length) playEpisode(line, episode, position, false);
  else $('#play-status').textContent = '这个片源没有可用的播放线路。';
}
function choices(items, active, onClick) {
  return items.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.name || item.title;
    button.setAttribute('aria-pressed', String(index === active));
    button.addEventListener('click', () => onClick(index));
    return button;
  });
}
function renderEpisodes() {
  const { item, line, episode } = playback;
  const entries = item.lines[line]?.episodes || [];
  $('#lines').replaceChildren(...choices(item.lines, line, index => playEpisode(index, 0)));
  $('#episodes').replaceChildren(...choices(entries, episode, index => playEpisode(line, index)));
  $('#next').disabled = episode + 1 >= entries.length;
}
function playEpisode(line, episode, position = 0, autoplay = true) {
  const entry = playback?.item.lines[line]?.episodes[episode];
  if (!entry) return;
  saveProgress();
  playback.line = line;
  playback.episode = episode;
  playback.started = false;
  releaseMedia();
  renderEpisodes();
  const current = playback;
  const status = $('#play-status');
  status.textContent = '正在加载视频…';
  video.onloadedmetadata = () => {
    if (current !== playback) return;
    if (position > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position, video.duration);
    status.textContent = entry.title;
    if (autoplay) video.play().catch(() => { status.textContent = '点击播放器中的播放按钮继续。'; });
  };
  const isHls = /\.m3u8$/i.test(new URL(entry.url).pathname);
  if (isHls && !video.canPlayType('application/vnd.apple.mpegurl') && window.Hls?.isSupported()) {
    hls = new Hls();
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) status.textContent = '播放失败，请尝试切换线路。';
    });
    hls.loadSource(entry.url);
    hls.attachMedia(video);
  } else video.src = entry.url;
}
function syncSave() {
  const saved = library.has(keyFor(playback.item));
  $('#save').setAttribute('aria-pressed', String(saved));
  $('#save').lastElementChild.textContent = saved ? '已加入片单' : '加入片单';
}
$('#save').addEventListener('click', () => {
  const item = playback.item;
  const key = keyFor(item);
  if (library.has(key)) library.delete(key);
  else library.set(key, snapshot(item));
  write('library', [...library]);
  syncSave();
});
function nextEpisode() {
  if (playback) playEpisode(playback.line, playback.episode + 1);
}
$('#next').addEventListener('click', nextEpisode);
$('#back').addEventListener('click', () => setView(previousView));
video.addEventListener('playing', () => { if (playback) { playback.started = true; saveProgress(); } });
video.addEventListener('timeupdate', () => {
  if (Date.now() - lastSave > 4000) { lastSave = Date.now(); saveProgress(); }
});
video.addEventListener('pause', saveProgress);
video.addEventListener('error', () => { if (playback) $('#play-status').textContent = '播放失败，请尝试切换线路。'; });
video.addEventListener('ended', () => { if (settings.autoNext) nextEpisode(); });
window.addEventListener('pagehide', saveProgress);

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('.shelf').addEventListener('click', event => {
  const button = event.target.closest('[data-kind]');
  if (!button) return;
  kind = findTag(button.dataset.kind) && kind === button.dataset.kind ? 'all' : button.dataset.kind;
  resetRecommendations();
  updateFilterSelection();
  renderCatalog();
});
$('#shuffle-shelf').addEventListener('click', refreshRecommendations);
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  showFeature(featureIndex + Number(button.dataset.step));
  updateRotation();
}));
$('#feature-pause').addEventListener('click', () => { rotationPaused = !rotationPaused; updateRotation(); });
$('#feature-search').addEventListener('click', () => openSearch(picks[featureIndex].title));
$('[data-dialog="search"]').addEventListener('click', () => openSearch());
$('[data-dialog="settings"]').addEventListener('click', () => settingsDialog.showModal());
document.querySelectorAll('[data-dismiss]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
searchDialog.addEventListener('close', () => searchRequest?.abort());
$('#search-form').addEventListener('submit', event => { event.preventDefault(); search(searchInput.value); });
const sourceSelect = $('#source');
const builtInSources = [...sourceSelect.options].map(option => option.value);
const apiForm = $('#api-form');
const tagForm = $('#tag-form');
let editingSource;
let editingTag;

function managedRow(name, edit, remove) {
  const row = document.createElement('div');
  const text = document.createElement('span');
  text.textContent = name;
  row.append(text);
  for (const [label, action] of [['编辑', edit], ['移除', remove]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'glass';
    button.textContent = label;
    button.setAttribute('aria-label', `${label}${name}`);
    button.addEventListener('click', action);
    row.append(button);
  }
  return row;
}
function resetEditor(form, label) {
  form.reset();
  form.querySelector('[type="submit"]').textContent = label;
}
function renderSources() {
  for (const option of [...sourceSelect.options]) if (!builtInSources.includes(option.value)) option.remove();
  for (const source of customSources) sourceSelect.add(new Option(source.name, source.id));
  if (![...sourceSelect.options].some(option => option.value === settings.source)) {
    settings.source = '';
    write('settings', settings);
  }
  sourceSelect.value = settings.source;
  $('#api-list').replaceChildren(...customSources.map(source => managedRow(source.name, () => {
    editingSource = source.id;
    apiForm.elements.name.value = source.name;
    apiForm.elements.endpoint.value = source.endpoint;
    apiForm.querySelector('[type="submit"]').textContent = '保存 API';
    apiForm.elements.name.focus();
  }, () => {
    customSources.splice(customSources.indexOf(source), 1);
    if (editingSource === source.id) {
      editingSource = undefined;
      resetEditor(apiForm, '添加 API');
    }
    write('sources', customSources);
    renderSources();
  })));
}
apiForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = apiForm.elements.name.value.trim();
  const endpoint = new URL(apiForm.elements.endpoint.value);
  const status = $('#api-status');
  if (!name || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
    status.textContent = '请输入片源名称及有效的 HTTP 或 HTTPS 采集地址。';
    return;
  }
  if (customSources.some(source => source.endpoint === endpoint.href && source.id !== editingSource)) {
    status.textContent = '这个 API 已经添加。';
    return;
  }
  const existing = customSources.find(source => source.id === editingSource);
  if (existing) Object.assign(existing, { name, endpoint: endpoint.href });
  else customSources.push({ id: 'custom-' + crypto.randomUUID(), name, endpoint: endpoint.href });
  write('sources', customSources);
  editingSource = undefined;
  resetEditor(apiForm, '添加 API');
  renderSources();
  status.textContent = '已保存，可在上方选择此片源。';
});
function updateFilterSelection() {
  document.querySelectorAll('.shelf [data-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kind === kind)));
}
function renderTags() {
  const rail = $('#shelf-tags');
  const tags = [...presetTags.filter(preset => !customTags.some(tag => tag.name === preset.name)), ...customTags];
  rail.replaceChildren();
  for (const tag of tags) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.kind = tag.id;
    button.className = 'glass';
    button.textContent = tag.name;
    rail.append(button);
  }
  if (![...document.querySelectorAll('.shelf [data-kind]')].some(button => button.dataset.kind === kind)) kind = 'all';
  resetRecommendations();
  updateFilterSelection();
  $('#tag-list').replaceChildren(...customTags.map(tag => managedRow(tag.name, () => {
    editingTag = tag.id;
    tagForm.elements.tag.value = tag.name;
    tagForm.querySelector('[type="submit"]').textContent = '保存标签';
    tagForm.elements.tag.focus();
  }, () => {
    customTags.splice(customTags.indexOf(tag), 1);
    if (editingTag === tag.id) {
      editingTag = undefined;
      resetEditor(tagForm, '添加标签');
    }
    write('tags', customTags);
    renderTags();
  })));
  renderCatalog();
}
tagForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = tagForm.elements.tag.value.trim();
  const status = $('#tag-status');
  const existing = customTags.find(tag => tag.id === editingTag);
  if (!name || ['全部', '电影', '剧集'].includes(name) || presetTags.some(tag => tag.name === name && existing?.name !== name) ||
      customTags.some(tag => tag.name.toLowerCase() === name.toLowerCase() && tag.id !== editingTag)) {
    status.textContent = '请输入一个未使用的标签名称。';
    return;
  }
  if (existing) existing.name = name;
  else customTags.push({ id: crypto.randomUUID(), name });
  write('tags', customTags);
  editingTag = undefined;
  resetEditor(tagForm, '添加标签');
  renderTags();
  status.textContent = '标签已保存。';
});
$('#manage-tags').addEventListener('click', () => tagDialog.showModal());
$('#search-tag').addEventListener('click', () => {
  const tag = findTag(kind);
  if (tag) openSearch(tag.name);
});
renderSources();
$('#autonext').checked = settings.autoNext;
settingsDialog.addEventListener('change', () => {
  settings.source = $('#source').value;
  settings.autoNext = $('#autonext').checked;
  write('settings', settings);
});
$('#direct-form').addEventListener('submit', event => {
  event.preventDefault();
  const url = new URL($('#direct').value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    $('#direct-status').textContent = '请输入有效的 HTTP 或 HTTPS 视频链接。';
    return;
  }
  const title = url.pathname.split('/').pop() || '直链视频';
  $('#direct-status').textContent = '';
  openWatch({ id: url.href, title, source: 'direct', direct: true, lines: [{ name: '直链', episodes: [{ title, url: url.href }] }] });
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !settingsDialog.open) { event.preventDefault(); openSearch(); }
});

if (window.libreWindow) {
  $('#window-controls').hidden = false;
  const maximize = $('[data-window="maximize"]');
  window.libreWindow.onState(maximized => {
    const label = maximized ? '还原窗口' : '最大化';
    maximize.title = label;
    maximize.setAttribute('aria-label', label);
    draw(maximize.firstElementChild, maximized ? 'restore' : 'square');
  });
  document.querySelectorAll('[data-window]').forEach(button => {
    button.addEventListener('click', event => { if (event.isTrusted) window.libreWindow[button.dataset.window](); });
    button.addEventListener('pointermove', event => {
      if (!motion.matches || event.pointerType !== 'mouse') return;
      const bounds = button.getBoundingClientRect();
      button.style.setProperty('--gx', `${event.clientX - bounds.left}px`);
      button.style.setProperty('--gy', `${event.clientY - bounds.top}px`);
    });
  });
}
showFeature(0);
trackPoster($('.feature'), $('.feature-slot'), 4, 5);
updateRotation();
renderTags();
