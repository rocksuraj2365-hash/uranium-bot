const crypto = require('crypto');

const REPOS = new Set(['rocksuraj2365-hash/uranium-bot', 'rocksuraj2365-hash/uranium-app']);
const SERVICES = Object.freeze({
  'uranium-bot': 'srv-dbksv0mi0phs73b7bq6g',
  'uranium-web': 'srv-dbk07ddg1s2s738u2ong',
});
const pending = new Map();
const cut = (value, max = 5000) => String(value ?? '').slice(0, max);

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { accept: 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(data.message || data.error || ('HTTP ' + response.status));
  return data;
}
function githubHeaders() {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is missing from the uranium-bot Render environment.');
  return { authorization: 'Bearer ' + process.env.GITHUB_TOKEN, 'x-github-api-version': '2022-11-28' };
}
function renderHeaders() {
  if (!process.env.RENDER_API_KEY) throw new Error('RENDER_API_KEY is missing from the uranium-bot Render environment.');
  return { authorization: 'Bearer ' + process.env.RENDER_API_KEY };
}
function repoCheck(repo) {
  if (!REPOS.has(repo)) throw new Error('That repository is not in the Uranium allowlist.');
  return repo;
}
function safePath(value) {
  const path = cut(value, 240).replace(/^\/+/, '');
  const parts = path.split('/');
  if (!path || parts.some(part => !part || part === '.' || part === '..') || path.includes('\\')) {
    throw new Error('Provide a valid repository-relative file path.');
  }
  const base = parts[parts.length - 1].toLowerCase();
  if (/^\.env(?:\.|$)/.test(base) ||
      /(^|\/)(secrets?|credentials?)(\/|$)/i.test(path) ||
      /(^|\/)(id_rsa|id_ed25519|.*\.(pem|key|p12|pfx))$/i.test(path)) {
    throw new Error('Access to secret and private-key files is blocked.');
  }
  return path;
}
function redact(value) {
  return String(value || '')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]')
    .replace(/(AIza[0-9A-Za-z_-]{20,})/g, '[REDACTED_API_KEY]')
    .replace(/((?:token|secret|password|api[_-]?key)\s*[:=]\s*)[^\s,"]+/gi, '$1[REDACTED]');
}
function serviceCheck(name) {
  const id = SERVICES[name];
  if (!id) throw new Error('Choose uranium-bot or uranium-web.');
  return id;
}
function stage(userId, action) {
  for (const [key, value] of pending) if (value.expires < Date.now()) pending.delete(key);
  if (pending.size >= 20) throw new Error('Too many pending confirmations. Confirm or wait for an existing request to expire.');
  const code = crypto.randomInt(100000, 1000000).toString();
  pending.set(code, { userId, action, expires: Date.now() + 5 * 60 * 1000 });
  return { ok: true, pending_confirmation: true, confirmation_code: code, expires_in: '5 minutes', action: action.summary, instruction: 'Confirm in this DM with: !dev confirm ' + code };
}

async function run(name, args, userId) {
  args = args || {};
  if (name === 'github_list_repositories') {
    return { allowed_repositories: [...REPOS], note: 'Only these repositories are accessible.' };
  }
  if (name === 'github_read_file') {
    const repo = repoCheck(cut(args.repository, 120));
    const path = safePath(args.path);
    const data = await request('https://api.github.com/repos/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/'), { headers: githubHeaders() });
    if (Array.isArray(data) || data.type !== 'file') throw new Error('The path is not a file.');
    const decoded = Buffer.from(data.content || '', 'base64').toString('utf8');
    return { repository: repo, path, sha: data.sha, content: cut(decoded, 6000), truncated: decoded.length > 6000 };
  }
  if (name === 'github_write_file') {
    const repo = repoCheck(cut(args.repository, 120));
    const path = safePath(args.path);
    const body = String(args.content ?? '');
    if (body.length > 50000) throw new Error('File exceeds the 50 KB limit.');
    if (!body.trim()) throw new Error('Refusing to write an empty file.');
    const message = cut(args.commit_message || ('Update ' + path), 120);
    const url = 'https://api.github.com/repos/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
    const current = await request(url, { headers: githubHeaders() }).catch(error => {
      if (/Not Found|404/i.test(error.message)) return null;
      throw error;
    });
    const action = { type: 'github_write', repo, path, body, message, sha: current?.sha || null, summary: (current ? 'Update' : 'Create') + ' ' + repo + '/' + path };
    return stage(userId, action);
  }
  if (name === 'render_list_deploys') {
    const serviceName = cut(args.service, 40);
    const serviceId = serviceCheck(serviceName);
    const data = await request('https://api.render.com/v1/services/' + serviceId + '/deploys?limit=5', { headers: renderHeaders() });
    return { service: serviceName, deployments: (Array.isArray(data) ? data : []).map(x => ({ id: x.deploy?.id || x.id, status: x.deploy?.status || x.status, commit: x.deploy?.commit?.id || x.commit?.id, createdAt: x.deploy?.createdAt || x.createdAt })).slice(0, 5) };
  }
  if (name === 'render_read_logs') {
    const serviceName = cut(args.service, 40);
    const serviceId = serviceCheck(serviceName);
    const params = new URLSearchParams({ resource: serviceId, limit: '30', direction: 'backward', type: 'app' });
    const data = await request('https://api.render.com/v1/logs?' + params.toString(), { headers: renderHeaders() });
    return { service: serviceName, logs: cut(redact(JSON.stringify(data)), 7000) };
  }
  if (name === 'render_deploy') {
    const serviceName = cut(args.service, 40);
    serviceCheck(serviceName);
    return stage(userId, { type: 'render_deploy', service: serviceName, summary: 'Deploy ' + serviceName });
  }
  throw new Error('Unknown developer action.');
}

async function confirm(userId, code) {
  const key = String(code || '');
  const item = pending.get(key);
  if (!item || item.userId !== userId || item.expires < Date.now()) {
    pending.delete(key);
    return { ok: false, error: 'Confirmation code is invalid, expired, or belongs to another user.' };
  }
  pending.delete(key);
  const action = item.action;
  if (action.type === 'github_write') {
    const url = 'https://api.github.com/repos/' + action.repo + '/contents/' + action.path.split('/').map(encodeURIComponent).join('/');
    const payload = { message: action.message, content: Buffer.from(action.body, 'utf8').toString('base64'), branch: 'main' };
    if (action.sha) payload.sha = action.sha;
    const data = await request(url, { method: 'PUT', headers: { ...githubHeaders(), 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return { ok: true, action: action.summary, commit: data.commit?.sha, note: 'GitHub commit created. Render auto-deploy will run if this repository is connected to a service.' };
  }
  if (action.type === 'render_deploy') {
    const serviceId = serviceCheck(action.service);
    const data = await request('https://api.render.com/v1/services/' + serviceId + '/deploys', {
      method: 'POST', headers: { ...renderHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ clearCache: 'do_not_clear' })
    });
    return { ok: true, action: action.summary, deployId: data.id || data.deploy?.id, status: data.status || data.deploy?.status || 'created' };
  }
  return { ok: false, error: 'Unsupported pending action.' };
}
module.exports = { run, confirm };
