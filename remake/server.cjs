const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const sources = {
  lizi: { name: '量子资源', url: 'https://cj.lziapi.com/api.php/provide/vod/' },
  baofeng: { name: '暴风资源', url: 'https://bfzyapi.com/api.php/provide/vod/' }
};
const assets = path.join(__dirname, 'web');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };

function mediaUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function normalize(item, source, provider = sources[source].name) {
  return {
    id: String(item.vod_id),
    title: String(item.vod_name || '未命名影片'),
    poster: mediaUrl(item.vod_pic),
    year: String(item.vod_year || ''),
    genre: String(item.type_name || ''),
    note: String(item.vod_remarks || ''),
    source,
    provider
  };
}

function episodes(item) {
  const labels = String(item.vod_play_from || '').split('$$$');
  return String(item.vod_play_url || '').split('$$$').flatMap((line, index) => {
    const list = line.split('#').flatMap((entry, i) => {
      const separator = entry.indexOf('$');
      const url = mediaUrl(separator < 0 ? entry : entry.slice(separator + 1));
      return url ? [{ title: separator < 0 ? `第 ${i + 1} 集` : entry.slice(0, separator), url }] : [];
    });
    return list.length ? [{ name: labels[index] || `线路 ${index + 1}`, episodes: list }] : [];
  });
}

async function query(endpoint, params) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries({ ac: 'detail', ...params })) url.searchParams.set(key, value);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8500) });
  if (!response.ok) throw new Error('片源暂不可用');
  const data = await response.json();
  if (!Array.isArray(data.list)) throw new Error('片源返回格式不符');
  return data.list;
}

function json(response, code, data) {
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function recommendations(kind, tag, offset) {
  const types = kind === 'all' ? ['movie', 'tv'] : [kind === 'series' ? 'tv' : 'movie'];
  const limit = types.length === 2 ? 3 : 6;
  const results = await Promise.allSettled(types.map(async type => {
    const endpoint = new URL('https://movie.douban.com/j/search_subjects');
    endpoint.search = new URLSearchParams({ type, tag, sort: 'recommend', page_limit: limit, page_start: offset });
    const response = await fetch(endpoint, {
      headers: { Referer: 'https://movie.douban.com/', 'User-Agent': 'Mozilla/5.0' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('推荐暂不可用');
    const { subjects } = await response.json();
    if (!Array.isArray(subjects)) throw new Error('推荐数据格式错误');
    return subjects.slice(0, limit).flatMap(item => {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (!title) return [];
      const cover = mediaUrl(item.cover);
      return [{
        title,
        poster: cover ? `/api/recommend-cover?url=${encodeURIComponent(cover)}` : null,
        kind: type === 'tv' ? 'series' : 'movie',
        genre: tag === '热门' ? '' : tag,
        provider: typeof item.rate === 'string' && item.rate ? `豆瓣 ${item.rate}` : '豆瓣推荐'
      }];
    });
  }));
  if (results.every(result => result.status === 'rejected')) throw new Error('推荐源暂不可用');
  return {
    items: results.flatMap(result => result.value || []),
    nextOffset: results.some(result => result.value?.length === limit) ? offset + limit : null
  };
}

function startServer(port = 8900) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' http: https:; connect-src 'self' http: https:; media-src 'self' blob: http: https:; worker-src 'self' blob:; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (request.method !== 'GET' || request.headers.host !== new URL(origin).host) return json(response, 403, { error: '请求不受支持' });
      try {
        const url = new URL(request.url, origin);
        if (url.pathname === '/api/recommendations') {
          const kind = url.searchParams.get('kind') || 'all';
          const tag = url.searchParams.get('tag')?.trim() || '热门';
          const offset = Number(url.searchParams.get('offset') || 0);
          if (!['all', 'movie', 'series'].includes(kind) || tag.length > 16 || !Number.isInteger(offset) || offset < 0 || offset > 5000) {
            return json(response, 400, { error: '推荐条件无效' });
          }
          return json(response, 200, await recommendations(kind, tag, offset));
        }
        if (url.pathname === '/api/recommend-cover') {
          const value = mediaUrl(url.searchParams.get('url'));
          const cover = value && new URL(value);
          if (!cover || cover.protocol !== 'https:' || cover.port || !/^img\d+\.doubanio\.com$/.test(cover.hostname)) {
            return json(response, 400, { error: '封面地址无效' });
          }
          const image = await fetch(cover, { headers: { Referer: 'https://movie.douban.com/' }, redirect: 'error', signal: AbortSignal.timeout(7000) });
          const contentType = image.headers.get('Content-Type');
          if (!image.ok || !image.body || !/^image\/(jpeg|png|webp|avif)(?:;|$)/i.test(contentType || '')) {
            return json(response, 502, { error: '封面暂不可用' });
          }
          response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' });
          await pipeline(Readable.fromWeb(image.body), response);
          return;
        }
        const source = url.searchParams.get('source');
        let customEndpoint;
        if (url.pathname.startsWith('/api/') && source?.startsWith('custom-')) {
          // Only the local application may use an endpoint supplied by its user.
          if (request.headers['sec-fetch-site'] !== 'same-origin' || !/^custom-[a-z0-9-]{1,64}$/.test(source)) {
            return json(response, 403, { error: '自定义片源仅可在本机页面中使用' });
          }
          const endpoint = request.headers['x-libretv-endpoint'];
          customEndpoint = typeof endpoint === 'string' && endpoint.length <= 2048 ? mediaUrl(endpoint) : null;
          if (!customEndpoint) return json(response, 400, { error: '自定义 API 地址无效' });
        }
        if (url.pathname === '/api/search') {
          const term = url.searchParams.get('q')?.trim();
          if (!term || term.length > 80) return json(response, 400, { error: '请输入 1 到 80 个字符的片名' });
          if (source && !customEndpoint && !Object.hasOwn(sources, source)) return json(response, 400, { error: '未知片源' });
          const keys = source ? [source] : Object.keys(sources);
          const results = await Promise.allSettled(keys.map(async key => {
            const list = await query(customEndpoint || sources[key].url, { wd: term });
            return list.map(item => normalize(item, key, customEndpoint ? '自定义片源' : sources[key].name));
          }));
          if (results.every(result => result.status === 'rejected')) return json(response, 502, { error: '片源连接失败，请稍后重试' });
          return json(response, 200, { items: results.flatMap(result => result.value || []), partial: results.some(result => result.status === 'rejected') });
        }
        if (url.pathname === '/api/detail') {
          const id = url.searchParams.get('id');
          if ((!customEndpoint && !Object.hasOwn(sources, source)) || !/^\d{1,16}$/.test(id || '')) return json(response, 400, { error: '影片标识无效' });
          const [item] = await query(customEndpoint || sources[source].url, { ids: id });
          if (!item) return json(response, 404, { error: '片源中找不到这部影片' });
          return json(response, 200, { ...normalize(item, source, customEndpoint ? '自定义片源' : sources[source].name), lines: episodes(item) });
        }
        const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (!/^(?:index\.html|style\.css|app\.js|hls\.min\.js|media\/[a-z-]+\.jpg)$/.test(filename)) return json(response, 404, { error: '页面不存在' });
        const content = await readFile(path.join(assets, filename));
        response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] });
        response.end(content);
      } catch {
        if (!response.headersSent) json(response, 502, { error: '暂时无法获取内容，请重试' });
        else response.destroy();
      }
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startServer };
if (require.main === module) {
  startServer().then(() => console.log('LibreTV 新版  http://127.0.0.1:8900')).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
