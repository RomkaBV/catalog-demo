const STORAGE_KEY = 'github_catalog_excel_v2';
const baseProducts = Array.isArray(window.CATALOG_DATA) ? window.CATALOG_DATA : [];

let products = loadProducts();
let selectedPhotos = [];

const $ = (id) => document.getElementById(id);
const catalog = $('catalog');
const stats = $('stats');
const emptyState = $('emptyState');
const adminDialog = $('adminDialog');
const detailDialog = $('detailDialog');

function deepCopyBase(){ return JSON.parse(JSON.stringify(baseProducts)); }

function loadProducts(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : deepCopyBase();
  } catch { return deepCopyBase(); }
}
function saveProducts(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(products)); }
function money(value){
  const n = Number(value || 0);
  return n > 0 ? new Intl.NumberFormat('uk-UA').format(n) + ' грн' : 'Ціна не вказана';
}
function statusClass(status){
  const s=(status||'').toLowerCase();
  if(s.includes('продан')) return 'sold';
  if(s.includes('брон')) return 'reserved';
  if(s.includes('не подано')) return 'pending';
  if(s.includes('не подаємо')) return 'hold';
  return 'sale';
}
function statusLabel(status){ return status || 'Не визначено'; }

function renderFilters(){
  const cat = $('categoryFilter');
  const st = $('statusFilter');
  const currentCat = cat.value;
  const currentSt = st.value;
  const categories = [...new Set(products.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'uk'));
  const statuses = [...new Set(products.map(p=>p.status).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'uk'));
  cat.innerHTML = '<option value="all">Усі категорії</option>' + categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  st.innerHTML = '<option value="all">Усі статуси</option>' + statuses.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  cat.value = categories.includes(currentCat) ? currentCat : 'all';
  st.value = statuses.includes(currentSt) ? currentSt : 'all';
}

function renderStats(){
  const total = products.length;
  const withPhoto = products.filter(p=>(p.photoNames||[]).length || (p.photos||[]).length).length;
  const priced = products.filter(p=>Number(p.price||0)>0).length;
  const pending = products.filter(p=>(p.status||'').toLowerCase().includes('не подано')).length;
  stats.innerHTML = [
    ['Усього позицій',total],['З фото',withPhoto],['З ціною OLX',priced],['Не подано',pending]
  ].map(([label,val])=>`<div class="stat"><b>${val}</b><span>${label}</span></div>`).join('');
}

function imagePath(name){ return 'images/' + encodeURIComponent(name).replace(/%2F/g,'/'); }

function cardImage(p){
  if(p.photos?.[0]) return `<img src="${p.photos[0]}" alt="${escapeHtml(p.name)}">`;
  if(p.photoNames?.[0]) {
    return `<img src="${imagePath(p.photoNames[0])}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="no-photo image-fallback">Фото: ${escapeHtml(p.photoNames[0])}</div>`;
  }
  return '<div class="no-photo">Немає фото</div>';
}

function renderCatalog(){
  const q = $('searchInput').value.trim().toLowerCase();
  const category = $('categoryFilter').value;
  const status = $('statusFilter').value;
  const filtered = products.filter(p => {
    const hay = `${p.inventoryNo||''} ${p.name||''} ${p.description||''} ${p.location||''}`.toLowerCase();
    return (!q || hay.includes(q)) &&
      (category==='all' || p.category===category) &&
      (status==='all' || p.status===status);
  });

  catalog.innerHTML = filtered.map(p => `
    <article class="card">
      <div class="card-image">
        ${cardImage(p)}
        <span class="badge">${escapeHtml(p.condition || 'Б/У')}</span>
      </div>
      <div class="card-body">
        <span class="status ${statusClass(p.status)}">${escapeHtml(statusLabel(p.status))}</span>
        <h3>${escapeHtml(p.name)}</h3>
        <div class="meta"><span>${escapeHtml(p.inventoryNo||'')}</span><span>•</span><span>${escapeHtml(p.category||'')}</span></div>
        <div class="meta"><span>${escapeHtml(p.location || 'Локація не вказана')}</span></div>
        <div class="price">${money(p.price)}</div>
        <div class="card-actions">
          <button class="btn ghost" onclick="openDetails('${escapeJs(p.id)}')">Детальніше</button>
        </div>
      </div>
    </article>`).join('');

  emptyState.classList.toggle('hidden', filtered.length>0);
  renderStats();
}

function escapeHtml(str=''){
  return String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}
function escapeJs(str=''){ return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

$('openAdminBtn').addEventListener('click',()=>adminDialog.showModal());
$('closeAdminBtn').addEventListener('click',()=>adminDialog.close());
$('cancelBtn').addEventListener('click',()=>adminDialog.close());
['searchInput','categoryFilter','statusFilter'].forEach(id => $(id).addEventListener(id==='searchInput'?'input':'change', renderCatalog));

$('photos').addEventListener('change', async (e)=>{
  const files = [...e.target.files].slice(0,3);
  selectedPhotos = [];
  for (const file of files) selectedPhotos.push(await resizeImage(file, 1100, .78));
  $('photoPreview').innerHTML = selectedPhotos.map(src=>`<img src="${src}">`).join('');
});

$('productForm').addEventListener('submit',(e)=>{
  e.preventDefault();
  const product = {
    id: crypto.randomUUID(),
    inventoryNo: '',
    name: $('name').value.trim(),
    category: $('category').value.trim(),
    price: Number($('price').value || 0),
    location: $('location').value.trim(),
    condition: $('condition').value,
    status: $('status').value.trim() || 'Не визначено',
    description: $('description').value.trim(),
    photoNames: [],
    photos: selectedPhotos
  };
  products.unshift(product);
  try { saveProducts(); }
  catch(err){ alert('Браузер не зміг зберегти дані. Спробуй менші фото або видали частину позицій.'); return; }
  e.target.reset(); selectedPhotos=[]; $('photoPreview').innerHTML=''; adminDialog.close(); renderFilters(); renderCatalog();
});

$('resetDemoBtn').addEventListener('click',()=>{
  if(confirm('Відновити 252 позиції з початкового Excel та видалити локальні зміни?')){
    products=deepCopyBase(); saveProducts(); renderFilters(); renderCatalog();
  }
});

window.openDetails = function(id){
  const p=products.find(x=>String(x.id)===String(id)); if(!p) return;
  const localImages=(p.photos||[]);
  const fileImages=(p.photoNames||[]);
  const firstLocal=localImages[0];
  const firstFile=fileImages[0];
  let main = '<div class="detail-main-image no-photo">Немає фото</div>';
  let thumbs = '';
  if(firstLocal){
    main=`<img id="mainDetailImage" class="detail-main-image" src="${firstLocal}">`;
    thumbs=localImages.map(src=>`<img src="${src}" onclick="document.getElementById('mainDetailImage').src=this.src">`).join('');
  } else if(firstFile){
    main=`<img id="mainDetailImage" class="detail-main-image" src="${imagePath(firstFile)}" onerror="this.style.display='none';document.getElementById('detailPhotoFallback').style.display='flex'"><div id="detailPhotoFallback" class="detail-main-image no-photo image-fallback">Файл фото: ${escapeHtml(firstFile)}</div>`;
    thumbs=fileImages.map(name=>`<button class="photo-name" onclick="setFileImage('${escapeJs(name)}')">${escapeHtml(name)}</button>`).join('');
  }

  const extra = [
    p.inventoryNo ? `<b>Інвентарний №:</b> ${escapeHtml(p.inventoryNo)}` : '',
    Number(p.residualValue||0)>0 ? `<b>Залишкова вартість:</b> ${money(p.residualValue)}` : '',
    Number(p.newPrice||0)>0 ? `<b>Ціна нового аналога:</b> ${money(p.newPrice)}` : '',
    fileImages.length ? `<b>Фото у реєстрі:</b> ${fileImages.length}` : ''
  ].filter(Boolean).join('<br>');

  $('detailContent').innerHTML = `
    <div class="detail-wrap">
      <div class="dialog-head"><div class="eyebrow">КАРТКА ПОЗИЦІЇ</div><button class="icon-btn" onclick="document.getElementById('detailDialog').close()">✕</button></div>
      <div class="detail-grid">
        <div>
          ${main}
          <div class="thumbs">${thumbs}</div>
        </div>
        <div class="detail-side">
          <span class="status ${statusClass(p.status)}">${escapeHtml(statusLabel(p.status))}</span>
          <h2>${escapeHtml(p.name)}</h2>
          <div class="meta"><span>${escapeHtml(p.category||'')}</span><span>•</span><span>${escapeHtml(p.condition||'')}</span></div>
          <div class="meta">${escapeHtml(p.location||'')}</div>
          <div class="price">${money(p.price)}</div>
          ${extra ? `<div class="detail-extra">${extra}</div>` : ''}
          <div class="detail-desc">${escapeHtml(p.description || 'Опис відсутній')}</div>
          <div class="detail-actions">
            <button class="btn danger" onclick="deleteProduct('${escapeJs(p.id)}')">Видалити</button>
          </div>
        </div>
      </div>
    </div>`;
  detailDialog.showModal();
}

window.setFileImage = function(name){
  const img=document.getElementById('mainDetailImage');
  const fb=document.getElementById('detailPhotoFallback');
  if(!img) return;
  img.style.display='block';
  if(fb) fb.style.display='none';
  img.src=imagePath(name);
  img.onerror=()=>{ img.style.display='none'; if(fb){fb.style.display='flex';fb.textContent='Файл фото: '+name;} };
}

window.deleteProduct = function(id){
  if(!confirm('Видалити позицію?')) return;
  products=products.filter(p=>String(p.id)!==String(id)); saveProducts(); detailDialog.close(); renderFilters(); renderCatalog();
}

function resizeImage(file, maxSize=1100, quality=.78){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    const reader=new FileReader();
    reader.onload=()=>{ img.onload=()=>{
      let {width,height}=img;
      const scale=Math.min(1,maxSize/Math.max(width,height));
      width=Math.round(width*scale);height=Math.round(height*scale);
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      canvas.getContext('2d').drawImage(img,0,0,width,height);
      resolve(canvas.toDataURL('image/jpeg',quality));
    }; img.onerror=reject; img.src=reader.result; };
    reader.onerror=reject; reader.readAsDataURL(file);
  });
}

renderFilters();
renderCatalog();
