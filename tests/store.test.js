import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from '../src/store.js';
const persisted=new Map();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:k=>persisted.get(k)||null,setItem:(k,v)=>persisted.set(k,v)},configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
let stores=[];
beforeEach(()=>{persisted.clear();navigator.onLine=true;stores=[];});
afterEach(()=>{for(const store of stores)clearTimeout(store.timer);});
function make(server={}) {
  const store=new RoomStore({transaction:async(_,action)=>{
    const writes=[];await action({get:async ref=>({exists:()=>Boolean(server[ref]),data:()=>server[ref]}),set:(ref,d)=>writes.push([ref,d])});
    for(const [ref,d] of writes)server[ref]={...server[ref],...d};
  }});
  store.dayRef=(_,date)=>date;store.mode='cloud';store.user={uid:'owner'};store.complete=true;stores.push(store);return store;
}
test('offline edits survive reload and write only the edited date on reconnect',async()=>{
  const server={};const store=make(server);navigator.onLine=false;
  store.save('2026-10-04',{line:'端末に残す。',blocks:[]});await store.flush();assert.equal(Object.keys(server).length,0);
  const reloaded=make(server);reloaded.load();assert.equal(reloaded.day('2026-10-04').line,'端末に残す。');
  navigator.onLine=true;await reloaded.flush();assert.equal(server['2026-10-04'].line,'端末に残す。');assert.equal(server['2026-10-04'].revision,1);assert.deepEqual(Object.keys(server),['2026-10-04']);assert.deepEqual(reloaded.data.pending,{});
});
test('stale day is kept locally and never overwrites newer cloud data; resolution preserves both',async()=>{
  const server={'2026-10-04':{date:'2026-10-04',line:'別の端末で更新',blocks:[],revision:2}};const store=make(server);
  store.data.days['2026-10-04']={date:'2026-10-04',line:'旧版',blocks:[],revision:1};store.save('2026-10-04',{line:'この端末の入力',blocks:[]});await store.flush();
  assert.equal(server['2026-10-04'].line,'別の端末で更新');assert.equal(store.day('2026-10-04').line,'この端末の入力');assert.equal(store.data.conflicts['2026-10-04'].remote.revision,2);
  store.resolve('2026-10-04','remote');assert.equal(store.day('2026-10-04').line,'別の端末で更新');assert.equal(store.backup().recovery[0].local.line,'この端末の入力');assert.deepEqual(store.data.pending,{});
});
test('typing during an in-flight commit retains the newer draft for the next commit',async()=>{
  const server={};const store=make(server);const original=store.transaction;let finish;
  store.transaction=async(db,cb)=>{await new Promise(r=>finish=r);return original(db,cb);};
  store.save('2026-10-04',{line:'最初の一行',blocks:[]});const flushing=store.flush();
  store.save('2026-10-04',{line:'更新した一行',blocks:[]});finish();await flushing;
  assert.equal(server['2026-10-04'].line,'最初の一行');assert.equal(store.day('2026-10-04').line,'更新した一行');assert.equal(store.data.pending['2026-10-04'].baseRevision,1);
  store.transaction=original;await store.flush();assert.equal(server['2026-10-04'].line,'更新した一行');assert.equal(server['2026-10-04'].revision,2);
});
test('profile caches and the local trial are isolated',()=>{
  const store=make();store.save('2026-10-04',{line:'本人の記録',blocks:[]});const other=make();other.user={uid:'other'};other.load();assert.deepEqual(other.data.days,{});other.mode='local';other.load();assert.deepEqual(other.data.days,{});
});
test('a read-only tab cannot write by importing or resolving a conflict',()=>{
  const store=make();store.tabReadOnly=true;
  assert.equal(store.save('2026-10-04',{line:'別タブ',blocks:[]}),false);
  store.importDays({'2026-10-04':{line:'読み込み',blocks:[]}});
  store.data.conflicts['2026-10-04']={remote:{date:'2026-10-04',line:'同期先',blocks:[],revision:1}};
  store.resolve('2026-10-04','remote');assert.deepEqual(store.data.days,{});assert.equal(store.data.recovery.length,0);assert.equal(persisted.size,0);
});
