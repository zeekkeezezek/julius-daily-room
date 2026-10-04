export const TYPES = [
  ['job','仕事','#d9e2ed'], ['sleep','睡眠','#dedcf0'], ['meal','食事','#f4e6b6'],
  ['work','作業','#cde3ed'], ['exercise','運動','#dce9c8'], ['out','外出','#f0d8cd'],
  ['house','家事','#d2e4da'], ['rest','のんびり','#e5e3d9'], ['other','その他','#e3e0dc']
];
export const categoryType = type => type === 'fun' ? 'rest' : type === 'move' ? 'out' : type;
export const needsCategoryMerge = day => Array.isArray(day?.blocks) && day.blocks.some(b => b && categoryType(b.type) !== b.type);
export const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const dateObject = key => new Date(`${key}T12:00:00`);
export const shiftDate = (key, amount) => { const d = dateObject(key); d.setDate(d.getDate()+amount); return dateKey(d); };
export const timeLabel = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export const emptyDay = date => ({ date, line: '', blocks: [], revision: 0 });
export const hasRecord = d => Boolean(d && (d.line.trim() || d.blocks.length));
export const overlaps = (a,b) => a.startMinute < b.endMinute && a.endMinute > b.startMinute;
export function validDate(key) { return /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(dateObject(key)) === key; }
export function validateDay(date, day) {
  if (!validDate(date) || !day || typeof day !== 'object' || typeof day.line !== 'string' || day.line.length > 200 || !Array.isArray(day.blocks) || day.blocks.length > 500) throw new Error('日付または日記の形式が正しくない。');
  const ids = new Set();
  const blocks = day.blocks.map(b => {
    if (!b || typeof b.id !== 'string' || !b.id.length || b.id.length > 100 || ids.has(b.id) || !TYPES.some(t => t[0] === categoryType(b.type)) || typeof b.label !== 'string' || b.label.length > 100 || !Number.isInteger(b.startMinute) || !Number.isInteger(b.endMinute) || b.startMinute < 0 || b.endMinute > 1440 || b.startMinute >= b.endMinute || b.startMinute%15 || b.endMinute%15) throw new Error('活動ブロックの形式が正しくない。');
    ids.add(b.id); return { id:b.id, startMinute:b.startMinute, endMinute:b.endMinute, type:categoryType(b.type), label:b.label };
  });
  return {date, line:day.line, blocks, revision: Number.isInteger(day.revision) && day.revision >= 0 ? day.revision : 0};
}
export function validateBackup(raw) {
  if (!raw || raw.app !== 'DAILY ROOM' || raw.version !== 1 || !raw.days || Array.isArray(raw.days) || typeof raw.days !== 'object') throw new Error('DAILY ROOMのバックアップを選んでくれ。');
  const entries = Object.entries(raw.days);
  if (entries.length > 50000) throw new Error('日付数が多すぎる。');
  return Object.fromEntries(entries.map(([key,d]) => [key,validateDay(key,d)]));
}
export function layoutBlocks(blocks) {
  const sorted = [...blocks].sort((a,b) => a.startMinute-b.startMinute || b.endMinute-a.endMinute);
  const result = []; let group = [], maxEnd = -1;
  const flush = () => {
    const ends = []; const laid = group.map(b => { let col = ends.findIndex(e => e <= b.startMinute); if (col < 0) col = ends.length; ends[col] = b.endMinute; return {...b,col}; });
    result.push(...laid.map(b => ({...b,cols:ends.length}))); group=[];
  };
  for (const b of sorted) { if (b.startMinute >= maxEnd && group.length) flush(); group.push(b); maxEnd=Math.max(maxEnd,b.endMinute); }
  if(group.length) flush(); return result;
}
