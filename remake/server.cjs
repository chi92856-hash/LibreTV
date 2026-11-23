const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const { sources, mediaUrl, normalize, episodes, query, recommendations } = require('./catalog.cjs');
const assets = path.join(__dirname, 'web');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };

function json(response, code, data) {
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
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
