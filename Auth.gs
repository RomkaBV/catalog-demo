/** Персональний доступ V9. Users і History — у окремій приватній таблиці. */
const AUTH = {
  ORIGIN: 'https://romkabv.github.io',
  SESSION_HOURS: 8,
  PASSWORD_ITERATIONS: 600000,
  USERS_HEADERS: ['ID','Login','Name','Role','Active','Salt','PasswordHash','Iterations','AuthVersion','UpdatedAt'],
  HISTORY_HEADERS: ['Timestamp','User','Login','Action','Article','Summary','BeforeJSON','AfterJSON']
};
function authBook_(){
  const id=PropertiesService.getScriptProperties().getProperty('CATALOG_AUTH_BOOK_ID');
  if(!id) throw new Error('Оновіть Apps Script і запустіть setupV9().');
  return SpreadsheetApp.openById(id);
}
function authSheet_(name){
  const sh=authBook_().getSheetByName(name);
  if(!sh) throw new Error('Немає аркуша '+name+'. Запустіть setupV9().');
  return sh;
}
function canonicalCity_(value){
  const s=String(value||'').trim().replace(/^м\.\s*/i,'').replace(/\s+/g,' ');
  const known=CATALOG_CITIES.find(x=>x.toLowerCase()===s.toLowerCase());
  return known||s;
}
function normalizeLogin_(v){return String(v||'').trim().toLowerCase();}
function users_(){
  const sh=authSheet_('Users'),n=sh.getLastRow();
  if(n<2)return [];
  return sh.getRange(2,1,n-1,AUTH.USERS_HEADERS.length).getValues().map((r,i)=>({
    row:i+2,id:String(r[0]),login:String(r[1]),name:String(r[2]),role:String(r[3]),active:r[4]===true||String(r[4]).toLowerCase()==='true',
    salt:String(r[5]),hash:String(r[6]),iterations:Number(r[7]),version:Number(r[8]),updatedAt:r[9]
  })).filter(u=>u.id);
}
function publicUser_(u){return {id:u.id,login:u.login,name:u.name,role:u.role,active:u.active};}
function authPepper_(){
  const p=PropertiesService.getScriptProperties(),v=p.getProperty('CATALOG_PASSWORD_PEPPER');
  if(!v)throw new Error('Запустіть setupV9().');return v;
}
function passwordHash_(password,salt,iterations){
  return CryptoJS.PBKDF2(String(password)+authPepper_(),salt,{keySize:8,iterations:iterations,hasher:CryptoJS.algo.SHA256}).toString();
}
function tokenKey_(token){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(token),Utilities.Charset.UTF_8);
  return 'CATALOG_SESSION_'+Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}
function cleanSessions_(){
  const props=PropertiesService.getScriptProperties(),all=props.getProperties(),now=Date.now();
  Object.keys(all).filter(k=>k.indexOf('CATALOG_SESSION_')===0).forEach(k=>{
    try{if(JSON.parse(all[k]).expiresAt<=now)props.deleteProperty(k);}catch(e){props.deleteProperty(k);}
  });
}
function createSession_(u){
  cleanSessions_();
  const token=Utilities.getUuid()+Utilities.getUuid(),expiresAt=Date.now()+AUTH.SESSION_HOURS*3600000;
  PropertiesService.getScriptProperties().setProperty(tokenKey_(token),JSON.stringify({id:u.id,version:u.version,expiresAt:expiresAt}));
  return {ok:true,token:token,expiresAt:expiresAt,user:publicUser_(u)};
}
function requireActor_(token){
  if(!token)throw new Error('Увійдіть під своїм логіном і паролем.');
  const props=PropertiesService.getScriptProperties(),key=tokenKey_(token),raw=props.getProperty(key);
  let session;try{session=JSON.parse(raw||'null');}catch(e){}
  if(!session||session.expiresAt<=Date.now()){props.deleteProperty(key);throw new Error('Сеанс завершився. Увійдіть ще раз.');}
  const u=users_().find(x=>x.id===session.id);
  if(!u||!u.active||u.version!==session.version){props.deleteProperty(key);throw new Error('Доступ змінено або заблоковано. Увійдіть ще раз.');}
  return u;
}
function requireRole_(actor,roles){if(!roles.includes(actor.role))throw new Error('Для цієї дії немає прав доступу.');}
function loginUser_(login,password){
  const key=normalizeLogin_(login);if(!key||!password)throw new Error('Вкажіть логін і пароль.');
  const cache=CacheService.getScriptCache(),rateKey='login_'+tokenKey_(key),failures=Number(cache.get(rateKey)||0);
  if(failures>=5)throw new Error('Забагато невдалих спроб. Повторіть через 10 хвилин.');
  const u=users_().find(x=>x.login===key);
  if(!u||!u.active||!safeEqual_(passwordHash_(password,u.salt,u.iterations),u.hash)){
    cache.put(rateKey,String(failures+1),600);throw new Error('Неправильний логін або пароль.');
  }
  cache.remove(rateKey);const session=createSession_(u);auditV9_(u,'LOGIN','',null,null,'Вхід користувача');return session;
}
function saveUser_(data,actor){
  requireRole_(actor,['admin']);
  const login=normalizeLogin_(data.login),name=String(data.name||'').trim(),role=String(data.role||'viewer'),password=String(data.password||'');
  if(!/^[a-z0-9][a-z0-9._@+-]{2,79}$/.test(login))throw new Error('Логін: 3–80 латинських літер, цифр або . _ @ + -');
  if(!name)throw new Error('Вкажіть ПІБ користувача.');
  if(!['viewer','photo','editor','admin'].includes(role))throw new Error('Невідома роль.');
  const list=users_(),old=data.id?list.find(x=>x.id===String(data.id)):null;
  if(data.id&&!old)throw new Error('Користувача не знайдено.');
  if(list.some(x=>x.login===login&&(!old||x.id!==old.id)))throw new Error('Такий логін уже існує.');
  if(!old&&!password)throw new Error('Задайте пароль нового користувача.');
  if(password&&password.length<10)throw new Error('Пароль має містити щонайменше 10 символів.');
  if(password.length>256)throw new Error('Пароль занадто довгий.');
  const active=data.active!==false;
  if(old&&old.id===actor.id&&(!active||role!=='admin'))throw new Error('Не можна заблокувати себе або прибрати власну роль адміністратора.');
  if(old&&old.active&&old.role==='admin'&&(!active||role!=='admin')&&list.filter(x=>x.active&&x.role==='admin').length<=1)throw new Error('Має залишитися активний адміністратор.');
  const salt=password?Utilities.getUuid()+Utilities.getUuid():old.salt,iterations=password?AUTH.PASSWORD_ITERATIONS:old.iterations;
  const hash=password?passwordHash_(password,salt,iterations):old.hash;
  const id=old?old.id:Utilities.getUuid(),version=old?old.version+1:1;
  const row=[id,login,name,role,active,salt,hash,iterations,version,new Date()],sh=authSheet_('Users');
  if(old)sh.getRange(old.row,1,1,row.length).setValues([row]);else sh.appendRow(row);
  const result={id:id,login:login,name:name,role:role,active:active};
  auditV9_(actor,old?'USER_UPDATE':'USER_CREATE','',old?publicUser_(old):null,result,password?'Користувач: '+login+'; пароль встановлено/змінено':'Користувач: '+login+'; оновлено доступ');
  return {ok:true,user:result};
}
function historyJson_(data){const s=JSON.stringify(data??null);return s.length>45000?s.slice(0,44900)+' [скорочено]':s;}
function auditV9_(actor,action,article,before,after,summary){
  // Паролі, хеші та токени не потрапляють до History.
  authSheet_('History').appendRow([new Date(),actor.name,actor.login,action,String(article||''),String(summary||''),historyJson_(before),historyJson_(after)]);
}
function productSummary_(before,after){
  const changed=['name','quantity','category','city','address'].filter(k=>String(before?.[k]??'')!==String(after?.[k]??''));
  const bp=(before?.photos||[]).map(photoKey_),ap=(after?.photos||[]).map(photoKey_);
  const added=ap.filter(x=>!bp.includes(x)).length,removed=bp.filter(x=>!ap.includes(x)).length;
  return 'Поля: '+changed.join(', ')+(added?'; додано фото: '+added:'')+(removed?'; прибрано фото: '+removed:'');
}
function postResult_(req,result){
  const origin=String(req.origin||'');
  if(origin!==AUTH.ORIGIN)return ContentService.createTextOutput(JSON.stringify({ok:false,error:'Недозволена адреса сайту.'})).setMimeType(ContentService.MimeType.JSON);
  const message=JSON.stringify({channel:'catalog-v9',requestId:String(req.requestId||''),result:result}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+message+','+JSON.stringify(AUTH.ORIGIN)+');</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function setupV9(){
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const p=PropertiesService.getScriptProperties();
    if(!p.getProperty('CATALOG_PASSWORD_PEPPER'))p.setProperty('CATALOG_PASSWORD_PEPPER',Utilities.getUuid()+Utilities.getUuid());
    let id=p.getProperty('CATALOG_AUTH_BOOK_ID');
    if(!id){
      const book=SpreadsheetApp.create('БУ Каталог — Користувачі та журнал');id=book.getId();p.setProperty('CATALOG_AUTH_BOOK_ID',id);
      const first=book.getSheets()[0];first.setName('Users');first.getRange(1,1,1,AUTH.USERS_HEADERS.length).setValues([AUTH.USERS_HEADERS]);first.setFrozenRows(1);
      const history=book.insertSheet('History');history.getRange(1,1,1,AUTH.HISTORY_HEADERS.length).setValues([AUTH.HISTORY_HEADERS]);history.setFrozenRows(1);
    }
    prepareLocation();
    const initial=p.getProperty('INITIAL_ADMIN_PASSWORD');
    if(users_().length===0){
      if(!initial||initial.length<10)throw new Error('У налаштуваннях проєкту додайте властивість INITIAL_ADMIN_PASSWORD (мінімум 10 символів), потім ще раз запустіть setupV9().');
      saveUser_({login:'admin',name:'Адміністратор',role:'admin',active:true,password:initial},{id:'bootstrap',name:'Налаштування',login:'SYSTEM',role:'admin'});
    }
    p.deleteProperty('INITIAL_ADMIN_PASSWORD');
    Logger.log('V9 готова. Приватна таблиця користувачів: '+authBook_().getUrl());
  }finally{lock.releaseLock();}
}
function usersSpreadsheetUrl(){Logger.log(authBook_().getUrl());return authBook_().getUrl();}
