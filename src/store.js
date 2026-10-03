import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { emptyDay, validateDay } from './model.js';

const clone = v => JSON.parse(JSON.stringify(v));
const initial = () => ({days:{},pending:{},conflicts:{},recovery:[]});
export class RoomStore extends EventTarget {
  constructor({transaction=runTransaction}={}) { super(); this.transaction=transaction; this.data=initial(); this.user=null; this.mode='login'; this.error=''; this.status=''; this.complete=false; this.running=false; this.epoch=0; this.tabReadOnly=false; }
  emit() { this.dispatchEvent(new Event('change')); }
  key() { return `daily-room-v1:${this.mode === 'local' ? 'local-trial' : this.user.uid}`; }
  hasTrial() { try { return Boolean(Object.keys(JSON.parse(localStorage.getItem('daily-room-v1:local-trial')||'{}').days||{}).length); } catch { return false; } }
  trialBackup() {
    const data=JSON.parse(localStorage.getItem('daily-room-v1:local-trial')||'{}');
    const days=Object.fromEntries(Object.entries(data.days||{}).map(([date,day])=>[date,validateDay(date,day)]));
    return {app:'DAILY ROOM',version:1,days,exportedAt:new Date().toISOString(),scope:'local-trial',recovery:data.recovery||[]};
  }
  persist() {
    try { localStorage.setItem(this.key(), JSON.stringify(this.data)); this.error=''; return true; }
    catch { this.error='端末への保存に失敗した。画面を閉じる前にJSONを書き出してくれ。'; this.status='保存エラー'; this.emit(); return false; }
  }
  load() {
    try { const raw=localStorage.getItem(this.key()); this.data=raw?JSON.parse(raw):initial(); if (!this.data.days || !this.data.pending || !this.data.conflicts || !Array.isArray(this.data.recovery)) throw Error(); for(const [date,day] of Object.entries(this.data.days)) validateDay(date,day); }
    catch { this.data=initial(); this.error='端末の保存データを読み込めない。元データは書き換えず、JSONからの復元を待つ。'; this.readOnly=true; }
  }
  acquireWriter() {
    this.releaseWriter?.(); this.releaseWriter=null;
    if(!navigator.locks) return;
    const epoch=this.epoch; this.tabReadOnly=true;
    navigator.locks.request(this.key(),{ifAvailable:true},async lock=>{
      if(this.epoch!==epoch)return;
      if(!lock) {this.error='同じ手帳を別のタブで開いている。編集するタブを一つにして、この画面を再読み込みしてくれ。';this.updateStatus();this.emit();return;}
      this.tabReadOnly=false;this.updateStatus();this.emit();this.flush();
      await new Promise(resolve=>{this.releaseWriter=resolve;});
    }).catch(()=>{this.error='編集用の保存領域を開けない。再読み込みしてくれ。';this.updateStatus();this.emit();});
  }
  async init() {
    const base=import.meta.env.BASE_URL;
    let config;
    try { const r=await fetch(`${base}firebase-config.json`,{cache:'no-store'}); if(r.ok && r.headers.get('content-type')?.includes('json')) config=await r.json(); } catch {}
    this.configured=Boolean(config && config.apiKey && config.appId && config.projectId && config.authDomain && !/コピー|YOUR|<|placeholder/i.test(config.apiKey));
    if(!this.configured) { this.emit(); return; }
    if(config.projectId === 'julius-workroom') { this.configured=false; this.error='DAILY ROOM専用のFirebaseを指定してくれ。'; this.emit(); return; }
    try {
      const app=initializeApp(config,'daily-room'); this.auth=getAuth(app);
      this.db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
      onAuthStateChanged(this.auth,user => this.openUser(user));
    } catch(e) { this.error=`接続設定を確認してくれ（${e.code || 'initialization'}）。`; this.emit(); }
    window.addEventListener('online',()=>this.flush()); window.addEventListener('offline',()=>{ this.updateStatus(); this.emit(); });
    window.addEventListener('storage',e => { if(this.mode==='cloud' && e.key===this.key()) { this.load(); this.emit(); this.flush(); } });
  }
  async login() {
    try { this.error=''; await signInWithPopup(this.auth,new GoogleAuthProvider()); }
    catch(e) { this.error=e.code==='auth/popup-blocked' ? 'ログイン画面を開けない。通常のブラウザで開き、ポップアップを許可してくれ。' : `ログインできなかった（${e.code || 'error'}）。`; this.emit(); }
  }
  openUser(user) {
    this.unsubscribe?.();this.releaseWriter?.();this.releaseWriter=null;this.tabReadOnly=false; this.epoch++; this.running=false; this.readOnly=false; this.user=user; this.complete=false; this.error='';
    if(!user) { this.mode='login'; this.data=initial(); this.emit(); return; }
    this.mode='cloud'; this.load(); this.acquireWriter(); this.updateStatus(); this.emit();
    this.unsubscribe=onSnapshot(collection(this.db,'dailyRoom',user.uid,'days'),{includeMetadataChanges:true}, snap => {
      this.complete=!snap.metadata.fromCache;
      for(const item of snap.docs) {
        const date=item.id;
        try {
          const day=validateDay(date,item.data());
          if(!this.data.pending[date] && !this.data.conflicts[date]) {
            const old=this.data.days[date];
            if(!old || day.revision >= old.revision) this.data.days[date]=day;
          }
        } catch { this.error='読み込めない記録がある。元の記録はそのまま残してある。'; }
      }
      if(!this.readOnly && !this.tabReadOnly) this.persist(); this.updateStatus(); this.emit(); this.flush();
    },e=>{ this.error=`同期できない（${e.code}）。端末の記録は残してある。`; this.status='同期エラー'; this.emit(); });
  }
  trial() { this.unsubscribe?.(); this.epoch++; this.running=false; this.readOnly=false; this.mode='local'; this.user=null; this.load(); this.acquireWriter(); this.updateStatus(); this.emit(); }
  async logout() { this.unsubscribe?.(); this.epoch++; this.running=false;this.releaseWriter?.();this.releaseWriter=null;this.tabReadOnly=false;if(this.auth && this.mode==='cloud') await signOut(this.auth); this.mode='login'; this.user=null; this.data=initial(); this.error=''; this.emit(); }
  day(date) { return this.data.days[date] || emptyDay(date); }
  save(date,next) {
    if(this.mode==='login' || this.readOnly || this.tabReadOnly) return false;
    const day=validateDay(date,next); const old=this.day(date);
    const p=this.data.pending[date];
    this.data.days[date]={...day,revision:old.revision};
    if(this.mode==='cloud') this.data.pending[date]={baseRevision:p?.baseRevision ?? old.revision,token:crypto.randomUUID()};
    if(!this.persist()) return false;
    this.updateStatus(); this.emit();
    clearTimeout(this.timer); this.timer=setTimeout(()=>this.flush(),450); return true;
  }
  updateStatus() {
    if(this.readOnly) this.status='保存エラー';
    else if(this.tabReadOnly) this.status='別のタブで編集中';
    else if(this.error) this.status='保存・同期エラー';
    else if(this.mode==='local') this.status='この端末に保存';
    else if(Object.keys(this.data.conflicts).length) this.status='同期の確認が必要';
    else if(!navigator.onLine) this.status='オフライン・端末に保存';
    else if(Object.keys(this.data.pending).length) this.status='端末に保存・同期中';
    else if(!this.complete) this.status='保存済み・接続確認中';
    else this.status='保存済み';
  }
  async flush() {
    if(this.mode!=='cloud' || this.running || !navigator.onLine || !this.complete || this.readOnly || this.tabReadOnly) return;
    this.running=true; const epoch=this.epoch; const uid=this.user.uid;
    try {
      for(const date of Object.keys(this.data.pending)) {
        if(this.epoch!==epoch) break;
        if(this.data.conflicts[date]) continue;
        const pending=clone(this.data.pending[date]); const day=clone(this.day(date));
        let newRevision;
        try {
          await this.transaction(this.db,async tx=>{
            const ref=this.dayRef(uid,date); const snap=await tx.get(ref);
            const remote=snap.exists()?validateDay(date,snap.data()):emptyDay(date);
            if(remote.revision!==pending.baseRevision) { const error=new Error('conflict'); error.remote=remote; throw error; }
            newRevision=remote.revision+1;
            const data={date,line:day.line,blocks:day.blocks,revision:newRevision,updatedAt:serverTimestamp()};
            if(!snap.exists()) data.createdAt=serverTimestamp();
            tx.set(ref,data,{merge:true});
          });
          if(this.epoch!==epoch) break;
          if(this.data.pending[date]?.token===pending.token) delete this.data.pending[date];
          else if(this.data.pending[date]) this.data.pending[date].baseRevision=newRevision;
          this.data.days[date].revision=newRevision;
          this.persist();
        } catch(e) {
          if(this.epoch!==epoch) break;
          if(e.remote) { this.data.conflicts[date]={remote:e.remote,detectedAt:new Date().toISOString()}; this.persist(); }
          else { this.error=`同期できない（${e.code || 'network'}）。端末の記録は残してある。`; break; }
        }
      }
    } finally {
      if(this.epoch===epoch) { this.running=false; this.updateStatus(); this.emit(); if(!this.error && Object.keys(this.data.pending).some(d=>!this.data.conflicts[d])) { clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),250); } }
    }
  }
  dayRef(uid,date) { return doc(this.db,'dailyRoom',uid,'days',date); }
  resolve(date, choice) {
    if(this.readOnly || this.tabReadOnly) return;
    const conflict=this.data.conflicts[date]; if(!conflict) return;
    this.data.recovery.push({date,local:clone(this.day(date)),remote:clone(conflict.remote),savedAt:new Date().toISOString(),reason:'sync-conflict'});
    if(choice==='remote') { this.data.days[date]=clone(conflict.remote); delete this.data.pending[date]; }
    else { this.data.days[date].revision=conflict.remote.revision; this.data.pending[date]={baseRevision:conflict.remote.revision,token:crypto.randomUUID()}; }
    delete this.data.conflicts[date]; this.persist(); this.updateStatus(); this.emit(); this.flush();
  }
  importDays(days) {
    if(this.readOnly || this.tabReadOnly) return;
    this.data.recovery.push({days:clone(this.data.days),savedAt:new Date().toISOString(),reason:'before-import'});
    for(const [date,day] of Object.entries(days)) this.save(date,day);
    this.persist(); this.flush();
  }
  backup() { return {app:'DAILY ROOM',version:1,days:clone(this.data.days),exportedAt:new Date().toISOString(),scope:this.mode==='local'?'local-trial':this.complete?'cloud-and-local-cache':'local-cache',pendingDates:Object.keys(this.data.pending),conflicts:clone(this.data.conflicts),recovery:clone(this.data.recovery)}; }
}
