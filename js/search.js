// Match titles locally: some providers search descriptions as well.
function normalizeSearchTitle(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}
function searchTitleScore(title, query) {
    const name = normalizeSearchTitle(title);
    const keyword = normalizeSearchTitle(query);
    if (!keyword || !name.includes(keyword)) return 0;
    if (name === keyword) return 3;
    return name.startsWith(keyword) ? 2 : 1;
}
// Keep recent successful searches across navigation within this app window.
const searchResultCache = new Map();
const searchCacheStorageKey = 'libretvSearchCacheV1';
try {
    const stored = JSON.parse(sessionStorage.getItem(searchCacheStorageKey) || '[]');
    if (Array.isArray(stored)) for (const [key, entry] of stored.slice(-10)) {
        if (entry?.expires > Date.now() && Array.isArray(entry.results)) searchResultCache.set(key, entry);
    }
} catch { /* Storage may be disabled or full; live search still works. */ }
async function searchByAPIAndKeyWord(apiId, query, options = {}) {
    if (options.signal?.aborted) return [];
    const customApi = apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', '')) : null;
    const source = apiId.startsWith('custom_') ? customApi : API_SITES[apiId];
    if (!source) return [];
    const apiBaseUrl = customApi ? source.url : source.api;
    const cacheKey = JSON.stringify([apiId, apiBaseUrl, query.trim().toLowerCase(), source.searchAction || 'videolist']);
    const cached = searchResultCache.get(cacheKey);
    if (cached?.expires > Date.now()) {
        if (cached.results.length) options.onResults?.(cached.results);
        return cached.results.slice();
    }
    const controller = new AbortController();
    // One deadline covers headers, bodies and pagination; always clean up the timer.
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const results = [];
    let pageFailed = false;

    async function fetchPage(page) {
        const apiUrl = page === 1
            ? apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query)
            : apiBaseUrl + API_CONFIG.search.pagePath.replace('{query}', encodeURIComponent(query)).replace('{page}', page);
        const requestUrl = new URL(apiUrl);
        if (source.searchAction === 'list') requestUrl.searchParams.set('ac', 'list');
        const proxyUrl = PROXY_URL + encodeURIComponent(requestUrl.href);
        const proxiedUrl = window.ProxyAuth?.addAuthToProxyUrl
            ? await window.ProxyAuth.addAuthToProxyUrl(proxyUrl) : proxyUrl;
        const response = await fetch(proxiedUrl, { headers: API_CONFIG.search.headers, signal });
        if (!response.ok) throw new Error('Search HTTP ' + response.status);
        return await response.json();
    }

    function publishPage(data) {
        if (signal.aborted || !Array.isArray(data?.list)) return;
        const matches = data.list.filter(item => searchTitleScore(item.vod_name, query) > 0).map(item => ({
            ...item,
            source_name: source.name,
            source_code: apiId,
            api_url: customApi ? apiBaseUrl : undefined
        }));
        results.push(...matches);
        if (matches.length) options.onResults?.(matches);
    }

    try {
        const firstPage = await fetchPage(1);
        if (!Array.isArray(firstPage?.list) || signal.aborted) return [];
        publishPage(firstPage);
        const matchingFirstPage = firstPage.list.filter(item => searchTitleScore(item.vod_name, query) > 0).length;
        const pageLimit = matchingFirstPage < firstPage.list.length ? 3 : API_CONFIG.search.maxPages;
        const lastPage = Math.max(1, Math.min(Number(firstPage.pagecount) || 1, pageLimit));
        let nextPage = 2;
        // Bound pagination fan-out without discarding later matching pages.
        async function fetchRemainingPages() {
            while (!signal.aborted && nextPage <= lastPage) {
                const page = nextPage++;
                try {
                    publishPage(await fetchPage(page));
                } catch (error) {
                    pageFailed = true;
                    if (!signal.aborted) console.warn('API', apiId, 'page', page, 'search failed:', error);
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(4, lastPage - 1) }, fetchRemainingPages));
    } catch (error) {
        if (!signal.aborted) console.warn('API', apiId, 'search failed:', error);
    } finally {
        clearTimeout(timeoutId);
    }
    if (!signal.aborted && !pageFailed && results.length > 0 && results.length <= 500) {
        searchResultCache.delete(cacheKey);
        searchResultCache.set(cacheKey, { expires: Date.now() + 120000, results: results.slice() });
        while (searchResultCache.size > 10) searchResultCache.delete(searchResultCache.keys().next().value);
        try { sessionStorage.setItem(searchCacheStorageKey, JSON.stringify([...searchResultCache])); } catch {}
    }
    return results;
}
