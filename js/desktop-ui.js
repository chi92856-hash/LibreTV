/* Desktop navigation over the existing LibreTV search and playback actions. */
if (localStorage.getItem('doubanEnabled') === null) localStorage.setItem('doubanEnabled','true');
document.addEventListener('DOMContentLoaded',()=>{
 const motion=matchMedia('(prefers-reduced-motion: no-preference)');
 const icon=paths=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
 const icons={play:icon('<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>'),
  home:icon('<circle cx="12" cy="12" r="9"/><path d="m15 8-2 6-5 2 2-6z"/>'),
  movie:icon('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18m10-18v18M3 8h4m-4 8h4m10-8h4m-4 8h4"/>'),
  tv:icon('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 2 4 4 4-4"/>'),
  history:icon('<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'),
  settings:icon('<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>')};
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
 sidebar.innerHTML=`<a class="dt-brand" href="/" aria-label="LibreTV 首页"><span>${icons.play}</span>LibreTV</a><nav><button class="dt-nav active" data-nav="home" aria-current="page">${icons.home}发现</button><button class="dt-nav" data-nav="history">${icons.history}观看历史</button><button class="dt-nav" data-nav="saved">${icon('<path d="M6 4h12v16l-6-4-6 4z"/>')}我的片单</button></nav>`;
 document.body.prepend(sidebar);
 const header=document.querySelector('body>.container header');
 const searchArea=document.getElementById('searchArea');
 const searchInput=document.getElementById('searchInput');
 searchInput.placeholder='搜索电影、剧集或关键词';
 const filters=document.createElement('div');
 filters.className='dt-filters';
 filters.setAttribute('aria-label','影片类型');
 filters.innerHTML='<button type="button" data-kind="home" aria-pressed="true">全部</button><button type="button" data-kind="movie" aria-pressed="false">电影</button><button type="button" data-kind="tv" aria-pressed="false">电视剧</button><span aria-hidden="true"></span>';
 const tools=document.createElement('div');
 tools.className='dt-tools';
 tools.innerHTML=`<button type="button" aria-label="打开设置" title="设置">${icons.settings}</button>`;
 tools.firstElementChild.addEventListener('click',event=>window.toggleSettings?.(event));
 header.prepend(filters);
 header.append(searchArea,tools);
 const discovery=document.createElement('section');discovery.className='dt-discovery';discovery.setAttribute('aria-label','发现影片');
 discovery.innerHTML=`<div class="dt-hero"><div class="dt-hero-copy"><div class="dt-eyebrow">精选影片</div><h2>星际穿越</h2><p>Interstellar　2014　科幻 / 冒险<br>穿越虫洞，寻找人类的新家园。</p><div class="dt-hero-actions"><button data-query="星际穿越">${icons.play}查找影片</button></div></div></div>`;
 header?.after(discovery);
 const status=document.createElement('div');status.className='dt-query-status';status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.innerHTML='<i></i><span>正在搜索，结果即将呈现…</span>';
 document.getElementById('resultsArea').before(status);
 const off=document.createElement('div');off.className='dt-recommend-off';off.innerHTML='<div><strong>为你发现更多好故事</strong><p>加载电影与剧集推荐，或在上方直接搜索。</p></div><button type="button">载入推荐</button>';
 const doubanArea=document.getElementById('doubanArea');doubanArea.before(off);
 const doubanTitle=doubanArea.querySelector('h2');if(doubanTitle)doubanTitle.textContent='热门影视';
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
 const savedSection=document.createElement('section');
 savedSection.className='dt-saved';
 savedSection.hidden=true;
 savedSection.innerHTML='<h2>我的片单</h2><div class="dt-saved-list"></div>';
 resume.after(savedSection);
 const savedKey='libretvSavedTitles';
 function readSaved(){
  try{
   const titles=JSON.parse(localStorage.getItem(savedKey)||'[]');
   return Array.isArray(titles)?titles.filter(title=>typeof title==='string'&&title.trim()):[];
  }catch{return [];}
 }
 function searchTitle(title){
  if(!savedSection.hidden) openCollection('home');
  searchInput.value=title;
  window.toggleClearButton?.();
  window.search?.();
 }
 function renderSaved(){
  const list=savedSection.querySelector('.dt-saved-list');
  const titles=readSaved();
  list.replaceChildren();
  if(!titles.length){list.textContent='片单为空。打开搜索结果的影片详情即可收藏。';return;}
  for(const title of titles){
   const button=document.createElement('button');
   button.type='button';
   button.textContent=title;
   button.addEventListener('click',()=>searchTitle(title));
   list.append(button);
  }
 }
 const modal=document.getElementById('modal');
 const saveButton=document.createElement('button');
 saveButton.type='button';
 saveButton.className='dt-save-button';
 saveButton.hidden=true;
 document.getElementById('modalContent').before(saveButton);
 function syncSaveButton(){
  const title=modal.dataset.filmTitle;
  saveButton.hidden=!title||modal.classList.contains('hidden');
  const saved=Boolean(title&&readSaved().includes(title));
  saveButton.textContent=saved?'已收藏':'收藏';
  saveButton.setAttribute('aria-pressed',String(saved));
 }
 new MutationObserver(syncSaveButton).observe(modal,{attributes:true,attributeFilter:['class','data-film-title']});
 saveButton.addEventListener('click',()=>{
  const title=modal.dataset.filmTitle;
  if(!title)return;
  const titles=readSaved();
  const next=titles.includes(title)?titles.filter(item=>item!==title):[title,...titles];
  try{localStorage.setItem(savedKey,JSON.stringify(next));}
  catch{window.showToast?.('无法保存片单');return;}
  syncSaveButton();
  renderSaved();
 });
 window.addEventListener('storage',event=>{if(event.key===savedKey){renderSaved();syncSaveButton();}});

 let sectionMotion;
 function animateSection(section){
  sectionMotion?.cancel();
  if(motion.matches) sectionMotion=section.animate([{transform:'translateX(12px)',opacity:.55},{transform:'translateX(0)',opacity:1}],{duration:230,easing:'ease-out'});
 }
 function selectNav(name){sidebar.querySelectorAll('[data-nav]').forEach(button=>{const active=button.dataset.nav===name;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});}
 function positionIndicator(){
  const active=filters.querySelector('[aria-pressed="true"]');
  filters.style.setProperty('--filter-x',active.offsetLeft+'px');
  filters.style.setProperty('--filter-width',active.offsetWidth+'px');
 }
 function openCollection(kind){
  window.resetToHome?.();
  document.body.classList.remove('dt-show-saved');
  savedSection.hidden=true;
  selectNav('home');
  discovery.hidden=false;
  resume.hidden=kind!=='home';
  filters.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.kind===kind)));
  positionIndicator();
  document.getElementById(kind==='tv'?'douban-tv-toggle':'douban-movie-toggle')?.click();
  if(kind==='home')renderResume();
  window.scrollTo(0,0);
 }
 positionIndicator();
 window.addEventListener('resize',positionIndicator);
 filters.addEventListener('click',event=>{
  const kind=event.target.closest('[data-kind]')?.dataset.kind;
  if(kind)openCollection(kind);
 });
 sidebar.addEventListener('click',event=>{
  const button=event.target.closest('[data-nav]');if(!button)return;
  const nav=button.dataset.nav;
  if(nav==='history'){renderResume();window.toggleHistory?.(event);return;}
  if(nav==='home'){openCollection('home');return;}
  window.resetToHome?.();
  selectNav('saved');
  savedSection.hidden=false;
  document.body.classList.add('dt-show-saved');
  renderSaved();
  animateSection(savedSection);
  window.scrollTo(0,0);
 });
 discovery.addEventListener('click',event=>{
  const query=event.target.closest('[data-query]')?.dataset.query;
  if(query)searchTitle(query);
 });
 off.querySelector('button').addEventListener('click',()=>{
  const toggle=document.getElementById('doubanToggle');
  toggle.checked=true;
  toggle.dispatchEvent(new Event('change',{bubbles:true}));
 });
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
  if(query&&!savedSection.hidden){
   savedSection.hidden=true;
   document.body.classList.remove('dt-show-saved');
   selectNav('home');
  }
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
 const posters=document.getElementById('douban-results');
 const hero=discovery.querySelector('.dt-hero');
 const heroTitle=hero.querySelector('h2');
 const heroMeta=hero.querySelector('p');
 const heroSearch=hero.querySelector('[data-query]');
 const heroImage=document.createElement('img');
 heroImage.className='dt-hero-image';
 heroImage.alt='';
 heroImage.referrerPolicy='no-referrer';
 heroImage.hidden=true;
 hero.prepend(heroImage);
 const carousel=document.createElement('div');
 carousel.className='dt-hero-carousel';
 carousel.hidden=true;
 carousel.setAttribute('role','group');
 carousel.setAttribute('aria-label','推荐电影轮播');
 carousel.innerHTML='<button type="button" data-step="-1" aria-label="上一部">‹</button><span class="dt-hero-count"></span><button type="button" data-step="1" aria-label="下一部">›</button><button type="button" data-pause aria-label="暂停轮播" title="暂停轮播">Ⅱ</button>';
 hero.append(carousel);
 const pause=carousel.querySelector('[data-pause]');
 let movies=[];
 let movieIndex=0;
 let paused=false;
 let rotation;
 function showMovie(index){
  if(!movies.length)return;
  movieIndex=(index+movies.length)%movies.length;
  const movie=movies[movieIndex];
  heroImage.src=movie.cover;
  heroImage.hidden=false;
  heroTitle.textContent=movie.title;
  heroMeta.textContent=movie.rating;
  heroSearch.dataset.query=movie.title;
  carousel.querySelector('.dt-hero-count').textContent=`${movieIndex+1} / ${movies.length}`;
  if(motion.matches)heroImage.animate([{opacity:0},{opacity:1}],{duration:320,easing:'ease-out'});
 }
 function resetRotation(){
  clearInterval(rotation);
  if(paused||movies.length<2)return;
  rotation=setInterval(()=>{
   const bounds=hero.getBoundingClientRect();
   if(document.hidden||!hero.getClientRects().length||bounds.bottom<=0||bounds.top>=window.innerHeight||hero.matches(':hover, :focus-within')||panels.some(panel=>panel.classList.contains('show'))||!modal.classList.contains('hidden'))return;
   showMovie(movieIndex+1);
  },6500);
 }
 function collectMovies(){
  if(posters.dataset.recommendationType!=='movie')return;
  const available=[];
  for(const cover of posters.querySelectorAll('[data-cover-action="search"]')){
   const image=cover.querySelector('img');
   if(!image?.naturalWidth||!image.complete||cover.classList.contains('dt-cover-empty'))continue;
   const title=image.alt.trim();
   if(!title||available.some(movie=>movie.title===title))continue;
   available.push({title,cover:image.currentSrc||image.src,rating:cover.querySelector('.absolute.bottom-2.left-2')?.textContent.trim()||'推荐电影'});
   if(available.length===6)break;
  }
  if(!available.length)return;
  const current=movies[movieIndex];
  movies=available;
  const index=movies.findIndex(movie=>movie.title===current?.title&&movie.cover===current.cover);
  if(index<0)showMovie(0);
  else{
   movieIndex=index;
   carousel.querySelector('.dt-hero-count').textContent=`${movieIndex+1} / ${movies.length}`;
  }
  carousel.hidden=movies.length<2;
  resetRotation();
 }
 carousel.addEventListener('click',event=>{
  const step=event.target.closest('[data-step]');
  if(step)showMovie(movieIndex+Number(step.dataset.step));
  else if(event.target===pause){
   paused=!paused;
   const label=paused?'继续轮播':'暂停轮播';
   pause.textContent=paused?'▶':'Ⅱ';
   pause.setAttribute('aria-label',label);
   pause.title=label;
  }else return;
  resetRotation();
 });
 posters.addEventListener('load',collectMovies,true);
 new MutationObserver(collectMovies).observe(posters,{childList:true});
 collectMovies();
 const hover=matchMedia('(hover: hover) and (pointer: fine)');
 let pinnedCard;
 posters.addEventListener('click',event=>{
  const button=event.target.closest('[data-preview-pin]');
  if(!button)return;
  const card=button.parentElement;
  const next=pinnedCard===card?null:card;
  if(pinnedCard){
   pinnedCard.classList.remove('dt-preview-pinned');
   const previous=pinnedCard.querySelector('[data-preview-pin]');
   previous.setAttribute('aria-pressed','false');
   previous.textContent='固定预览';
  }
  pinnedCard=next;
  if(next){
   next.classList.add('dt-preview-pinned');
   button.setAttribute('aria-pressed','true');
   button.textContent='取消固定';
  }
 });
 new MutationObserver(()=>{
  if(pinnedCard&&!posters.contains(pinnedCard))pinnedCard=null;
  const covers=posters.querySelectorAll('[data-cover-action="search"]');
  if(!covers.length||!motion.matches)return;
  for(const cover of covers){
   cover.animate([{opacity:0},{opacity:1}],{duration:160,delay:200,easing:'ease-out',fill:'backwards'});
  }
 }).observe(posters,{childList:true});
 new MutationObserver(records=>{
  if(!motion.matches)return;
  for(const {target} of records){
   if(target.id==='episodesGrid'){
    target.animate([{opacity:.25},{opacity:1}],{duration:160,easing:'ease-out'});
   }
  }
 }).observe(document.getElementById('modalContent'),{childList:true,subtree:true});
 function followPointer(event,card,hitArea,maxTiltX,maxTiltY){
  if(!motion.matches||!hover.matches||event.pointerType!=='mouse')return;
  const bounds=hitArea.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const x=Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width));
  const y=Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height));
  card.style.setProperty('--tilt-x',(0.5-y)*maxTiltX+'deg');
  card.style.setProperty('--tilt-y',(x-0.5)*maxTiltY+'deg');
  card.style.setProperty('--light-x',x*100+'%');
  card.style.setProperty('--light-y',y*100+'%');
  card.classList.add('dt-tilting');
 }
 discovery.addEventListener('pointermove',event=>followPointer(event,hero,discovery,4,5));
 discovery.addEventListener('pointerleave',()=>hero.classList.remove('dt-tilting'));
 posters.addEventListener('pointermove',event=>{
  const card=event.target.closest('#douban-results > div:not(.col-span-full):not(.dt-skeleton)');
  if(card)followPointer(event,card,card,10,13);
 });
 posters.addEventListener('pointerout',event=>{
  const card=event.target.closest('.dt-tilting');
  if(card&&!card.contains(event.relatedTarget))card.classList.remove('dt-tilting');
 });
});
