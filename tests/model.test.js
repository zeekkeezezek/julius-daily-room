import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, validateDay, overlaps, layoutBlocks, shiftDate } from '../src/model.js';
const block=(id,start,end)=>({id,startMinute:start,endMinute:end,type:'work',label:'Blender'});
test('backup validates all days before returning and rejects unsafe times and duplicate identifiers',()=>{
  const days={'2026-10-04':{line:'今日を残す。',blocks:[block('a',840,930)]}};
  assert.equal(validateBackup({app:'DAILY ROOM',version:1,days})['2026-10-04'].blocks[0].endMinute,930);
  for(const b of [block('a',841,930),block('a',930,840),block('a',0,1455)]) assert.throws(()=>validateDay('2026-10-04',{line:'',blocks:[b]}));
  assert.throws(()=>validateDay('2026-02-30',{line:'',blocks:[]}));
  assert.throws(()=>validateDay('2026-10-04',{line:'',blocks:[block('a',0,60),block('a',60,120)]}));
  assert.throws(()=>validateBackup({app:'WORKROOM',version:1,days}));
});
test('adjacent activities do not overlap; concurrent blocks receive separate lanes',()=>{
  const a=block('a',840,930),b=block('b',930,960),c=block('c',900,960);
  assert.equal(overlaps(a,b),false);assert.equal(overlaps(a,c),true);
  const layout=layoutBlocks([a,b,c]);assert.equal(layout.find(x=>x.id==='a').cols,2);
  const pair=layout.filter(x=>x.startMinute===900 || x.startMinute===930);assert.notEqual(pair[0].col,pair[1].col);
});
test('date movement handles year and leap day boundaries',()=>{
  assert.equal(shiftDate('2026-01-01',-1),'2025-12-31');assert.equal(shiftDate('2024-02-28',1),'2024-02-29');
});
