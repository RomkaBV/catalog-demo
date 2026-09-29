(() => {
  const cfg = window.APP_CONFIG || {};
  const fallback = Array.isArray(window.CATALOG_PRODUCTS) ? window.CATALOG_PRODUCTS : [];
  let products = [...fallback];
  let filtered = [];
  let activeCategory = 'Усі';
  let shown = 24;
  let selected = null;
  let editorPhotos = [];
  let adminKey = sessionStorage.getItem('catalogAdminKey') || '';
  let remoteLoaded = false;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const els = {
    grid: $('#catalogGrid'), search: $('#searchInput'), sort: $('#sortSelect'), chips: $('#categoryChips'),
    result: $('#resultText'), more: $('#loadMoreBtn'), statProducts: $('#statProducts'), statPhotos: $('#statWithPhotos'),
    statQty: $('#statQuantity'), add: $('#addProductBtn'), login: $('#adminLoginDialog'), editor: $('#editorDialog'),
    detail: $('#productDialog')
  };

  document.title = cfg.SITE_TITLE || document.title;
  if (cfg.SITE_SUBTITLE) $('#heroSubtitle').textContent = cfg.SITE_SUBTITLE;
  if (cfg.CONTACT_TEXT) $('#contactText').textContent = cfg.CONTACT_TEXT;

  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm = s => String(s||'').toLowerCase().normalize('NFKD');
  const fileId = url => {
    const s=String(url||'');
    const m=s.match(/\/d\/([\w-]+)/) || s.match(/[?&]id=([\w-]+)/) || s.match(/^([\w-]{20,})$/);
    return m ? m[1] : '';
  };
  const driveViewUrl = p => p?.url || (p?.id ? `https://drive.google.com/file/d/${p.id}/view` : '');
  const imageCandidates = p => {
    const id = p?.id || fileId(p?.url);
    if (!id) return p?.url ? [p.url] : [];
    return [
      `https://drive.google.com/thumbnail?id=${id}&sz=w1400`,
      `https://drive.google.com/uc?export=view&id=${id}`
    ];
  };
  function imgTag(photo, cls='', alt='Фото обладнання') {
    const c=imageCandidates(photo); if(!c.length) return '';
    return `<img class="${cls}" src="${esc(c[0])}" data-sources='${esc(JSON.stringify(c))}' data-source-index="0" alt="${esc(alt)}" loading="lazy">`;
  }
  document.addEventListener('error', e => {
    const img=e.target;if(!(img instanceof HTMLImageElement) || !img.dataset.sources) return;
    let arr=[]; try{arr=JSON.parse(img.dataset.sources)}catch{};
    const i=Number(img.dataset.sourceIndex||0)+1;
    if(i<arr.length){img.dataset.sourceIndex=String(i);img.src=arr[i];}
    else { const holder=img.closest('.card-media,.gallery-main'); if(holder){holder.innerHTML=noPhotoHtml();} }
  }, true);
  const noPhotoHtml = () => `<div class="no-photo"><div><svg viewBox="0 0 24 24"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Фото буде додано</span></div></div>`;

  function normalizeProduct(p){
    return {...p, quantity:Number(p.quantity||0), photos:Array.isArray(p.photos)?p.photos:[], category:p.category||'Інше'};
  }
  function apply(){
    const q=norm(els.search.value.trim());
    filtered=products.map(normalizeProduct).filter(p => (activeCategory==='Усі'||p.category===activeCategory) && (!q || norm(`${p.article} ${p.name} ${p.accountingName||''}`).includes(q)));
    const s=els.sort.value;
    filtered.sort((a,b)=> s==='article' ? a.article.localeCompare(b.article,'uk') : s==='qtyDesc' ? b.quantity-a.quantity : s==='photos' ? (b.photos.length-a.photos.length)||a.name.localeCompare(b.name,'uk') : a.name.localeCompare(b.name,'uk'));
    render();
  }
  function render(){
    const list=filtered.slice(0,shown);
    els.grid.innerHTML=list.length ? list.map(cardHtml).join('') : `<div class="empty"><strong>Нічого не знайдено</strong>Спробуйте змінити пошук або категорію.</div>`;
    els.result.textContent=`Знайдено ${filtered.length} позицій` + (remoteLoaded ? ' · дані Google' : ' · дані Excel');
    els.more.classList.toggle('hidden',shown>=filtered.length);
    wireCards(); updateStats();
  }
  function cardHtml(p){
    const photo=p.photos?.[0];
    const media=photo?imgTag(photo,'',p.name):noPhotoHtml();
    return `<article class="card" data-article="${esc(p.article)}">
      <div class="card-media" data-open="${esc(p.article)}">${media}${p.photos?.length>1?`<span class="photo-count">${p.photos.length} фото</span>`:''}</div>
      <div class="card-body"><span class="badge">${esc(p.category||'Інше')}</span><h3>${esc(p.name)}</h3>
      <div class="meta"><div><span>Артикул</span><strong>${esc(p.article)}</strong></div><div><span>Кількість</span><strong>${esc(p.quantity)} шт.</strong></div></div>
      <div class="card-actions"><button class="details" data-open="${esc(p.article)}">Детальніше</button>${adminKey?`<button class="edit-mini" data-edit="${esc(p.article)}" title="Редагувати">✎</button>`:''}</div></div></article>`;
  }
  function wireCards(){
    $$('[data-open]').forEach(x=>x.onclick=()=>openDetails(x.dataset.open));
    $$('[data-edit]').forEach(x=>x.onclick=()=>openEditor(find(x.dataset.edit)));
  }
  function updateStats(){
    els.statProducts.textContent=products.length.toLocaleString('uk-UA');
    els.statPhotos.textContent=products.filter(p=>p.photos?.length).length.toLocaleString('uk-UA');
    els.statQty.textContent=products.reduce((a,p)=>a+Number(p.quantity||0),0).toLocaleString('uk-UA');
  }
  function renderChips(){
    const cats=['Усі',...new Set(products.map(p=>p.category||'Інше').sort((a,b)=>a.localeCompare(b,'uk')))];
    els.chips.innerHTML=cats.map(c=>`<button class="chip ${c===activeCategory?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    els.chips.querySelectorAll('button').forEach(b=>b.onclick=()=>{activeCategory=b.dataset.cat;shown=24;renderChips();apply()});
    $('#categoryList').innerHTML=cats.filter(x=>x!=='Усі').map(c=>`<option value="${esc(c)}"></option>`).join('');
  }
  function find(article){return products.find(p=>p.article===article)}

  function openDetails(article){
    selected=find(article); if(!selected)return;
    $('#detailCategory').textContent=selected.category||'Інше'; $('#detailName').textContent=selected.name;
    $('#detailArticle').textContent=selected.article; $('#detailQuantity').textContent=`${selected.quantity} шт.`; $('#detailPhotoCount').textContent=selected.photos?.length||0;
    renderGallery(selected,0);
    const link=selected.photos?.[0] ? driveViewUrl(selected.photos[0]) : '';
    $('#detailDrive').classList.toggle('hidden',!link); if(link) $('#detailDrive').href=link;
    $('#editProductBtn').classList.toggle('hidden',!adminKey);
    els.detail.showModal();
  }
  function renderGallery(p,index){
    const photos=p.photos||[]; const main=$('#galleryMain'), thumbs=$('#galleryThumbs');
    if(!photos.length){main.innerHTML=noPhotoHtml();thumbs.innerHTML='';return;}
    const photo=photos[Math.min(index,photos.length-1)]; main.innerHTML=imgTag(photo,'',p.name);
    thumbs.innerHTML=photos.map((x,i)=>`<button class="gallery-thumb ${i===index?'active':''}" data-i="${i}">${imgTag(x,'',`${p.name} фото ${i+1}`)}</button>`).join('');
    thumbs.querySelectorAll('button').forEach(b=>b.onclick=()=>renderGallery(p,Number(b.dataset.i)));
    const l=driveViewUrl(photo); if(l){$('#detailDrive').href=l;$('#detailDrive').classList.remove('hidden')}
  }

  // JSONP is used for reading from Apps Script so GitHub Pages does not depend on CORS headers.
  function jsonp(params={}){
    return new Promise((resolve,reject)=>{
      if(!cfg.API_URL) return reject(new Error('API URL не налаштовано'));
      const cb='__catalog_cb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const script=document.createElement('script'); const timeout=setTimeout(()=>done(new Error('Таймаут API')),15000);
      function done(err,data){clearTimeout(timeout);delete window[cb];script.remove();err?reject(err):resolve(data)}
      window[cb]=data=>done(null,data);
      const u=new URL(cfg.API_URL); Object.entries({...params,prefix:cb}).forEach(([k,v])=>u.searchParams.set(k,v)); script.src=u.toString(); script.onerror=()=>done(new Error('API недоступний')); document.body.appendChild(script);
    })
  }
  async function loadRemote(){
    if(!cfg.API_URL){renderChips();apply();return}
    try{const r=await jsonp({action:'list'});if(r?.ok&&Array.isArray(r.products)){products=r.products.map(normalizeProduct);remoteLoaded=true;renderChips();apply();}}
    catch(e){console.warn(e);renderChips();apply();}
  }

  function submitApi(payload){
    if(!cfg.API_URL) throw new Error('Спочатку вставте URL Google Apps Script у config.js');
    const form=document.createElement('form'); form.method='POST';form.action=cfg.API_URL;form.target='apiFrame';form.style.display='none';
    const input=document.createElement('input');input.type='hidden';input.name='payload';input.value=JSON.stringify(payload);form.appendChild(input);document.body.appendChild(form);form.submit();setTimeout(()=>form.remove(),1000);
  }
  async function waitForRemote(article, predicate, tries=10){
    for(let i=0;i<tries;i++){
      await new Promise(r=>setTimeout(r,i?1600:900));
      try{const data=await jsonp({action:'list',_t:Date.now()}); if(data?.ok&&Array.isArray(data.products)){products=data.products.map(normalizeProduct);remoteLoaded=true; const p=find(article); if(predicate(p)){renderChips();apply();return p;}}}catch{}
    }
    return null;
  }

  function setAdmin(on){
    els.add.classList.toggle('hidden',!on); $('#editProductBtn').classList.toggle('hidden',!on||!selected); render();
  }
  $('#adminEntry').onclick=()=>{
    if(!cfg.API_URL){alert('Адмін-режим готовий, але спочатку потрібно вставити URL розгорнутого Google Apps Script у config.js. Інструкція є в README.md.');return}
    if(adminKey){if(confirm('Вийти з режиму адміністратора?')){adminKey='';sessionStorage.removeItem('catalogAdminKey');setAdmin(false)}return}
    $('#adminKeyInput').value='';$('#adminLoginMsg').textContent='';els.login.showModal();
  };
  $('#adminLoginBtn').onclick=()=>{
    const key=$('#adminKeyInput').value.trim();const msg=$('#adminLoginMsg'); if(!key){msg.textContent='Введіть ключ.';return}
    // Ключ навмисно не передається через GET/URL. Backend перевіряє його лише під час запису.
    adminKey=key;sessionStorage.setItem('catalogAdminKey',key);els.login.close();setAdmin(true);
  };

  els.add.onclick=()=>openEditor(null);
  $('#editProductBtn').onclick=()=>{els.detail.close();openEditor(selected)};
  function openEditor(p){
    selected=p||null; editorPhotos=(p?.photos||[]).map(x=>({...x,keep:true}));
    $('#editorTitle').textContent=p?'Редагувати позицію':'Додати позицію';
    $('#fArticle').value=p?.article||''; $('#fArticle').readOnly=!!p;
    $('#fQuantity').value=p?.quantity??1; $('#fName').value=p?.name||''; $('#fAccountingName').value=p?.accountingName||''; $('#fCategory').value=p?.category||'Інше';
    $('#fDriveUrls').value='';$('#fFiles').value='';$('#editorMsg').textContent='';
    $('#deleteProductBtn').classList.toggle('hidden',!p); $('#apiStatus').textContent=cfg.API_URL?'Google API підключено':'API не налаштовано';$('#apiStatus').classList.toggle('ok',!!cfg.API_URL);
    renderExistingPhotos();els.editor.showModal();
  }
  function renderExistingPhotos(){
    $('#existingPhotos').innerHTML=editorPhotos.length?`<div class="span2" style="width:100%;font-size:13px;font-weight:800">Поточні фото</div>`+editorPhotos.map((p,i)=>`<div class="existing-photo">${imgTag(p,'',`Фото ${i+1}`)}<label><input type="checkbox" data-photo-keep="${i}" ${p.keep!==false?'checked':''}> залишити</label></div>`).join(''):'';
    $$('[data-photo-keep]').forEach(x=>x.onchange=()=>editorPhotos[Number(x.dataset.photoKeep)].keep=x.checked);
  }

  async function compressFile(file){
    if(!file.type.startsWith('image/')) throw new Error(`${file.name}: не зображення`);
    const data=await fileToDataURL(file); const img=await loadImage(data); const max=1800; const scale=Math.min(1,max/Math.max(img.width,img.height));
    const w=Math.round(img.width*scale),h=Math.round(img.height*scale); const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
    return {name:file.name.replace(/\.[^.]+$/,'.jpg'),dataUrl:c.toDataURL('image/jpeg',.84)};
  }
  const fileToDataURL=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)});
  const loadImage=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});

  $('#editorForm').onsubmit=async e=>{
    e.preventDefault(); const msg=$('#editorMsg'); msg.className='form-msg';
    if(!cfg.API_URL){msg.textContent='У config.js потрібно вказати URL Google Apps Script.';msg.classList.add('error');return}
    const article=$('#fArticle').value.trim(), name=$('#fName').value.trim(); if(!article||!name)return;
    $('#saveProductBtn').disabled=true;msg.textContent='Підготовка фото…';
    try{
      const files=[...$('#fFiles').files]; const uploads=[];
      for(let i=0;i<files.length;i++){msg.textContent=`Опрацювання фото ${i+1}/${files.length}…`;uploads.push(await compressFile(files[i]));}
      const externalPhotoUrls=$('#fDriveUrls').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      const payload={action:'upsert',key:adminKey,product:{article,name,accountingName:$('#fAccountingName').value.trim(),quantity:Number($('#fQuantity').value||0),category:$('#fCategory').value.trim()||'Інше',keepPhotos:editorPhotos.filter(x=>x.keep!==false).map(({keep,...p})=>p),externalPhotoUrls,uploads}};
      msg.textContent='Надсилаю зміни в Google…';submitApi(payload);
      const p=await waitForRemote(article,x=>!!x && x.name===name,12);
      if(p){msg.textContent='Збережено. Каталог оновлено.';msg.classList.add('success');setTimeout(()=>els.editor.close(),500)}else{msg.textContent='Запит відправлено. Якщо зміни ще не видно, оновіть сторінку через кілька секунд.'}
    }catch(err){msg.textContent=err.message||'Помилка збереження';msg.classList.add('error')}
    finally{$('#saveProductBtn').disabled=false}
  };
  $('#deleteProductBtn').onclick=async()=>{
    if(!selected||!confirm(`Видалити з каталогу позицію ${selected.article}? Фото у Google Drive не видаляються.`))return;
    const article=selected.article;$('#editorMsg').textContent='Видалення…';submitApi({action:'delete',key:adminKey,article});
    await waitForRemote(article,x=>!x,10); els.editor.close(); renderChips(); apply();
  };

  $$('.modal-close,[data-close]').forEach(b=>b.addEventListener('click',()=>{const d=document.getElementById(b.dataset.close)||b.closest('dialog');if(d?.open)d.close()}));
  els.search.addEventListener('input',()=>{shown=24;apply()}); $('#searchBtn').onclick=()=>apply(); els.sort.onchange=()=>apply(); els.more.onclick=()=>{shown+=24;render()};
  if(adminKey) setAdmin(true);
  loadRemote();
})();
