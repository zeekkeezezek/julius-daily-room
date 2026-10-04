import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, validateDay, validateBackup, needsCategoryMerge } from '../src/model.js';
import { RoomStore } from '../src/store.js';
const date='2026-10-04', clone=v=>JSON.parse(JSON.stringify(v));
const legacy=()=>({date,line:'君の一行はそのまま',revision:3,createdAt:'original creation',updatedAt:'previous update',blocks:['fun','rest','move','out','work'].map((type,i)=>({id:`block-${i}`,type,label:`補足${i}`,startMinute:i*60,endMinute:i*60+60}))});
let persisted,stores;
beforeEach(()=>{persisted=new Map();stores=[];Object.defineProperty(globalThis,'localStorage',{value:{getItem:k=>persisted.get(k)||null,setItem:(k,v)=>persisted.set(k,v)},configurable:true});Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});});
afterEach(()=>{for(const s of stores)clearTimeout(s.timer);});
function make(raw=legacy()) {
 const server={[date]:clone(raw)},writes=[];
 const store=new RoomStore({transaction:async(_,action)=>{const staged=[];await action({get:async ref=>({exists:()=>Boolean(server[ref]),data:()=>clone(server[ref])}),set:(ref,data,options)=>{assert.deepEqual(options,{merge:true});staged.push([ref,data]);}});for(const [ref,data] of staged){writes.push(clone(data));server[ref]={...server[ref],...clone(data)};}}});
 store.dayRef=(_,d)=>d;store.mode='cloud';store.user={uid:'owner'};store.complete=true;store.receiveDay(date,raw);stores.push(store);return {store,server,writes};
}
test('old categories and old JSON map to nine choices without changing blocks, diary or caller data',()=>{
 const raw=legacy(),before=clone(raw),day=validateDay(date,raw);
 assert.equal(TYPES.length,9);assert.equal(TYPES.find(t=>t[0]==='rest')[1],'のんびり');assert.equal(needsCategoryMerge(raw),true);assert.equal(needsCategoryMerge(day),false);
 assert.deepEqual(day.blocks.map(b=>b.type),['rest','rest','out','out','work']);
 assert.deepEqual(day.blocks.map(({type,...b})=>b),raw.blocks.map(({type,...b})=>b));assert.equal(day.line,raw.line);assert.deepEqual(raw,before);
 assert.deepEqual(validateBackup({app:'DAILY ROOM',version:1,days:{[date]:raw}})[date],day);
 assert.throws(()=>validateDay(date,{...raw,blocks:[{...raw.blocks[0],type:'unknown'}]}));
});
test('cloud merge changes only categories and revision, keeps exact backup and is idempotent',async()=>{
 const raw=legacy(),{store,server,writes}=make(raw);await store.flush();
 assert.equal(writes.length,1);assert.deepEqual(Object.keys(writes[0]).sort(),['blocks','revision','updatedAt']);assert.equal(server[date].revision,4);assert.equal(server[date].createdAt,raw.createdAt);assert.equal(server[date].line,raw.line);
 assert.deepEqual(server[date].blocks.map(({type,...b})=>b),raw.blocks.map(({type,...b})=>b));assert.deepEqual(store.backup().recovery[0].days[date],raw);
 store.receiveDay(date,server[date]);await store.flush();assert.equal(writes.length,1);assert.equal(store.categoryDates.size,0);
});
test('migration reads latest remote version, including another device edits, instead of cached diary',async()=>{
 const {store,server,writes}=make();server[date].line='別端末で直した一行';server[date].revision=8;server[date].blocks[0].label='最新の補足';await store.flush();
 assert.equal(server[date].line,'別端末で直した一行');assert.equal(server[date].blocks[0].label,'最新の補足');assert.equal(server[date].revision,9);assert.equal(writes.length,1);
});
test('typing during category migration keeps the draft and advances its unchanged baseline safely',async()=>{
 const {store,server}=make(),original=store.transaction;let release;
 store.transaction=async(db,cb)=>{await new Promise(r=>release=r);return original(db,cb);};const migrating=store.flush();
 store.save(date,{...store.day(date),line:'更新中にも書いた一行'});release();await migrating;
 assert.equal(store.day(date).line,'更新中にも書いた一行');assert.equal(store.data.pending[date].baseRevision,4);assert.equal(server[date].line,'君の一行はそのまま');store.transaction=original;await store.flush();assert.equal(server[date].line,'更新中にも書いた一行');assert.equal(server[date].revision,5);
});
test('another device edit during migration does not make an older local draft overwrite it',async()=>{
 const {store,server}=make(),original=store.transaction;let release;store.transaction=async(db,cb)=>{await new Promise(r=>release=r);return original(db,cb);};const migrating=store.flush();store.save(date,{...store.day(date),line:'端末の古い版から書いた一行'});server[date].line='別端末の新しい一行';server[date].revision=5;release();await migrating;
 assert.equal(store.data.pending[date].baseRevision,3);store.transaction=original;await store.flush();assert.equal(server[date].line,'別端末の新しい一行');assert.equal(store.data.conflicts[date].remote.line,'別端末の新しい一行');assert.equal(store.day(date).line,'端末の古い版から書いた一行');
});
test('offline and read-only tabs cannot migrate remote or local records',async()=>{
 const {store,writes}=make();navigator.onLine=false;await store.flush();assert.equal(writes.length,0);navigator.onLine=true;store.tabReadOnly=true;await store.flush();assert.equal(writes.length,0);
 const raw={days:{[date]:legacy()},pending:{},conflicts:{},recovery:[]};persisted.set(store.key(),JSON.stringify(raw));store.load();store.persistCategoryCache();assert.equal(persisted.get(store.key()),JSON.stringify(raw));
});
test('local trial conversion is persistent, backed up once and preserves unsent changes',()=>{
 const {store}=make();store.mode='local';store.categoryDates.clear();const data={days:{[date]:legacy()},pending:{},conflicts:{},recovery:[]};persisted.set(store.key(),JSON.stringify(data));store.load();store.acquireWriter();const saved=JSON.parse(persisted.get(store.key()));assert.deepEqual(saved.recovery[0].days,data.days);assert.equal(saved.days[date].blocks[0].type,'rest');assert.equal(saved.days[date].blocks[2].type,'out');store.load();store.acquireWriter();assert.equal(store.data.recovery.length,1);
});
test('storage backup failure prevents a cloud category write',async()=>{
 const {store,server,writes}=make(),before=clone(server);localStorage.setItem=()=>{throw Error('quota');};await store.flush();assert.deepEqual(server,before);assert.equal(writes.length,0);assert.match(store.error,/保存に失敗/);
});
test('backup and network failures can retry without writing until the backup is durable',async()=>{
 const {store,writes}=make(),save=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota');};await store.flush();await store.flush();assert.equal(writes.length,0);localStorage.setItem=save;await store.flush();assert.equal(writes.length,1);assert.equal(store.categoryMerged,1);
 const second=make(),transaction=second.store.transaction;second.store.transaction=async()=>{throw Error('offline');};await second.store.flush();assert.equal(second.writes.length,0);second.store.transaction=transaction;await second.store.flush();assert.equal(second.writes.length,1);
});
test('logout while remote categories are being read cancels the category write',async()=>{
 const {store,writes}=make(),original=store.transaction;let release;store.transaction=async(db,cb)=>{await new Promise(r=>release=r);return original(db,cb);};const migrating=store.flush();await store.logout();release();await migrating;assert.equal(writes.length,0);
});
test('dirty days use the existing revision guard and back up the raw cloud categories',async()=>{
 const raw=legacy(),{store,server}=make(raw);store.save(date,{...store.day(date),line:'同期待ちの一行'});await store.flush();assert.equal(server[date].line,'同期待ちの一行');assert.deepEqual(store.data.recovery.find(r=>r.source==='cloud').days[date],raw);assert.equal(server[date].blocks[0].type,'rest');
});
