import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from '../src/store.js';
test('trial backup remains accessible after configuring cloud and preserves separate account data',()=>{
  const trial={days:{'2026-10-04':{date:'2026-10-04',line:'接続前の記録',blocks:[],revision:0}},recovery:[]};
  const cache=new Map([['daily-room-v1:local-trial',JSON.stringify(trial)]]);
  Object.defineProperty(globalThis,'localStorage',{value:{getItem:k=>cache.get(k)||null},configurable:true});
  const store=new RoomStore();store.mode='cloud';store.user={uid:'owner'};store.data.days['2026-10-04']={date:'2026-10-04',line:'クラウドの記録',blocks:[],revision:1};
  assert.equal(store.hasTrial(),true);assert.equal(store.trialBackup().days['2026-10-04'].line,'接続前の記録');
  assert.equal(store.day('2026-10-04').line,'クラウドの記録');assert.equal(cache.get('daily-room-v1:local-trial'),JSON.stringify(trial));
});
