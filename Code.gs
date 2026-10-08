const CATALOG_CITIES = ["Біла Церква", "Вінниця", "Дніпро", "Житомир", "Запоріжжя", "Івано-Франківськ", "Київ", "Ковель", "Краматорськ", "Кременчук", "Кривий Ріг", "Кропивницький", "Львів", "Львів 3PL", "Миколаїв", "Мукачево", "Ніжин", "Одеса", "Полтава", "Рівне", "Суми", "Тернопіль", "Харків", "Хмельницький", "ЦО", "Черкаси", "Чернівці", "Чернігів", "Шостка"];
/**
 * Каталог V9: місто, адреса, персональні користувачі та журнал.
 * Встановіть Code.gs, Auth.gs і PasswordCrypto.gs у одному Apps Script.
 * Після setupV9() оновіть чинне введення в дію (нова версія).
 */
const CONFIG = {
  SPREADSHEET_ID: '1r6sDoby5Jfe0_oZbOH_jIlawvDITta0wZToEaPfGGjY',
  DRIVE_FOLDER_ID: '16p7QDpM3K4MUJyCmYaTj_m4v624NOaik',
  SHEET_NAME: 'Catalog',
  ARCHIVE_SHEET_NAME: 'Archive',
  DEFAULT_CITY: 'Чернігів',
  DEFAULT_ADDRESS: 'вул. Інструментальна, 34а'
};
const HEADERS = ['Article','Name','AccountingName','Quantity','Category','PhotosJSON','UpdatedAt','City','Address'];
// DeletedAt лишається в H для сумісності з архівом V6.
const ARCHIVE_HEADERS = HEADERS.slice(0,7).concat(['DeletedAt','City','Address']);

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'list');
  let result;
  try {
    if (action === 'list') result = {ok:true, schemaVersion:9, products:listProducts_()};
    else if (action === 'capabilities') result = {ok:true, schemaVersion:9, personalLogin:true};
    else if (action === 'image') result = imageData_(String((e && e.parameter && e.parameter.id) || ''));
    else result = {ok:false,error:'Unknown action'};
  } catch (err) { result = {ok:false,error:String(err && err.message || err)}; }
  return output_(result, e && e.parameter ? e.parameter.prefix : '');
}

function doPost(e) {
  let req={},result,lock=null;
  try {
    const raw=(e&&e.parameter&&e.parameter.payload)||(e&&e.postData&&e.postData.contents)||'{}';
    req=JSON.parse(raw);
    if(String(req.origin||'')!==AUTH.ORIGIN)throw new Error('Недозволена адреса сайту.');
    if(req.action==='login') result=loginUser_(req.login,req.password);
    else {
      const actor=requireActor_(String(req.token||''));
      if(req.action==='session')result={ok:true,user:publicUser_(actor)};
      else if(req.action==='logout'){
        PropertiesService.getScriptProperties().deleteProperty(tokenKey_(req.token));result={ok:true};
      }
      else if(req.action==='listUsers'){
        requireRole_(actor,['admin']);result={ok:true,users:users_().map(publicUser_)};
      }
      else if(req.action==='history'){
        requireRole_(actor,['admin']);
        const sh=authSheet_('History'),n=sh.getLastRow(),count=Math.min(100,Math.max(0,n-1));
        const rows=count?sh.getRange(n-count+1,1,count,6).getValues().reverse():[];
        result={ok:true,history:rows.map(r=>({timestamp:r[0] instanceof Date?r[0].toISOString():String(r[0]),name:r[1],login:r[2],action:r[3],article:r[4],summary:r[5]}))};
      }
      else {
        lock=LockService.getScriptLock();lock.waitLock(30000);
        authSheet_('History'); // перевіряємо журнал до зміни каталогу
        if(req.action==='saveUser')result=saveUser_(req.user||{},actor);
        else if(req.action==='upsert'){
          requireRole_(actor,['photo','editor','admin']);
          let product=req.product||{};
          const before=listProducts_().find(x=>x.article===String(product.article||''))||null;
          if(actor.role==='photo'){
            if(!before)throw new Error('Ця роль дозволяє лише додавати фото до існуючих позицій.');
            product=Object.assign({},product,{name:before.name,accountingName:before.accountingName,quantity:before.quantity,category:before.category,city:before.city,address:before.address,removePhotoKeys:[],keepPhotos:before.photos});
          }
          const after=upsert_(product);
          auditV9_(actor,before?'UPDATE':'CREATE',after.article,before,after,productSummary_(before,after));
          result={ok:true,product:after};
        }
        else if(req.action==='delete'){
          requireRole_(actor,['admin']);const article=String(req.article||'');
          const before=listProducts_().find(x=>x.article===article)||null;
          archiveDelete_(article);auditV9_(actor,'DELETE',article,before,null,'Позицію перенесено в архів');result={ok:true,archived:true};
        }
        else if(req.action==='restore'){
          requireRole_(actor,['admin']);const article=String(req.article||''),after=restoreFromArchive_(article);
          auditV9_(actor,'RESTORE',article,null,after,'Позицію відновлено з архіву');result={ok:true,product:after};
        }
        else throw new Error('Невідома дія.');
      }
    }
  } catch(err){result={ok:false,error:String(err&&err.message||err)};}
  finally{if(lock)lock.releaseLock();}
  return postResult_(req,result);
}

function output_(obj, prefix) {
  const json = JSON.stringify(obj);
  if (prefix && /^[A-Za-z_$][\w$]*$/.test(prefix)) {
    return ContentService.createTextOutput(prefix + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  if (CONFIG.SPREADSHEET_ID.indexOf('PASTE_') === 0) throw new Error('Set SPREADSHEET_ID in Code.gs');
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);
  sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  return sh;
}
function listProducts_() {
  const sh=sheet_(), last=sh.getLastRow(); if(last<2)return [];
  const vals=sh.getRange(2,1,last-1,HEADERS.length).getValues();
  return vals.filter(r=>String(r[0]).trim()).map(r=>({
    article:String(r[0]),name:String(r[1]),accountingName:String(r[2]||''),quantity:Number(r[3]||0),category:String(r[4]||'Інше'),
    photos:parsePhotos_(r[5]),updatedAt:r[6] instanceof Date ? r[6].toISOString() : String(r[6]||''), city:canonicalCity_(r[7]||CONFIG.DEFAULT_CITY), address:r[8]===undefined?CONFIG.DEFAULT_ADDRESS:String(r[8]||'')
  }));
}
function parsePhotos_(v){try{const x=JSON.parse(String(v||'[]'));return Array.isArray(x)?x:[]}catch(e){return []}}
function photoKey_(p){
  if(!p) return '';
  return String(p.id || driveId_(p.url) || p.url || p.name || '').trim();
}
function mergePhotos_(...lists){
  const out=[], seen={};
  lists.forEach(list=>(Array.isArray(list)?list:[]).forEach(p=>{
    if(!p) return;
    const q={name:String(p.name||'Фото'),url:String(p.url||''),id:String(p.id||driveId_(p.url)||'')};
    const k=photoKey_(q); if(!k || seen[k]) return; seen[k]=true; out.push(q);
  }));
  return out;
}
function currentPhotos_(sh, row){
  if(!row) return [];
  return parsePhotos_(sh.getRange(row,6).getValue());
}


function allowedPhotoIds_(){
  const cache=CacheService.getScriptCache();
  const cached=cache.get('catalog_photo_ids_v1');
  if(cached) return new Set(cached.split(',').filter(Boolean));
  const sh=sheet_(), last=sh.getLastRow(), ids=[];
  if(last>=2){
    const vals=sh.getRange(2,6,last-1,1).getValues();
    vals.forEach(r=>parsePhotos_(r[0]).forEach(p=>{
      const id=String(p && (p.id || driveId_(p.url)) || '').trim();
      if(id && ids.indexOf(id)===-1) ids.push(id);
    }));
  }
  try{cache.put('catalog_photo_ids_v1',ids.join(','),300)}catch(e){}
  return new Set(ids);
}
function imageData_(id){
  id=String(id||'').trim();
  if(!/^[A-Za-z0-9_-]{15,}$/.test(id)) return {ok:false,error:'Invalid image id'};
  if(!allowedPhotoIds_().has(id)) return {ok:false,error:'Image is not linked to catalog'};
  const file=DriveApp.getFileById(id), blob=file.getBlob();
  const bytes=blob.getBytes();
  // JSONP/base64 is only an emergency fallback for browsers that cannot hot-link Drive images.
  if(bytes.length>4500000) return {ok:false,error:'Image too large for proxy fallback'};
  const mime=blob.getContentType()||'image/jpeg';
  return {ok:true,dataUrl:'data:'+mime+';base64,'+Utilities.base64Encode(bytes)};
}
function clearPhotoCache_(){
  try{CacheService.getScriptCache().remove('catalog_photo_ids_v1')}catch(e){}
}
function upsert_(p) {
  const article=String(p.article||'').trim(), name=String(p.name||'').trim(); if(!article||!name)throw new Error('Article and Name are required');
  const sh=sheet_(), found=findRow_(sh,article);
  // Сервер є джерелом істини: ніколи не стираємо старі фото лише через те, що телефон відкрив застарілу картку.
  let photos=currentPhotos_(sh,found);
  const removeKeys=new Set((Array.isArray(p.removePhotoKeys)?p.removePhotoKeys:[]).map(String));
  if(removeKeys.size) photos=photos.filter(x=>!removeKeys.has(photoKey_(x)));
  // keepPhotos додаємо як страховку для старих версій сайту, але не використовуємо їх для заміни всього масиву.
  photos=mergePhotos_(photos, Array.isArray(p.keepPhotos)?p.keepPhotos:[]);
  const external=[];
  (Array.isArray(p.externalPhotoUrls)?p.externalPhotoUrls:[]).forEach((url,i)=>{ const id=driveId_(url); external.push({name:'Google Drive '+(i+1),url:String(url),id:id||''}); });
  photos=mergePhotos_(photos,external);
  const uploads=Array.isArray(p.uploads)?p.uploads:[];
  if(uploads.length){
    if(CONFIG.DRIVE_FOLDER_ID.indexOf('PASTE_')===0)throw new Error('Set DRIVE_FOLDER_ID in Code.gs');
    const folder=DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID), added=[];
    uploads.forEach((u,i)=>{
      const m=String(u.dataUrl||'').match(/^data:([^;]+);base64,(.+)$/); if(!m)throw new Error('Invalid image data');
      const bytes=Utilities.base64Decode(m[2]); const safe=article.replace(/[^A-Za-z0-9А-Яа-яІіЇїЄє_-]+/g,'_'); const ext=(m[1].split('/')[1]||'jpg').replace('jpeg','jpg');
      const fname=safe+'_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'Etc/GMT','yyyyMMdd_HHmmss')+'_'+(i+1)+'.'+ext;
      const file=folder.createFile(Utilities.newBlob(bytes,m[1],fname));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
      added.push({name:file.getName(),url:file.getUrl(),id:file.getId()});
    });
    photos=mergePhotos_(photos,added);
  }
  const previous=found?sh.getRange(found,1,1,HEADERS.length).getValues()[0]:[];
  const city=canonicalCity_(p.city===undefined?(previous[7]||CONFIG.DEFAULT_CITY):p.city);
  if(!city)throw new Error('Вкажіть місто або локацію.');
  const address=String(p.address===undefined?(previous[8]||''):(p.address||'')).trim();
  const now=new Date();
  const row=[article,name,String(p.accountingName||''),Number(p.quantity||0),String(p.category||'Інше'),JSON.stringify(photos),now,city,address];
  if(found)sh.getRange(found,1,1,HEADERS.length).setValues([row]); else sh.appendRow(row);
  clearPhotoCache_();
  return {article:article,name:name,accountingName:String(p.accountingName||''),quantity:Number(p.quantity||0),category:String(p.category||'Інше'),photos:photos,updatedAt:now.toISOString(),city:city,address:address};
}
function archiveSheet_(){
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sh=ss.getSheetByName(CONFIG.ARCHIVE_SHEET_NAME);
  if(!sh) sh=ss.insertSheet(CONFIG.ARCHIVE_SHEET_NAME);
  sh.getRange(1,1,1,ARCHIVE_HEADERS.length).setValues([ARCHIVE_HEADERS]);
  return sh;
}
function archiveDelete_(article){
  article=String(article||'').trim(); if(!article) throw new Error('Article is required');
  const sh=sheet_(), row=findRow_(sh,article); if(!row) throw new Error('Position not found');
  const values=sh.getRange(row,1,1,HEADERS.length).getValues()[0];
  archiveSheet_().appendRow(values.slice(0,7).concat([new Date(),values[7]||CONFIG.DEFAULT_CITY,values[8]||'']));
  sh.deleteRow(row); clearPhotoCache_(); return true;
}
function restoreFromArchive_(article){
  article=String(article||'').trim(); if(!article) throw new Error('Article is required');
  const sh=sheet_(); if(findRow_(sh,article)) throw new Error('Position already exists in Catalog');
  const ar=archiveSheet_(), last=ar.getLastRow(); if(last<2) throw new Error('Archive is empty');
  const vals=ar.getRange(2,1,last-1,ARCHIVE_HEADERS.length).getValues();
  let idx=-1; for(let i=vals.length-1;i>=0;i--){if(String(vals[i][0]).trim()===article){idx=i;break;}}
  if(idx<0) throw new Error('Position not found in Archive');
  const src=vals[idx];
  const restored=src.slice(0,7).concat([canonicalCity_(src[8]||CONFIG.DEFAULT_CITY),src.length>9?String(src[9]||''):CONFIG.DEFAULT_ADDRESS]); restored[6]=new Date();
  sh.appendRow(restored); ar.deleteRow(idx+2); clearPhotoCache_();
  return {article:String(restored[0]),name:String(restored[1]),accountingName:String(restored[2]||''),quantity:Number(restored[3]||0),category:String(restored[4]||'Інше'),photos:parsePhotos_(restored[5]),updatedAt:new Date().toISOString(),city:String(restored[7]),address:String(restored[8])};
}
function findRow_(sh,article){const last=sh.getLastRow();if(last<2)return 0;const f=sh.getRange(2,1,last-1,1).createTextFinder(article).matchEntireCell(true).findNext();return f?f.getRow():0}
function driveId_(url){const s=String(url||'');let m=s.match(/\/d\/([\w-]+)/)||s.match(/[?&]id=([\w-]+)/);return m?m[1]:''}
function safeEqual_(a,b){if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
function setup(){sheet_();Logger.log('Catalog sheet is ready. Run seedCatalog() next if you want to import the supplied Excel catalog.');}

/** Один раз після встановлення: додає місто й адресу лише у порожні поля. */
function prepareLocation(){
  const sh=sheet_(); archiveSheet_();
  const last=sh.getLastRow();
  if(last>1){
    const rows=sh.getRange(2,1,last-1,HEADERS.length).getValues();
    const locations=rows.map(r=>{const city=canonicalCity_(r[7]||CONFIG.DEFAULT_CITY);return [city,String(r[8]|| (city===canonicalCity_(CONFIG.DEFAULT_CITY)?CONFIG.DEFAULT_ADDRESS:''))];});
    sh.getRange(2,8,locations.length,2).setValues(locations);
  }
  Logger.log('Місто та адресу додано.');
}
