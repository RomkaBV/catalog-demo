const STORAGE_KEY = 'github_catalog_demo_v1';

const demoProducts = [
  {id: crypto.randomUUID(), name:'Морозильна скриня', category:'Холодильне обладнання', price:8500, location:'Чернігів', condition:'Б/У', status:'В продажу', description:'Морозильна скриня 120×90×66 см. Робочий стан, є сліди експлуатації.', photos:[]},
  {id: crypto.randomUUID(), name:'Холодильна шафа', category:'Холодильне обладнання', price:12000, location:'Чернігів', condition:'Б/У', status:'Заброньовано', description:'Вертикальна холодильна шафа. Підходить для магазину або складу.', photos:[]},
  {id: crypto.randomUUID(), name:'Офісний стіл', category:'Меблі', price:2500, location:'Київ', condition:'Б/У', status:'В продажу', description:'Офісний стіл у хорошому стані.', photos:[]},
  {id: crypto.randomUUID(), name:'Стелаж металевий', category:'Складське обладнання', price:4800, location:'Полтава', condition:'Б/У', status:'Продано', description:'Металевий складський стелаж.', photos:[]}
];

let products = loadProducts();
let selectedPhotos = [];

const $ = (id) => document.getElementById(id);
const catalog = $('catalog');
const stats = $('stats');
const emptyState = $('emptyState');
const adminDialog = $('adminDialog');
const detailDialog = $('detailDialog');

function loadProducts(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [...demoProducts];
  } catch { return [...demoProducts]; }
}
function saveProducts(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(products)); }
function money(value){ return new Intl.NumberFormat('uk-UA').format(Number(value || 0)) + ' грн'; }
function statusClass(status){ return status==='В продажу'?'sale':status==='Заброньовано'?'reserved':'sold'; }

function renderFilters(){
  const select = $('categoryFilter');
  const current = select.value;
  const categories = [...new Set(products.map(p=>p.category).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">Усі категорії</option>' + categories.map(c=>`<option>${escapeHtml(c)}</option>`).join('');
  select.value = categories.includes(current) ? current : 'all';
}

function renderStats(){
  const total = products.length;
  const onSale = products.filter(p=>p.status==='В продажу').length;
  const reserved = products.filter(p=>p.status==='Заброньовано').length;
  const sold = products.filter(p=>p.status==='Продано').length;
  stats.innerHTML = [
    ['Усього позицій',total],['В продажу',onSale],['Заброньовано',reserved],['Продано',sold]
  ].map(([label,val])=>`<div class="stat"><b>${val}</b><span>${label}</span></div>`).join('');
}

function renderCatalog(){
  const q = $('searchInput').value.trim().toLowerCase();
  const category = $('categoryFilter').value;
  const status = $('statusFilter').value;
  const filtered = products.filter(p => {
    const matchesQ = !q || `${p.name} ${p.description} ${p.location}`.toLowerCase().includes(q);
    return matchesQ && (category==='all' || p.category===category) && (status==='all' || p.status===status);
  });

  catalog.innerHTML = filtered.map(p => `
    <article class="card">
      <div class="card-image">
        ${p.photos?.[0] ? `<img src="${p.photos[0]}" alt="${escapeHtml(p.name)}">` : '<div class="no-photo">Немає фото</div>'}
        <span class="badge">${escapeHtml(p.condition || 'Б/У')}</span>
      </div>
      <div class="card-body">
        <span class="status ${statusClass(p.status)}">${escapeHtml(p.status)}</span>
        <h3>${escapeHtml(p.name)}</h3>
        <div class="meta"><span>${escapeHtml(p.category)}</span><span>•</span><span>${escapeHtml(p.location || 'Локація не вказана')}</span></div>
        <div class="price">${money(p.price)}</div>
        <div class="card-actions">
          <button class="btn ghost" onclick="openDetails('${p.id}')">Детальніше</button>
        </div>
      </div>
    </article>`).join('');

  emptyState.classList.toggle('hidden', filtered.length>0);
  renderStats();
  renderFilters();
}

function escapeHtml(str=''){
  return String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

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
    name: $('name').value.trim(),
    category: $('category').value.trim(),
    price: Number($('price').value),
    location: $('location').value.trim(),
    condition: $('condition').value,
    status: $('status').value,
    description: $('description').value.trim(),
    photos: selectedPhotos
  };
  products.unshift(product);
  try { saveProducts(); }
  catch(err){ alert('Браузер не зміг зберегти дані. Спробуй менші фото або видали частину позицій.'); return; }
  e.target.reset(); selectedPhotos=[]; $('photoPreview').innerHTML=''; adminDialog.close(); renderCatalog();
});

$('resetDemoBtn').addEventListener('click',()=>{
  if(confirm('Повернути початкові демо-позиції?')){
    products=[...demoProducts]; saveProducts(); renderCatalog();
  }
});

window.openDetails = function(id){
  const p=products.find(x=>x.id===id); if(!p) return;
  const images=(p.photos||[]);
  $('detailContent').innerHTML = `
    <div class="detail-wrap">
      <div class="dialog-head"><div class="eyebrow">КАРТКА ПОЗИЦІЇ</div><button class="icon-btn" onclick="document.getElementById('detailDialog').close()">✕</button></div>
      <div class="detail-grid">
        <div>
          ${images[0]?`<img id="mainDetailImage" class="detail-main-image" src="${images[0]}">`:'<div class="detail-main-image no-photo">Немає фото</div>'}
          <div class="thumbs">${images.map(src=>`<img src="${src}" onclick="document.getElementById('mainDetailImage').src=this.src">`).join('')}</div>
        </div>
        <div class="detail-side">
          <span class="status ${statusClass(p.status)}">${escapeHtml(p.status)}</span>
          <h2>${escapeHtml(p.name)}</h2>
          <div class="meta"><span>${escapeHtml(p.category)}</span><span>•</span><span>${escapeHtml(p.condition)}</span><span>•</span><span>${escapeHtml(p.location||'')}</span></div>
          <div class="price">${money(p.price)}</div>
          <div class="detail-desc">${escapeHtml(p.description || 'Опис відсутній')}</div>
          <div class="detail-actions">
            <button class="btn danger" onclick="deleteProduct('${p.id}')">Видалити</button>
          </div>
        </div>
      </div>
    </div>`;
  detailDialog.showModal();
}

window.deleteProduct = function(id){
  if(!confirm('Видалити позицію?')) return;
  products=products.filter(p=>p.id!==id); saveProducts(); detailDialog.close(); renderCatalog();
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

renderCatalog();
