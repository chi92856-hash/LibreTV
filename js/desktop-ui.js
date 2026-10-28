/* Glass shell over the original LibreTV actions. No privileged renderer bridge. */
if (localStorage.getItem('doubanEnabled') === null) localStorage.setItem('doubanEnabled','true');
document.addEventListener('DOMContentLoaded',()=>{
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const icon=paths=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
 const icons={play:icon('<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>'),
  home:icon('<circle cx="12" cy="12" r="9"/><path d="m15 8-2 6-5 2 2-6z"/>'),
  movie:icon('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18m10-18v18M3 8h4m-4 8h4m10-8h4m-4 8h4"/>'),
  tv:icon('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 2 4 4 4-4"/>'),
  history:icon('<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'),
  settings:icon('<path d="m9 3-1 3-3 1-2 3 2 3 1 4 4 1 3 3 3-2 3-1 1-4 1-3-3-3-1-3-4-1z"/><circle cx="12" cy="12" r="3"/>'),
  sparkle:icon('<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>'),
  mystery:icon('<path d="M7 8a5 5 0 1 1 8 4c-2 1-3 2-3 4"/><path d="M12 21h.01"/>'),
  smile:icon('<circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 8h.01M16 8h.01"/>'),
  nature:icon('<path d="M20 3c-12-2-17 4-14 11 7 5 15 0 14-11zM4 21l12-12"/>')};
 const titlebar=document.createElement('div');titlebar.id='desktop-titlebar';titlebar.innerHTML='<i></i><span>LIBRETV</span>';document.body.prepend(titlebar);
 const isHome=!!document.getElementById('searchInput');
 document.body.classList.add(isHome?'dt-home':'dt-player');
 document.querySelectorAll('img').forEach(img=>{img.decoding='async';});
 const backdrop=document.createElement('div');backdrop.className='dt-panel-backdrop';backdrop.setAttribute('aria-hidden','true');document.body.append(backdrop);
 const panels=['settingsPanel','historyPanel'].map(id=>document.getElementById(id)).filter(Boolean);
 function syncPanels(){
  const open=panels.some(panel=>panel.classList.contains('show'));
  backdrop.classList.toggle('show',open);
  panels.forEach(panel=>{const shown=panel.classList.contains('show');panel.setAttribute('aria-hidden',String(!shown));panel.inert=!shown;});
 }
 panels.forEach(panel=>new MutationObserver(syncPanels).observe(panel,{attributes:true,attributeFilter:['class']}));
 backdrop.addEventListener('click',()=>panels.forEach(panel=>panel.classList.remove('show')));
 document.addEventListener('keydown',event=>{if(event.key==='Escape')panels.forEach(panel=>panel.classList.remove('show'));});
 syncPanels();
 if(!isHome)return;

 const sidebar=document.createElement('aside');sidebar.className='desktop-sidebar';sidebar.setAttribute('aria-label','主导航');
 sidebar.innerHTML=`<a class="dt-brand" href="/" aria-label="LibreTV 首页"><span>${icons.play}</span>LibreTV</a><nav><button class="dt-nav active" data-nav="home" aria-current="page">${icons.home}发现</button><button class="dt-nav" data-nav="movie">${icons.movie}电影</button><button class="dt-nav" data-nav="tv">${icons.tv}电视剧</button><button class="dt-nav" data-nav="history">${icons.history}观看历史</button></nav><div class="dt-side-bottom"><button class="dt-nav" data-nav="settings">${icons.settings}设置</button><div class="dt-local">LibreTV Desktop · Glass</div></div>`;
 document.body.prepend(sidebar);
 const header=document.querySelector('body>.container header');
 const searchArea=document.getElementById('searchArea');
 const searchInput=document.getElementById('searchInput');
 searchInput.placeholder='搜索电影、剧集或关键词';
 if(header){
  const heading=document.createElement('div');heading.innerHTML='<div class="dt-page-title">发现好故事</div><div class="dt-page-caption">随时入座，开启你的银幕时光。</div>';header.prepend(heading);header.append(searchArea);
 }
 const discovery=document.createElement('section');discovery.className='dt-discovery';discovery.setAttribute('aria-label','发现影片');
 discovery.innerHTML=`<div class="dt-hero"><div class="dt-hero-copy"><div class="dt-eyebrow">YOUR NEXT STORY STARTS HERE</div><h2>今晚，想看点什么？</h2><p>从一部电影出发，去往另一个世界。<br>把时间留给你喜欢的故事。</p><div class="dt-hero-actions"><button data-action="movies">${icons.play}探索电影</button><button data-action="history">${icons.history}观看历史</button></div></div><span class="dt-hero-note">LIGHTS OFF. STORIES ON.</span></div><div class="dt-genres"><button class="dt-genre" data-query="科幻"><span class="dt-genre-icon">${icons.sparkle}</span><span><strong>科幻</strong><small>探索想象边界</small></span></button><button class="dt-genre" data-query="悬疑" style="--genre-color:#a68dca;--genre-tint:#eee8fa"><span class="dt-genre-icon">${icons.mystery}</span><span><strong>悬疑</strong><small>发现故事另一面</small></span></button><button class="dt-genre" data-query="喜剧" style="--genre-color:#cf9d65;--genre-tint:#fbefdf"><span class="dt-genre-icon">${icons.smile}</span><span><strong>喜剧</strong><small>给生活一点轻松</small></span></button><button class="dt-genre" data-query="纪录片" style="--genre-color:#6da58c;--genre-tint:#e4f3eb"><span class="dt-genre-icon">${icons.nature}</span><span><strong>纪录片</strong><small>看见真实世界</small></span></button></div>`;
 header?.after(discovery);
 const status=document.createElement('div');status.className='dt-query-status';status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.innerHTML='<i></i><span>正在搜索，结果即将呈现…</span>';
 document.getElementById('resultsArea').before(status);
 const off=document.createElement('div');off.className='dt-recommend-off';off.innerHTML='<div><strong>为你发现更多好故事</strong><p>加载电影与剧集推荐，或在上方直接搜索。</p></div><button type="button">载入推荐</button>';
 const doubanArea=document.getElementById('doubanArea');doubanArea.before(off);
 const doubanTitle=doubanArea.querySelector('h2');if(doubanTitle)doubanTitle.textContent='为你推荐';
 const resume=document.createElement('section');resume.className='dt-resume';resume.setAttribute('aria-label','继续观看');
 resume.innerHTML='<div class="dt-section-head"><h2>继续观看</h2><button type="button">查看全部 ›</button></div><div class="dt-resume-grid"></div>';
 doubanArea.after(resume);
 resume.querySelector('button').addEventListener('click',event=>window.toggleHistory?.(event));
 function renderResume(){
  const grid=resume.querySelector('.dt-resume-grid');grid.replaceChildren();
  let items=[];try{const value=JSON.parse(localStorage.getItem('viewingHistory')||'[]');if(Array.isArray(value))items=value.slice(0,2);}catch{}
  if(!items.length){const empty=document.createElement('div');empty.className='dt-empty-history';empty.style.gridColumn='1/-1';empty.innerHTML=icons.history;const text=document.createElement('span');text.textContent='还没有观看记录。开始播放后，可以在这里接着看。';empty.append(text);grid.append(empty);return;}
  for(const item of items){
   const button=document.createElement('button');button.className='dt-resume-card';
   const visual=document.createElement('span');visual.className='dt-resume-icon';visual.innerHTML=icons.movie;
   const info=document.createElement('span');info.className='dt-resume-info';const name=document.createElement('strong');name.textContent=item.title||'未命名影片';const meta=document.createElement('small');
   const position=Number(item.playbackPosition)||0,duration=Number(item.duration)||0;
   meta.textContent=position>0?`已观看 ${Math.floor(position/60)} 分钟${duration>0?' / '+Math.floor(duration/60)+' 分钟':''}`:item.sourceName||'继续上次的故事';
   info.append(name,meta);
   if(duration>0){const bar=document.createElement('span');bar.className='dt-progress';const fill=document.createElement('span');fill.style.width=Math.max(0,Math.min(100,position/duration*100))+'%';bar.append(fill);info.append(bar);}
   button.append(visual,info);button.addEventListener('click',()=>window.playFromHistory?.(item.url,item.title,Number(item.episodeIndex)||0,position));grid.append(button);
  }
 }
 renderResume();window.addEventListener('storage',event=>{if(event.key==='viewingHistory')renderResume();});
 const transition=callback=>{if(document.startViewTransition&&!reduced)document.startViewTransition(callback);else callback();};
 function selectNav(name){sidebar.querySelectorAll('[data-nav]').forEach(button=>{const active=button.dataset.nav===name;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});}
 function openCollection(kind){
  transition(()=>{window.resetToHome?.();selectNav(kind);discovery.hidden=true;resume.hidden=true;const title=document.querySelector('.dt-page-title');if(title)title.textContent=kind==='tv'?'发现好剧集':'发现好电影';
   const toggle=document.getElementById('doubanToggle');if(toggle&&!toggle.checked){toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));}
   document.getElementById(kind==='tv'?'douban-tv-toggle':'douban-movie-toggle')?.click();
  });window.scrollTo({top:0,behavior:reduced?'instant':'smooth'});
 }
 sidebar.addEventListener('click',event=>{
  const button=event.target.closest('[data-nav]');if(!button)return;
  const nav=button.dataset.nav;
  if(nav==='history'){renderResume();window.toggleHistory?.(event);return;}
  if(nav==='settings'){window.toggleSettings?.(event);return;}
  if(nav==='home'){transition(()=>{window.resetToHome?.();selectNav('home');discovery.hidden=false;resume.hidden=false;document.querySelector('.dt-page-title').textContent='发现好故事';renderResume();});window.scrollTo({top:0,behavior:reduced?'instant':'smooth'});return;}
  openCollection(nav);
 });
 discovery.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='history'){window.toggleHistory?.(event);return;}if(action==='movies'){openCollection('movie');return;}
  const query=event.target.closest('[data-query]')?.dataset.query;if(query){searchInput.value=query;window.toggleClearButton?.();window.search?.();}
 });
 off.querySelector('button').addEventListener('click',()=>openCollection('movie'));
 const results=document.getElementById('resultsArea');
 function syncResults(){document.body.classList.toggle('search-active',!results.classList.contains('hidden'));}
 new MutationObserver(syncResults).observe(results,{attributes:true,attributeFilter:['class']});syncResults();
 function syncRecommendations(){off.hidden=localStorage.getItem('doubanEnabled')==='true'||!results.classList.contains('hidden');}
 new MutationObserver(syncRecommendations).observe(doubanArea,{attributes:true,attributeFilter:['class']});syncRecommendations();
 const originalShow=window.showLoading,originalHide=window.hideLoading;
 let pendingSearch=null,pendingQuery='';
 const originalSearch=window.search;
 window.search=function(...args){
  const query=searchInput.value.trim();if(pendingSearch&&query===pendingQuery)return pendingSearch;
  pendingQuery=query;
  const promise=Promise.resolve(originalSearch.apply(this,args));pendingSearch=promise;
  promise.finally(()=>{if(pendingSearch===promise){pendingSearch=null;pendingQuery='';}}).catch(()=>{});
  return promise;
 };
 window.showLoading=function(message){
  if(window.__libretvSearching){
   document.body.classList.add('dt-query-loading');status.hidden=false;results.setAttribute('aria-busy','true');results.classList.remove('hidden');
   if(!document.getElementById('results').children.length){const fragment=document.createDocumentFragment();for(let i=0;i<6;i++){const skeleton=document.createElement('div');skeleton.className='dt-skeleton dt-result-skeleton';skeleton.setAttribute('aria-hidden','true');fragment.append(skeleton);}document.getElementById('results').append(fragment);}
   return;
  }
  return originalShow?.(message);
 };
 window.hideLoading=function(){
  status.hidden=true;results.removeAttribute('aria-busy');document.body.classList.remove('dt-query-loading');
  document.querySelectorAll('.dt-result-skeleton').forEach(node=>node.remove());
  return originalHide?.();
 };
 document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();searchInput.focus();searchInput.select();}});
 // Decode visible posters asynchronously; keep offscreen cards out of layout work.
 new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)node.querySelectorAll('img').forEach(img=>{img.decoding='async';img.loading='lazy';});}).observe(document.getElementById('douban-results'),{childList:true});
});
