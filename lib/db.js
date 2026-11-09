const fs = require('fs');
const path = require('path');
const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const file = path.join(dir, 'db.json');
let data = { guilds: {}, schedules: [], nextSchedule: 1 };
try { fs.mkdirSync(dir, { recursive: true }); data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
let timer = null;
function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  try {
    fs.mkdirSync(dir, { recursive: true });
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(data));
    fs.renameSync(temp, file);
    return true;
  } catch (e) {
    console.error('DB save failed:', e.message);
    return false;
  }
}
function save() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; flush(); }, 500);
}
function g(id) {
  return (data.guilds[id] ||= { cases: [], warns: [], notes: [], watch: [], config: {}, nextCase: 1, nextWarn: 1, nextNote: 1 });
}
function add(gid, list, ctr, x) { const d = g(gid); const o = { id: d[ctr]++, at: Date.now(), ...x }; d[list].push(o); save(); return o; }
const addCase = (gid, x) => add(gid, 'cases', 'nextCase', x);
const addWarn = (gid, x) => add(gid, 'warns', 'nextWarn', x);
const addNote = (gid, x) => add(gid, 'notes', 'nextNote', x);
const getCase = (gid, id) => g(gid).cases.find((c) => c.id === id);
function remove(gid, list, id) { const d = g(gid); const n = d[list].length; d[list] = d[list].filter((x) => x.id !== id); save(); return n !== d[list].length; }
function removeWhere(gid, list, fn) { const d = g(gid); const n = d[list].length; d[list] = d[list].filter((x) => !fn(x)); save(); return n - d[list].length; }
function schedule(x) { const s = { id: data.nextSchedule++, ...x }; data.schedules.push(s); save(); return s; }
function dueSchedules() { const now = Date.now(); return data.schedules.filter((s) => s.at <= now); }
function dropSchedule(id) { data.schedules = data.schedules.filter((s) => s.id !== id); save(); }
function retrySchedule(id, error) {
  const task = data.schedules.find((s) => s.id === id);
  if (!task) return false;
  task.attempts = (task.attempts || 0) + 1;
  task.lastError = String(error?.message || error || 'Unknown error').slice(0, 300);
  const delay = Math.min(60 * 60 * 1000, 30 * 1000 * (2 ** Math.min(task.attempts - 1, 7)));
  task.at = Date.now() + delay;
  save();
  return true;
}
module.exports = { g, save, flush, addCase, addWarn, addNote, getCase, remove, removeWhere, schedule, dueSchedules, dropSchedule, retrySchedule };
