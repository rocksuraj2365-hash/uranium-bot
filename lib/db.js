const fs = require('fs');
const path = require('path');
const { normalizeRemotePayload } = require('./db-state');
const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const file = path.join(dir, 'db.json');
const defaults = { guilds: {}, schedules: [], nextSchedule: 1 };
let data = { ...defaults };
try {
  fs.mkdirSync(dir, { recursive: true });
  data = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
} catch { /* first run */ }

let timer = null;
let sql = null;
async function writeLocal() {
  fs.mkdirSync(dir, { recursive: true });
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(data));
  fs.renameSync(temp, file);
}
async function writeRemote() {
  if (!sql) return false;
  // Use Postgres.js's typed JSONB parameter so PostgreSQL stores an object,
  // not a JSON string scalar. `sql.json()` serializes with OID 3802 (jsonb).
  await sql`insert into uranium.state (id, payload, updated_at)
    values (1, ${sql.json(data)}, now())
    on conflict (id) do update set payload = excluded.payload, updated_at = now()`;
  return true;
}
async function init() {
  if (!process.env.DATABASE_URL) {
    console.warn('[db] DATABASE_URL is not configured; using local JSON storage until persistent DB is connected.');
    return false;
  }
  const postgres = require('postgres');
  sql = postgres(process.env.DATABASE_URL, {
    max: 2, idle_timeout: 20, connect_timeout: 12, prepare: false,
    ssl: 'require', connection: { application_name: 'uranium-bot' }
  });
  const rows = await sql`select payload from uranium.state where id = 1`;
  const rawRemote = rows[0]?.payload;
  const remote = rawRemote == null ? null : normalizeRemotePayload(rawRemote);
  if (rawRemote != null && !remote) throw new Error('Supabase state payload is malformed; refusing to overwrite it.');
  const local = data;
  const remoteHasData = !!remote && (Object.keys(remote.guilds || {}).length > 0 || (remote.schedules || []).length > 0 || Number(remote.nextSchedule || 1) > 1);
  const localHasData = Object.keys(local.guilds || {}).length > 0 || (local.schedules || []).length > 0 || Number(local.nextSchedule || 1) > 1;
  if (remoteHasData) data = { ...defaults, ...remote };
  else if (localHasData) {
    data = { ...defaults, ...local };
    await writeRemote();
    console.log('[db] Migrated existing local JSON state into Supabase.');
  } else if (remote) data = { ...defaults, ...remote };
  else await writeRemote();
  console.log('[db] Connected to Supabase PostgreSQL; persistent state loaded.');
  return true;
}
const ready = init();

async function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  try {
    if (sql) { await writeRemote(); try { await writeLocal(); } catch {} return true; }
    await writeLocal(); return true;
  } catch (e) { console.error('DB save failed:', e.message); return false; }
}
function save() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void flush(); }, 500);
}
function g(id) {
  return (data.guilds[id] ||= { cases: [], warns: [], notes: [], watch: [], config: {}, nextCase: 1, nextWarn: 1, nextNote: 1 });
}
function add(gid, list, ctr, x) {
  const d = g(gid); const o = { id: d[ctr]++, at: Date.now(), ...x };
  d[list].push(o); save(); return o;
}
const addCase = (gid, x) => add(gid, 'cases', 'nextCase', x);
const addWarn = (gid, x) => add(gid, 'warns', 'nextWarn', x);
const addNote = (gid, x) => add(gid, 'notes', 'nextNote', x);
const getCase = (gid, id) => g(gid).cases.find((c) => c.id === id);
function remove(gid, list, id) {
  const d = g(gid); const n = d[list].length;
  d[list] = d[list].filter((x) => x.id !== id); save(); return n !== d[list].length;
}
function removeWhere(gid, list, fn) {
  const d = g(gid); const n = d[list].length;
  d[list] = d[list].filter((x) => !fn(x)); save(); return n - d[list].length;
}
function schedule(x) {
  const s = { id: data.nextSchedule++, ...x }; data.schedules.push(s); save(); return s;
}
function dueSchedules() { const now = Date.now(); return data.schedules.filter((s) => s.at <= now); }
function dropSchedule(id) { data.schedules = data.schedules.filter((s) => s.id !== id); save(); }
function retrySchedule(id, error) {
  const task = data.schedules.find((s) => s.id === id);
  if (!task) return false;
  task.attempts = (task.attempts || 0) + 1;
  task.lastError = String(error?.message || error || 'Unknown error').slice(0, 300);
  const delay = Math.min(60 * 60 * 1000, 30 * 1000 * (2 ** Math.min(task.attempts - 1, 7)));
  task.at = Date.now() + delay; save(); return true;
}
async function close() {
  await flush();
  if (sql) { const client = sql; sql = null; await client.end({ timeout: 5 }).catch(() => {}); }
}
module.exports = { g, save, flush, ready, close, addCase, addWarn, addNote, getCase, remove, removeWhere, schedule, dueSchedules, dropSchedule, retrySchedule };
