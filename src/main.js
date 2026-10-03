import './style.css';
import { RoomStore } from './store.js';
import { TYPES, escapeHTML as esc, dateKey, dateObject, shiftDate, timeLabel, hasRecord, overlaps, layoutBlocks, validateBackup } from './model.js';

const store=new RoomStore(); const app=document.querySelector('#app');
let date=dateKey(), view='today', month=date.slice(0,7), touchMode=false, dialog=null, noticeTimer;
const icon=(name)=> {
  const paths={today:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12 8h4M12 12h4M12 16h3"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 17h2"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]||''}</svg>`;
};
const toast=message=> {const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.classList.remove('visible'),3500);};
const disabled=()=>store.readOnly || store.tabReadOnly || date > dateKey();
const nav=()=>`<nav aria-label="メインナビゲーション">${[['today','TODAY'],['calendar','CALENDAR'],['settings','SETTINGS']].map(([id,label])=>`<button data-nav="${id}" ${view===id?'aria-current="page"':''}>${icon(id)}<span>${label}</span></button>`).join('')}</nav>`;
function render() {
  if(dialog) return;
  const active=document.activeElement, focusedLine=active?.id==='line';
  if(focusedLine && store.mode!=='login') { updateStatus(); renderBlocks(); return; }
  if(store.mode==='login') {
    app.innerHTML=`<main class="login-paper"><img class="login-icon" src="./icons/icon-512.png" alt=""><p class="eyebrow">A SMALL RECORD OF EVERY DAY</p><h1>DAILY<br>ROOM<span class="red-dot">.</span></h1><p class="login-message">今日を、少しだけ残す。</p><div class="login-actions">${store.configured?'<button class="primary" id="login">Googleでログイン</button><p class="small">記録は、同じGoogleアカウントの端末で見返せる。</p>':'<p class="setup-note">同期の接続準備中</p><button class="primary" id="trial">この端末で試す</button><p class="small">ここでの記録はこの端末に保存される。<br>同期への移行にはJSONバックアップを使える。</p>'}<p class="error" role="alert">${esc(store.error)}</p></div><footer>一行だけでも、空白の日があっても。</footer></main>`;
    if(store.configured && store.hasTrial()) {
      const button=document.createElement('button');button.className='text-button';button.id='trial';button.textContent='この端末の試用記録を開く';document.querySelector('.login-actions').append(button);
    }
    document.querySelector('#trial')?.addEventListener('click',()=>store.trial());
    document.querySelector('#login')?.addEventListener('click',()=>store.login()); return;
  }
  app.innerHTML=`<div class="notebook"><header class="masthead"><button class="wordmark" data-nav="today">DAILY ROOM<span class="red-dot">.</span></button><span class="edition">PERSONAL NOTEBOOK / 01</span><div class="top-status" id="status" role="status">${esc(store.status)}</div></header>${nav()}<main id="content">${view==='today'?todayHTML():view==='calendar'?calendarHTML():settingsHTML()}</main><footer class="page-footer"><span>DAILY ROOM</span><span>今日を、少しだけ残す。</span><span>v0.1.0</span></footer></div>`;
  app.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{view=b.dataset.nav;if(view==='calendar') month=date.slice(0,7);render();window.scrollTo(0,0);});
  if(view==='today') bindToday(); if(view==='calendar') bindCalendar(); if(view==='settings') bindSettings(); updateStatus();
}
function updateStatus() {
  const status=document.querySelector('#status'); if(status) status.textContent=store.status;
  const saved=document.querySelector('#line-status'); if(saved) saved.textContent=store.status;
  const error=document.querySelector('#save-error'); if(error) error.textContent=store.error;
  const warning=document.querySelector('#conflict-box');
  if(warning) { warning.hidden=!store.data.conflicts[date]; warning.querySelector('button')?.addEventListener('click',()=>conflictDialog(date),{once:true}); }
}
function todayHTML() {
  const d=dateObject(date), day=store.day(date); const future=date>dateKey();
  return `<div class="day-layout"><aside class="day-note"><section class="date-section"><div class="eyebrow">${date===dateKey()?'TODAY':'DAY RECORD'}</div><div class="date-controls"><button class="icon-btn" id="prev-day" aria-label="前の日">${icon('left')}</button><span class="date-year">${d.getFullYear()} / ${String(d.getMonth()+1).padStart(2,'0')}</span><button class="icon-btn" id="next-day" aria-label="次の日" ${date>=dateKey()?'disabled':''}>${icon('right')}</button></div><div class="date-stamp"><span>${String(d.getDate()).padStart(2,'0')}</span><b>${['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()]}</b></div><div class="date-bottom"><input id="date-picker" type="date" max="${dateKey()}" value="${date}" aria-label="記録する日付"><button class="text-button" id="go-today">今日へ</button></div></section><section class="line-section"><div class="section-head"><label class="eyebrow" for="line">TODAY'S LINE</label><span id="char-count" class="small">${day.line.length} / 200</span></div><textarea id="line" maxlength="200" rows="4" placeholder="今日は、どんな一日だった？" ${disabled()?'disabled':''}>${esc(day.line)}</textarea><span class="small line-status" id="line-status" role="status">${esc(store.status)}</span></section><p class="quiet-note">一行だけでも。<br>思い出せる時間だけでも。</p>${store.mode==='local'?'<div class="local-note">端末内のお試し<br><span>同期する前に、設定からJSONを書き出せる。</span></div>':''}<p id="save-error" class="error" role="alert"></p><div id="conflict-box" class="conflict-box" hidden><p>同じ日の記録が、別の端末でも更新された。</p><button class="primary">両方の記録を確認</button></div>${future?'<p class="small">未来の日は閲覧のみ。</p>':''}</aside><section class="timeline-section"><div class="timeline-heading"><div><h2>TIMELINE</h2><p class="small desktop-help">時間をドラッグして、記録を残す。</p><p class="small touch-help">「指で記録」で時間をドラッグ。通常はスクロール。</p></div><div class="timeline-actions"><button class="touch-toggle ${touchMode?'active':''}" id="touch-toggle" aria-pressed="${touchMode}" ${disabled()?'disabled':''}>${touchMode?'記録中・終了':'指で記録'}</button><button class="icon-btn add-btn" id="add-block" aria-label="時間を指定して記録を追加" ${disabled()?'disabled':''}>${icon('plus')}</button></div></div><div class="timeline-wrap"><div class="hours" aria-hidden="true">${Array.from({length:25},(_,h)=>`<span style="top:${h*80}px">${String(h).padStart(2,'0')}:00</span>`).join('')}</div><div id="timeline" class="timeline ${touchMode?'touch-record':''}" aria-label="24時間タイムライン"><div id="blocks"></div><div id="selection" class="selection" hidden><span></span></div>${Array.from({length:24},(_,h)=>`<div class="hour-band" style="top:${h*80}px"><span>${h<6?'NIGHT':h<12?'MORNING':h<18?'AFTERNOON':'EVENING'}</span></div>`).filter((_,h)=>h%6===0).join('')}</div></div></section></div>`;
}
function renderBlocks() {
  const el=document.querySelector('#blocks'); if(!el) return;
  el.innerHTML=layoutBlocks(store.day(date).blocks).map(b=>{
    const t=TYPES.find(t=>t[0]===b.type); const height=(b.endMinute-b.startMinute)*80/60;
    return `<button class="activity ${height<=40?'compact':''}" data-block="${esc(b.id)}" style="top:${b.startMinute*80/60}px;height:${height}px;left:calc(${b.col/b.cols*100}% + 5px);width:calc(${100/b.cols}% - 10px);--block-color:${t[2]}" aria-label="${esc(t[1])} ${timeLabel(b.startMinute)}から${timeLabel(b.endMinute)} ${esc(b.label)}"><span class="block-title">${esc(t[1])}</span><span class="block-time">${timeLabel(b.startMinute)} – ${timeLabel(b.endMinute)}</span>${b.label?`<span class="block-note">${esc(b.label)}</span>`:''}</button>`;
  }).join('');
  el.querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>{const block=store.day(date).blocks.find(x=>x.id===b.dataset.block);blockDialog(block);});
}
function bindToday() {
  renderBlocks();
  const go=key=>{date=key;touchMode=false;render();};
  document.querySelector('#prev-day').onclick=()=>go(shiftDate(date,-1));
  document.querySelector('#next-day').onclick=()=>go(shiftDate(date,1));
  document.querySelector('#go-today').onclick=()=>go(dateKey());
  document.querySelector('#date-picker').onchange=e=>{if(e.target.value && e.target.value<=dateKey()) go(e.target.value);};
  document.querySelector('#line').oninput=e=>{ store.save(date,{...store.day(date),line:e.target.value});document.querySelector('#char-count').textContent=`${e.target.value.length} / 200`; };
  document.querySelector('#line').onblur=()=>store.flush();
  document.querySelector('#add-block').onclick=()=>{const start=Math.min(1380,Math.floor(new Date().getHours()*60/15)*15);blockDialog({startMinute:start,endMinute:start+60,type:'',label:''});};
  document.querySelector('#touch-toggle').onclick=()=>{touchMode=!touchMode;render();};
  const tl=document.querySelector('#timeline'), selection=document.querySelector('#selection'); let drag=null;
  const minute=e=>Math.max(0,Math.min(1440,Math.round((e.clientY-tl.getBoundingClientRect().top)/80*60/15)*15));
  tl.onpointerdown=e=>{
    if(disabled() || e.button!==0 || e.target.closest('.activity') || (e.pointerType==='touch'&&!touchMode)) return;
    drag={pointer:e.pointerId,start:minute(e),end:minute(e),x:e.clientX,y:e.clientY,moved:false};tl.setPointerCapture(e.pointerId);
  };
  tl.onpointermove=e=>{
    if(!drag || drag.pointer!==e.pointerId) return;
    if(Math.abs(e.clientY-drag.y)<8 && !drag.moved) return;
    drag.moved=true;drag.end=minute(e); const start=Math.min(drag.start,drag.end),end=Math.max(drag.start,drag.end);
    selection.hidden=false;selection.style.top=`${start*80/60}px`;selection.style.height=`${Math.max(15,end-start)*80/60}px`;selection.querySelector('span').textContent=`${timeLabel(start)} – ${timeLabel(end===start?Math.min(1440,start+15):end)}`;
    if(e.pointerType==='touch') { if(e.clientY>window.innerHeight-110) window.scrollBy(0,12);if(e.clientY<100)window.scrollBy(0,-12); }
  };
  const cancel=()=>{drag=null;selection.hidden=true;};
  tl.onpointerup=e=>{if(!drag) return; const state=drag;cancel();if(!state.moved || state.start===state.end) return;blockDialog({startMinute:Math.min(state.start,state.end),endMinute:Math.max(state.start,state.end),type:'',label:''});};
  tl.onpointercancel=cancel; tl.onlostpointercapture=cancel;
}
function calendarHTML() {
  const [y,m]=month.split('-').map(Number), first=new Date(y,m-1,1), length=new Date(y,m,0).getDate();
  return `<section class="calendar-page"><p class="eyebrow">THE DAYS LEFT ON PAPER</p><div class="calendar-top"><button class="icon-btn" id="prev-month" aria-label="前の月">${icon('left')}</button><h1>${y}<span>.</span>${String(m).padStart(2,'0')}</h1><button class="icon-btn" id="next-month" aria-label="次の月" ${month>=dateKey().slice(0,7)?'disabled':''}>${icon('right')}</button></div><div class="calendar-grid"><div class="weekdays">${['日','月','火','水','木','金','土'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-days">${'<span></span>'.repeat(first.getDay())}${Array.from({length},(_,i)=>{const key=`${month}-${String(i+1).padStart(2,'0')}`,day=store.day(key);return `<button data-date="${key}" class="calendar-day ${key===dateKey()?'is-today':''} ${key===date?'is-selected':''}" aria-label="${key}${hasRecord(day)?' 記録あり':''}" ${key>dateKey()?'disabled':''}><span>${i+1}</span><div class="record-dots">${day.line.trim()?'<i class="line-dot"></i>':''}${day.blocks.length?'<i class="timeline-dot"></i>':''}</div></button>`;}).join('')}</div></div><div class="calendar-legend"><span><i class="line-dot"></i>一行日記</span><span><i class="timeline-dot"></i>タイムライン</span></div><p class="calendar-note">記録がある日を、ここから。</p></section>`;
}
function bindCalendar() {
  const move=n=>{const d=dateObject(`${month}-01`);d.setMonth(d.getMonth()+n);month=dateKey(d).slice(0,7);render();};
  document.querySelector('#prev-month').onclick=()=>move(-1);document.querySelector('#next-month').onclick=()=>move(1);
  document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{date=b.dataset.date;view='today';render();window.scrollTo(0,0);});
}
function settingsHTML() {
  return `<section class="settings-page"><p class="eyebrow">SETTINGS</p><h1>手帳の設定</h1><section class="settings-section"><h2>保存と同期</h2><p>${store.mode==='cloud'?`Googleでログイン中<br><span class="small">${esc(store.user.email)}</span>`:'この端末内で試用中'}</p><p class="small">${store.mode==='cloud'?'オフラインでの編集は端末に残し、再接続後に同期する。':'この端末の記録は、他の端末には同期されない。接続後はJSONを読み込んで移せる。'}</p><button class="secondary" id="retry-sync">保存状態を確認</button><button class="text-button" id="logout">${store.mode==='cloud'?'ログアウト':'最初の画面に戻る'}</button><p id="save-error" class="error" role="alert"></p></section><section class="settings-section"><h2>JSONバックアップ</h2><p class="small">一行日記とタイムラインを、まとめて保存する。</p><div class="backup-actions"><button class="primary" id="export">JSONを書き出す</button><button class="secondary" id="import" ${store.readOnly?'disabled':''}>JSONを読み込む</button><input id="import-file" type="file" accept=".json,application/json" hidden></div>${store.mode==='cloud'&&!store.complete?'<p class="small">今は端末にある記録のみを書き出せる。全記録のバックアップにはオンラインで接続確認が必要。</p>':''}${Object.keys(store.data.conflicts).length?`<div class="settings-conflicts"><h3>同期の確認</h3>${Object.keys(store.data.conflicts).map(d=>`<button class="secondary" data-conflict="${d}">${d} の記録を確認</button>`).join('')}</div>`:''}</section><section class="settings-section"><h2>ホーム画面に追加</h2><p class="small">iPhoneはSafariの共有メニューから「ホーム画面に追加」。AndroidやPCはブラウザの「アプリをインストール」から。</p></section><div class="settings-colophon"><img src="./icons/icon-192.png" width="64" height="64" alt="DAILY ROOMのアイコン"><div><b>DAILY ROOM</b><p>今日を、少しだけ残す。</p><span class="small">VERSION 0.1.0</span></div></div></section>`;
}
function downloadBackup(backup=store.backup()) {
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`DAILY-ROOM-${dateKey()}-${new Date().toTimeString().slice(0,8).replaceAll(':','')}.json`;a.hidden=true;document.body.append(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},30000);
}
function bindSettings() {
  if(store.mode==='cloud' && store.hasTrial()) {
    const button=document.createElement('button');button.className='secondary';button.textContent='この端末の試用記録を書き出す';document.querySelector('.backup-actions').append(button);
    button.onclick=()=>{try{downloadBackup(store.trialBackup());toast('試用記録のJSONを書き出した。');}catch{toast('試用記録を読み込めなかった。元の記録はそのまま残してある。');}};
  }
  document.querySelector('#retry-sync').onclick=()=>{store.flush();store.updateStatus();updateStatus();toast(store.status);};
  document.querySelector('#logout').onclick=()=>{store.logout();};
  document.querySelector('#export').onclick=()=>{downloadBackup();toast('JSONを書き出した。');};
  const file=document.querySelector('#import-file');document.querySelector('#import').onclick=()=>file.click();
  file.onchange=async()=>{
    try {const f=file.files[0];if(!f)return;if(f.size>25*1024*1024)throw Error('25MB以下のJSONを選んでくれ。');const days=validateBackup(JSON.parse(await f.text()));const keys=Object.keys(days);const collisions=keys.filter(k=>hasRecord(store.day(k))).length;
      confirmDialog('JSONを読み込む',`${keys.length}日分を読み込む。同じ日付の既存記録${collisions}日分は、読み込む内容に置き換わる。読み込む前の記録をJSONと端末の復元用控えに残す。`,()=>{downloadBackup();store.importDays(days);toast('記録を読み込んだ。');render();},'バックアップして読み込む');
    }catch(e){toast(e.message || 'JSONを読み込めなかった。');}finally{file.value='';}
  };
  document.querySelectorAll('[data-conflict]').forEach(b=>b.onclick=()=>conflictDialog(b.dataset.conflict));
}
function openDialog(html) {
  const el=document.createElement('dialog');el.innerHTML=html;document.body.append(el);dialog=el;
  const previousFocus=document.activeElement;
  el.addEventListener('close',()=>{el.remove();dialog=null;render();if(previousFocus?.id)document.getElementById(previousFocus.id)?.focus();});
  el.showModal();return el;
}
function confirmDialog(title,text,action,label='確認して進む') {
  const el=openDialog(`<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn cancel" aria-label="閉じる">${icon('close')}</button></div><p>${esc(text)}</p><div class="modal-actions"><button class="secondary cancel">戻る</button><button class="primary confirm">${esc(label)}</button></div>`);
  el.querySelectorAll('.cancel').forEach(b=>b.onclick=()=>el.close());el.querySelector('.confirm').onclick=()=>{el.close();action();};
}
function blockDialog(block) {
  if(disabled()) return;
  const editing=Boolean(block.id);const draft={...block};
  const options=(value,end=false)=>Array.from({length:end?97:96},(_,i)=>`<option value="${i*15}" ${i*15===value?'selected':''}>${timeLabel(i*15)}</option>`).join('');
  const el=openDialog(`<div class="modal-head"><div><p class="eyebrow">${editing?'EDIT RECORD':'LEAVE A RECORD'}</p><h2>何をしていた？</h2></div><button class="icon-btn cancel" aria-label="閉じる">${icon('close')}</button></div><div class="time-fields"><label>開始<select id="start-time">${options(block.startMinute)}</select></label><span>—</span><label>終了<select id="end-time">${options(block.endMinute,true)}</select></label></div><label class="note-field">補足 <span class="small">任意・100文字まで</span><input id="block-note" maxlength="100" placeholder="ひと言、添えるなら" value="${esc(block.label)}"></label><p class="small category-help">${editing?'活動を選んで、保存。':'活動を押すと、そのまま保存。'}</p><div class="type-grid">${TYPES.map(t=>`<button data-type="${t[0]}" class="type-button ${t[0]===block.type?'selected':''}" style="--block-color:${t[2]}">${t[1]}</button>`).join('')}</div><p id="block-error" class="error" role="alert"></p><div id="overlap-warning" class="overlap-warning" hidden><p>この時間帯には既に記録がある。既存の記録を残したまま追加する。</p><button class="primary" id="overlap-confirm">重ねて保存</button></div><div class="modal-actions">${editing?'<button class="danger" id="delete-block">削除</button><button class="primary" id="save-block">保存</button>':'<button class="secondary cancel">戻る</button>'}</div>`);
  const collect=()=>({...draft,startMinute:Number(el.querySelector('#start-time').value),endMinute:Number(el.querySelector('#end-time').value),label:el.querySelector('#block-note').value,id:draft.id||crypto.randomUUID()});
  let pendingBlock=null;
  const commit=b=>{const day=store.day(date);const blocks=editing?day.blocks.map(x=>x.id===b.id?b:x):[...day.blocks,b];if(store.save(date,{...day,blocks})){el.close();toast('記録した。');}};
  const save=()=>{
    const b=collect();const error=el.querySelector('#block-error');error.textContent='';
    if(!b.type){error.textContent='活動を選んでくれ。';return;}if(b.startMinute>=b.endMinute){error.textContent='終了は開始より後の時間にしてくれ。';return;}
    if(store.day(date).blocks.some(x=>x.id!==b.id && overlaps(x,b))){pendingBlock=b;el.querySelector('#overlap-warning').hidden=false;return;}commit(b);
  };
  el.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{draft.type=b.dataset.type;el.querySelectorAll('[data-type]').forEach(x=>x.classList.toggle('selected',x===b));if(!editing)save();});
  el.querySelectorAll('.cancel').forEach(b=>b.onclick=()=>el.close());
  el.querySelector('#save-block')?.addEventListener('click',save);
  el.querySelector('#overlap-confirm').onclick=()=>{const b=collect();if(b.startMinute>=b.endMinute || !b.type)return;commit(b);};
  el.querySelector('#delete-block')?.addEventListener('click',()=>{
    el.close();confirmDialog('記録を削除する',`${timeLabel(block.startMinute)}〜${timeLabel(block.endMinute)} の記録を削除する。`,()=>{const day=store.day(date);store.save(date,{...day,blocks:day.blocks.filter(b=>b.id!==block.id)});toast('記録を削除した。');},'削除する');
  });
}
function conflictDialog(key) {
  const conflict=store.data.conflicts[key];if(!conflict)return;
  const summary=d=>`<p class="conflict-line">${esc(d.line||'（一行日記なし）')}</p><ul>${d.blocks.map(b=>`<li>${timeLabel(b.startMinute)}–${timeLabel(b.endMinute)} ${esc(TYPES.find(t=>t[0]===b.type)?.[1])}${b.label?` / ${esc(b.label)}`:''}</li>`).join('')||'<li>タイムラインなし</li>'}</ul>`;
  const el=openDialog(`<div class="modal-head"><h2>${esc(key)} の記録</h2><button class="icon-btn cancel" aria-label="閉じる">${icon('close')}</button></div><p class="small">どちらを使うか選んでくれ。選ばなかった記録も復元用控えとしてJSONに残す。</p><div class="conflict-versions"><section><h3>この端末</h3>${summary(store.day(key))}<button class="primary" data-choice="local">この端末の記録を使う</button></section><section><h3>同期先</h3>${summary(conflict.remote)}<button class="secondary" data-choice="remote">同期先の記録を使う</button></section></div>`);
  el.querySelector('.cancel').onclick=()=>el.close();el.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{store.resolve(key,b.dataset.choice);el.close();});
}
store.addEventListener('change',render);render();store.init();
window.addEventListener('online',()=>{store.updateStatus();updateStatus();});window.addEventListener('offline',()=>{store.updateStatus();updateStatus();});
if('serviceWorker' in navigator && !import.meta.env.DEV) window.addEventListener('load',()=>navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`,{scope:import.meta.env.BASE_URL}).catch(()=>{}));
