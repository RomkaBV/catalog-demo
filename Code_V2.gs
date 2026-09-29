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
  SHEET_NAME: 'Catalog'
};
const HEADERS = ['Article','Name','AccountingName','Quantity','Category','PhotosJSON','UpdatedAt'];

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'list');
  let result;
  try {
    if (action === 'list') result = {ok:true, products:listProducts_()};
    else result = {ok:false,error:'Unknown action'};
  } catch (err) { result = {ok:false,error:String(err && err.message || err)}; }
  return output_(result, e && e.parameter ? e.parameter.prefix : '');
}

function doPost(e) {
  let result;
  try {
    const raw = (e && e.parameter && e.parameter.payload) || (e && e.postData && e.postData.contents) || '{}';
    const req = JSON.parse(raw);
    if (!safeEqual_(String(req.key||''), CONFIG.ADMIN_KEY)) throw new Error('Unauthorized');
    if (req.action === 'upsert') result = {ok:true, product:upsert_(req.product||{})};
    else if (req.action === 'delete') { delete_(String(req.article||'')); result={ok:true}; }
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
  return {article:article,name:name,accountingName:String(p.accountingName||''),quantity:Number(p.quantity||0),category:String(p.category||'Інше'),photos:photos,updatedAt:now.toISOString()};
}
function delete_(article){const sh=sheet_(),row=findRow_(sh,article);if(row)sh.deleteRow(row)}
function findRow_(sh,article){const last=sh.getLastRow();if(last<2)return 0;const f=sh.getRange(2,1,last-1,1).createTextFinder(article).matchEntireCell(true).findNext();return f?f.getRow():0}
function driveId_(url){const s=String(url||'');let m=s.match(/\/d\/([\w-]+)/)||s.match(/[?&]id=([\w-]+)/);return m?m[1]:''}
function safeEqual_(a,b){if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
function setup(){sheet_();Logger.log('Catalog sheet is ready. Run seedCatalog() next if you want to import the supplied Excel catalog.');}
