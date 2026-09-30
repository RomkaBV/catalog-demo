/**
 * Backend для каталогу на GitHub Pages.
 * 1) Створіть Google Sheet та папку Google Drive.
 * 2) Вкажіть їх ID нижче та змініть ADMIN_KEY.
 * 3) Deploy -> New deployment -> Web app -> Execute as Me -> Who has access: Anyone.
 * 4) Вставте /exec URL у config.js на GitHub.
 */
const CONFIG = {
  SPREADSHEET_ID: '1r6sDoby5Jfe0_oZbOH_jIlawvDITta0wZToEaPfGGjY',
  DRIVE_FOLDER_ID: '16p7QDpM3K4MUJyCmYaTj_m4v624NOaik',
  ADMIN_KEY: '903993',
  DELETE_KEY: 'CHANGE_ME_DELETE_PASSWORD',
  SHEET_NAME: 'Catalog',
  ARCHIVE_SHEET_NAME: 'Archive'
};
const HEADERS = ['Article','Name','AccountingName','Quantity','Category','PhotosJSON','UpdatedAt'];
const ARCHIVE_HEADERS = HEADERS.concat(['DeletedAt']);

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'list');
  let result;
  try {
    if (action === 'list') result = {ok:true, products:listProducts_()};
    else if (action === 'image') result = imageData_(String((e && e.parameter && e.parameter.id) || ''));
    else result = {ok:false,error:'Unknown action'};
  } catch (err) { result = {ok:false,error:String(err && err.message || err)}; }
  return output_(result, e && e.parameter ? e.parameter.prefix : '');
}

function doPost(e) {
  let result;
  try {
    const raw = (e && e.parameter && e.parameter.payload) || (e && e.postData && e.postData.contents) || '{}';
    const req = JSON.parse(raw);
    if (req.action === 'upsert') {
      if (!safeEqual_(String(req.key||''), CONFIG.ADMIN_KEY)) throw new Error('Unauthorized');
      result = {ok:true, product:upsert_(req.product||{})};
    }
    else if (req.action === 'delete') {
      if (!safeEqual_(String(req.key||''), CONFIG.ADMIN_KEY)) throw new Error('Unauthorized');
      if (!safeEqual_(String(req.deleteKey||''), CONFIG.DELETE_KEY)) throw new Error('Delete password is incorrect');
      result = {ok:true, archived:archiveDelete_(String(req.article||''))};
    }
    else if (req.action === 'restore') {
      if (!safeEqual_(String(req.key||''), CONFIG.ADMIN_KEY)) throw new Error('Unauthorized');
      if (!safeEqual_(String(req.deleteKey||''), CONFIG.DELETE_KEY)) throw new Error('Delete password is incorrect');
      result = {ok:true, product:restoreFromArchive_(String(req.article||''))};
    }
    else result={ok:false,error:'Unknown action'};
  } catch (err) { result={ok:false,error:String(err && err.message || err)}; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
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
  if (sh.getLastRow() === 0) sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  return sh;
}
function listProducts_() {
  const sh=sheet_(), last=sh.getLastRow(); if(last<2)return [];
  const vals=sh.getRange(2,1,last-1,HEADERS.length).getValues();
  return vals.filter(r=>String(r[0]).trim()).map(r=>({
    article:String(r[0]),name:String(r[1]),accountingName:String(r[2]||''),quantity:Number(r[3]||0),category:String(r[4]||'Інше'),
    photos:parsePhotos_(r[5]),updatedAt:r[6] instanceof Date ? r[6].toISOString() : String(r[6]||'')
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
  const now=new Date();
  const row=[article,name,String(p.accountingName||''),Number(p.quantity||0),String(p.category||'Інше'),JSON.stringify(photos),now];
  if(found)sh.getRange(found,1,1,HEADERS.length).setValues([row]); else sh.appendRow(row);
  clearPhotoCache_();
  return {article:article,name:name,accountingName:String(p.accountingName||''),quantity:Number(p.quantity||0),category:String(p.category||'Інше'),photos:photos,updatedAt:now.toISOString()};
}
function archiveSheet_(){
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sh=ss.getSheetByName(CONFIG.ARCHIVE_SHEET_NAME);
  if(!sh) sh=ss.insertSheet(CONFIG.ARCHIVE_SHEET_NAME);
  if(sh.getLastRow()===0) sh.getRange(1,1,1,ARCHIVE_HEADERS.length).setValues([ARCHIVE_HEADERS]);
  return sh;
}
function archiveDelete_(article){
  article=String(article||'').trim(); if(!article) throw new Error('Article is required');
  const sh=sheet_(), row=findRow_(sh,article); if(!row) throw new Error('Position not found');
  const values=sh.getRange(row,1,1,HEADERS.length).getValues()[0];
  archiveSheet_().appendRow(values.concat([new Date()]));
  sh.deleteRow(row); clearPhotoCache_(); return true;
}
function restoreFromArchive_(article){
  article=String(article||'').trim(); if(!article) throw new Error('Article is required');
  const sh=sheet_(); if(findRow_(sh,article)) throw new Error('Position already exists in Catalog');
  const ar=archiveSheet_(), last=ar.getLastRow(); if(last<2) throw new Error('Archive is empty');
  const vals=ar.getRange(2,1,last-1,ARCHIVE_HEADERS.length).getValues();
  let idx=-1; for(let i=vals.length-1;i>=0;i--){if(String(vals[i][0]).trim()===article){idx=i;break;}}
  if(idx<0) throw new Error('Position not found in Archive');
  const restored=vals[idx].slice(0,HEADERS.length); restored[6]=new Date();
  sh.appendRow(restored); ar.deleteRow(idx+2); clearPhotoCache_();
  return {article:String(restored[0]),name:String(restored[1]),accountingName:String(restored[2]||''),quantity:Number(restored[3]||0),category:String(restored[4]||'Інше'),photos:parsePhotos_(restored[5]),updatedAt:new Date().toISOString()};
}
function findRow_(sh,article){const last=sh.getLastRow();if(last<2)return 0;const f=sh.getRange(2,1,last-1,1).createTextFinder(article).matchEntireCell(true).findNext();return f?f.getRow():0}
function driveId_(url){const s=String(url||'');let m=s.match(/\/d\/([\w-]+)/)||s.match(/[?&]id=([\w-]+)/);return m?m[1]:''}
function safeEqual_(a,b){if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
function setup(){sheet_();Logger.log('Catalog sheet is ready. Run seedCatalog() next if you want to import the supplied Excel catalog.');}
