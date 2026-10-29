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
const searchCacheStorageKey = 'libretvSearchCacheV2';
try {
    const stored = JSON.parse(sessionStorage.getItem(searchCacheStorageKey) || '[]');
    if (Array.isArray(stored)) for (const [key, entry] of stored.slice(-10)) {
        if (entry?.expires > Date.now() && Array.isArray(entry.results) && Array.isArray(entry.pagination?.remainingPages)) {
            searchResultCache.set(key, entry);
        }
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
    if (!options.pagination && cached?.expires > Date.now() && (!options.allPages || !cached.pagination.remainingPages.length)) {
        if (cached.results.length) options.onResults?.(cached.results);
        options.onPagination?.({ ...cached.pagination, remainingPages: cached.pagination.remainingPages.slice() });
        return cached.results.slice();
    }
    const controller = new AbortController();
    // One deadline covers headers, bodies and pagination; always clean up the timer.
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const results = [];
    let pageFailed = false;
    let totalPages = options.pagination?.totalPages || 0;
    const remainingPages = new Set(options.pagination?.remainingPages || []);

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
        if (!Array.isArray(data?.list)) throw new Error('Invalid search page');
        if (signal.aborted) return;
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
        let pagesToFetch;
        if (options.pagination) {
            pagesToFetch = [...remainingPages];
        } else {
            const firstPage = await fetchPage(1);
            publishPage(firstPage);
            if (signal.aborted) return [];
            totalPages = Math.max(1, Math.min(Math.floor(Number(firstPage.pagecount)) || 1, API_CONFIG.search.maxPages));
            for (let page = 2; page <= totalPages; page++) remainingPages.add(page);
            const matchingFirstPage = firstPage.list.filter(item => searchTitleScore(item.vod_name, query) > 0).length;
            const pageLimit = !options.allPages && matchingFirstPage < firstPage.list.length ? 3 : API_CONFIG.search.maxPages;
            pagesToFetch = [...remainingPages].filter(page => page <= pageLimit);
        }
        let nextIndex = 0;
        // Bound pagination fan-out without discarding later matching pages.
        async function fetchRemainingPages() {
            while (!signal.aborted && nextIndex < pagesToFetch.length) {
                const page = pagesToFetch[nextIndex++];
                try {
                    publishPage(await fetchPage(page));
                    if (!signal.aborted) remainingPages.delete(page);
                } catch (error) {
                    pageFailed = true;
                    if (!signal.aborted) console.warn('API', apiId, 'page', page, 'search failed:', error);
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(4, pagesToFetch.length) }, fetchRemainingPages));
    } catch (error) {
        if (!signal.aborted) console.warn('API', apiId, 'search failed:', error);
    } finally {
        clearTimeout(timeoutId);
        options.onPagination?.({ totalPages, remainingPages: [...remainingPages].sort((a, b) => a - b) });
    }
    const allResults = [...(options.previousResults || []), ...results];
    if (!signal.aborted && !pageFailed && totalPages && allResults.length <= 500) {
        searchResultCache.delete(cacheKey);
        searchResultCache.set(cacheKey, {
            expires: Date.now() + 120000,
            results: allResults,
            pagination: { totalPages, remainingPages: [...remainingPages].sort((a, b) => a - b) }
        });
        while (searchResultCache.size > 10) searchResultCache.delete(searchResultCache.keys().next().value);
        try { sessionStorage.setItem(searchCacheStorageKey, JSON.stringify([...searchResultCache])); } catch {}
    }
    return results;
}
