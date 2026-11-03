const fs = require('fs');
const path = require('path');
const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const file = path.join(dir, 'db.json');
let data = { guilds: {}, schedules: [], nextSchedule: 1 };
try { fs.mkdirSync(dir, { recursive: true }); data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => { try { fs.writeFileSync(file, JSON.stringify(data)); } catch (e) { console.error('DB save failed:', e.message); } }, 500);
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
module.exports = { g, save, addCase, addWarn, addNote, getCase, remove, removeWhere, schedule, dueSchedules, dropSchedule };
