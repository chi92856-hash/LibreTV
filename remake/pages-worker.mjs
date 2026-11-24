import catalog from './catalog.cjs';

const { sources, normalize, episodes, query, recommendations } = catalog;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function passwordHash(password) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function handleApi(request, env) {
  if (request.method !== 'GET') return json({ error: '请求不受支持' }, 405);
  const requestUrl = new URL(request.url);
  const credential = request.headers.get('X-LibreTV-Auth') || (requestUrl.pathname === '/api/recommend-cover' ? requestUrl.searchParams.get('auth') : null);
  if (env.PASSWORD && credential !== await passwordHash(env.PASSWORD)) {
    return json({ error: '请输入网站访问密码' }, 401);
  }
  const url = new URL(request.url);
  const source = url.searchParams.get('source');
  // Hosted requests use fixed upstreams; local custom APIs stay on the local server.
  if (source?.startsWith('custom-')) return json({ error: '电视网页版暂不支持自定义 API，请选择内置片源。' }, 400);
  try {
    if (url.pathname === '/api/auth') return json({ ok: true });
    if (url.pathname === '/api/search') {
      const term = url.searchParams.get('q')?.trim();
      if (!term || term.length > 80) return json({ error: '请输入 1 到 80 个字符的片名' }, 400);
      if (source && !Object.hasOwn(sources, source)) return json({ error: '未知片源' }, 400);
      const keys = source ? [source] : Object.keys(sources);
      const results = await Promise.allSettled(keys.map(async key => {
        const list = await query(sources[key].url, { wd: term });
        return list.map(item => normalize(item, key));
      }));
      if (results.every(result => result.status === 'rejected')) {
        const errors = results.map((result, index) => {
          const message = result.reason?.message || '';
          const safe = /^片源返回 HTTP \d{3}$|^片源未返回有效 JSON$|^片源返回格式不符$/.test(message) ? message :
            ['TimeoutError', 'AbortError'].includes(result.reason?.name) ? '请求超时' : '云端请求失败';
          return `${sources[keys[index]].name}：${safe}`;
        });
        return json({ error: `片源连接失败（${errors.join('；')}）` }, 502);
      }
      return json({ items: results.flatMap(result => result.value || []), partial: results.some(result => result.status === 'rejected') });
    }
    if (url.pathname === '/api/detail') {
      const id = url.searchParams.get('id');
      if (!Object.hasOwn(sources, source) || !/^\d{1,16}$/.test(id || '')) return json({ error: '影片标识无效' }, 400);
      const [item] = await query(sources[source].url, { ids: id });
      if (!item) return json({ error: '片源中找不到这部影片' }, 404);
      return json({ ...normalize(item, source), lines: episodes(item) });
    }
    if (url.pathname === '/api/recommendations') {
      const kind = url.searchParams.get('kind') || 'all';
      const tag = url.searchParams.get('tag')?.trim() || '热门';
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!['all', 'movie', 'series'].includes(kind) || tag.length > 16 || !Number.isInteger(offset) || offset < 0 || offset > 5000) return json({ error: '推荐条件无效' }, 400);
      const result = await recommendations(kind, tag, offset);
      if (env.PASSWORD) for (const item of result.items) if (item.poster) item.poster += `&auth=${encodeURIComponent(credential)}`;
      return json(result);
    }
    if (url.pathname === '/api/recommend-cover') {
      const cover = new URL(url.searchParams.get('url') || 'https://invalid/');
      if (cover.protocol !== 'https:' || cover.port || cover.username || cover.password || !/^img\d+\.doubanio\.com$/.test(cover.hostname)) return json({ error: '封面地址无效' }, 400);
      const image = await fetch(cover, { headers: { Referer: 'https://movie.douban.com/' }, redirect: 'manual', signal: AbortSignal.timeout(7000) });
      const type = image.headers.get('Content-Type') || '';
      if (!image.ok || !image.body || !/^image\/(jpeg|png|webp|avif)(?:;|$)/i.test(type)) return json({ error: '封面暂不可用' }, 502);
      return new Response(image.body, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' } });
    }
    return json({ error: '接口不存在' }, 404);
  } catch {
    return json({ error: '暂时无法获取内容，请重试' }, 502);
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const response = path.startsWith('/api/') ? await handleApi(request, env) : await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' https: http:; connect-src 'self' https: http:; media-src 'self' blob: https: http:; worker-src 'self' blob:; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (!path.startsWith('/api/')) headers.set('Cache-Control', /\.(jpg|png|webp)$/.test(path) ? 'public, max-age=86400' : 'no-cache, must-revalidate');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
