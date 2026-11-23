const sources = {
  lizi: { name: '量子资源', url: 'https://cj.lziapi.com/api.php/provide/vod/' },
  baofeng: { name: '暴风资源', url: 'https://bfzyapi.com/api.php/provide/vod/' }
};
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


module.exports = { sources, mediaUrl, normalize, episodes, query, recommendations };
