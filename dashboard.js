(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const state = { guilds: [], filter: 'all', q: '', gid: null, data: null, tab: 'Overview', timer: null };

  function toast(msg, kind = '') { const t = h('div', { class: `toast ${kind}`, text: msg }); $('#toasts').append(t); setTimeout(() => t.remove(), 3500); }
  async function api(path, body) {
    const opt = body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Uranium': '1' }, body: JSON.stringify(body) };
    const r = await fetch(path, opt);
    if (r.status === 401) { location.href = '/login'; throw new Error('login'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Request failed'); e.data = j; throw e; }
    return j;
  }
  const fail = (e) => { if (e.message !== 'login') toast(e.message, 'bad'); };
  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); toast(`${label} copied`, 'ok'); } catch { toast('Copy is not allowed in this browser', 'bad'); } };
  const icon = (g, size = 96) => g.icon ? h('img', { src: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=${size}`, alt: '', loading: 'lazy' }) : (g.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const fmtUp = (s) => { const d = Math.floor(s / 86400), hr = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60; return d ? `${d}d ${hr}h` : hr ? `${hr}h ${m}m` : `${m}m`; };

  function countTo(el, to, suffix = '') {
    if (typeof to !== 'number') { el.textContent = to; return; }
    const t0 = performance.now(); const step = (t) => { const p = Math.min(1, (t - t0) / 700); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suffix; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  async function loadStats() {
    try {
      const s = await fetch('/api/stats').then((r) => r.json());
      const set = (k, v, suf) => countTo($(`[data-stat="${k}"]`), v, suf);
      if (s.mode === 'combined') { set('servers', s.servers); set('ping', s.ping); $('[data-stat="uptime"]').textContent = fmtUp(s.uptime); }
      else { ['servers', 'ping', 'uptime'].forEach((k) => { $(`[data-stat="${k}"]`).textContent = 'n/a'; }); }
    } catch { /* stats are optional */ }
  }

  function renderGuilds() {
    const box = $('#servers'); box.replaceChildren();
    const q = state.q.toLowerCase();
    const list = state.guilds.filter((g) => g.name.toLowerCase().includes(q) && (state.filter === 'all' || (state.filter === 'manage' && g.manageable) || (state.filter === 'bot' && g.botIn)));
    if (!list.length) { box.append(h('div', { class: 'empty', text: state.guilds.length ? 'No server matches this filter.' : 'No servers found on your account.' })); return; }
    list.forEach((g, i) => {
      const actions = [];
      if (!g.manageable) actions.push(h('button', { class: 'btn', disabled: true, text: 'No access' }));
      else if (g.botIn === false) actions.push(h('a', { class: 'btn primary', href: `/invite?guild_id=${g.id}`, text: '+ Add Uranium' }));
      else actions.push(h('button', { class: 'btn primary', type: 'button', text: 'Manage', onclick: () => openPanel(g) }));
      actions.push(h('button', { class: 'btn', type: 'button', text: 'Copy ID', onclick: () => copy(g.id, 'Server ID') }));
      box.append(h('div', { class: 'sv', style: `animation-delay:${Math.min(i, 12) * 40}ms` },
        h('div', { class: 'sv-top' }, h('span', { class: 'icon' }, icon(g)), h('span', { class: 'sv-name', text: g.name })),
        h('div', { class: 'badges' }, g.manageable ? h('span', { class: 'badge ok', text: 'Manage Server' }) : h('span', { class: 'badge', text: 'Member' }), g.botIn === true ? h('span', { class: 'badge ok', text: 'Uranium added' }) : g.botIn === false ? h('span', { class: 'badge warn', text: 'Uranium missing' }) : null),
        h('div', { class: 'btns' }, actions)));
    });
  }
  async function loadGuilds() {
    const box = $('#servers'); box.replaceChildren(h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' }));
    try {
      state.guilds = (await api('/api/guilds')).sort((a, b) => Number(b.manageable) - Number(a.manageable) || a.name.localeCompare(b.name));
      countTo($('[data-stat="mine"]'), state.guilds.filter((g) => g.manageable).length); renderGuilds();
    } catch (e) { fail(e); box.replaceChildren(h('div', { class: 'empty', text: 'Could not load your servers. Try Refresh.' })); }
  }

  /* ---------- panel ---------- */
  const TABS = ['Overview', 'Settings', 'Cases', 'Music', 'Actions'];
  function closePanel() { $('#panel').classList.remove('on'); $('#scrim').classList.remove('on'); $('#panel').setAttribute('aria-hidden', 'true'); clearInterval(state.timer); state.gid = null; }
  async function openPanel(g) {
    state.gid = g.id; state.tab = 'Overview'; state.data = null;
    $('#pName').textContent = g.name; $('#pIcon').replaceChildren(icon(g, 64));
    $('#panel').classList.add('on'); $('#scrim').classList.add('on'); $('#panel').setAttribute('aria-hidden', 'false');
    renderTabs(); $('#pBody').replaceChildren(h('div', { class: 'skel' }));
    await reload();
  }
  function renderTabs() {
    $('#tabs').replaceChildren(...TABS.map((t) => h('button', { class: `tab${t === state.tab ? ' active' : ''}`, type: 'button', text: t, onclick: () => { state.tab = t; renderTabs(); renderTab(); } })));
  }
  async function reload() {
    try { state.data = await api(`/api/guild/${state.gid}`); renderTab(); }
    catch (e) { fail(e); $('#pBody').replaceChildren(h('p', { class: 'note', text: e.data && e.data.needsInvite ? 'Uranium is not in this server yet. Use "Add Uranium" on the server card.' : e.message })); }
  }
  function renderTab() {
    clearInterval(state.timer); const d = state.data; if (!d) return; const body = $('#pBody'); body.replaceChildren();
    ({ Overview: tabOverview, Settings: tabSettings, Cases: tabCases, Music: tabMusic, Actions: tabActions })[state.tab](body, d);
  }
  const tile = (v, l) => h('div', { class: 'tile' }, h('b', { text: String(v) }), h('span', { text: l }));
  function tabOverview(b, d) {
    b.append(h('div', { class: 'tiles' }, tile(d.members, 'Members'), tile(d.channelCount, 'Channels'), tile(d.totals.cases, 'Cases saved'), tile(d.totals.warns, 'Warnings')),
      h('div', { class: 'row' }, h('label', {}, 'Prefix', h('small', { text: 'Used for short commands like ' + d.prefix + 'help' })), h('span', {}, h('code', { text: d.prefix }), ' ', h('button', { class: 'btn', type: 'button', text: 'Copy', onclick: () => copy(d.prefix, 'Prefix') }))),
      h('div', { class: 'row' }, h('label', { text: 'AI assistant' }), h('span', { class: `badge ${d.ai ? 'ok' : 'warn'}`, text: d.ai ? 'On' : 'Off' })),
      h('div', { class: 'row' }, h('label', { text: 'Mod log channel' }), h('span', { text: d.modlog ? '#' + (d.channels.find((c) => c.id === d.modlog) || { name: 'unknown' }).name : 'Not set' })),
      h('div', { class: 'row' }, h('label', { text: 'Server ID' }), h('button', { class: 'btn', type: 'button', text: 'Copy ID', onclick: () => copy(d.id, 'Server ID') })),
      h('p', { class: 'note', text: 'Use the tabs above to change settings, review cases, control music and run quick actions.' }));
  }
  function chanSelect(d, value, none) { return h('select', { class: 'field' }, h('option', { value: '', text: none }), d.channels.map((c) => h('option', { value: c.id, text: '#' + c.name, selected: c.id === value }))); }
  function tabSettings(b, d) {
    const prefix = h('input', { class: 'field', value: d.prefix, maxlength: '3', 'aria-label': 'Prefix' });
    let ai = d.ai; const sw = h('button', { class: 'sw', type: 'button', 'aria-pressed': String(ai), 'aria-label': 'AI assistant', onclick: () => { ai = !ai; sw.setAttribute('aria-pressed', String(ai)); } });
    const aiCh = chanSelect(d, d.aiChannel, 'None (answer only when asked)'); const log = chanSelect(d, d.modlog, 'None'); const appeal = h('input', { class: 'field', value: d.appeal || '', placeholder: 'https://…', maxlength: '190', 'aria-label': 'Appeal link' });
    const save = h('button', { class: 'btn primary', type: 'button', text: 'Save changes', onclick: async () => {
      save.disabled = true; try { const r = await api(`/api/guild/${d.id}/settings`, { prefix: prefix.value.trim(), ai, aiChannel: aiCh.value || null, modlog: log.value || null, appeal: appeal.value.trim() || null }); Object.assign(state.data, r); toast('Settings saved', 'ok'); } catch (e) { fail(e); } save.disabled = false; } });
    b.append(h('div', { class: 'row' }, h('label', {}, 'Prefix', h('small', { text: '1 to 3 characters, no spaces' })), prefix),
      h('div', { class: 'row' }, h('label', {}, 'AI assistant', h('small', { text: 'Let members talk to Uranium AI' })), sw),
      h('div', { class: 'row' }, h('label', {}, 'AI chat channel', h('small', { text: 'The AI answers every message here' })), aiCh),
      h('div', { class: 'row' }, h('label', {}, 'Mod log channel', h('small', { text: 'Where moderation actions are logged' })), log),
      h('div', { class: 'row' }, h('label', {}, 'Ban appeal link', h('small', { text: 'Shown to people Uranium notifies' })), appeal),
      h('div', { class: 'btns' }, save));
  }
  function tabCases(b, d) {
    const types = ['all', ...new Set(d.cases.map((c) => c.type))]; let f = 'all'; const list = h('div');
    const draw = () => { list.replaceChildren(); const items = d.cases.filter((c) => f === 'all' || c.type === f); if (!items.length) list.append(h('p', { class: 'note', text: 'No cases to show.' }));
      items.forEach((c) => { let armed = false; const del = h('button', { class: 'btn danger', type: 'button', text: 'Delete', onclick: async () => {
        if (!armed) { armed = true; del.textContent = 'Sure?'; setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 3000); return; }
        try { await api(`/api/guild/${d.id}/case-delete`, { id: c.id }); d.cases = d.cases.filter((x) => x.id !== c.id); toast(`Case #${c.id} deleted`, 'ok'); draw(); } catch (e) { fail(e); } } });
        list.append(h('div', { class: 'case' }, h('div', {}, h('b', { text: `#${c.id} · ${c.type}` }), h('p', { text: `User ${c.userId} · by ${c.modId} · ${new Date(c.at).toLocaleString()}` }), h('p', { text: c.reason || 'No reason' })), del)); }); };
    b.append(h('div', { class: 'chips' }, types.map((t) => h('button', { class: `chip${t === f ? ' active' : ''}`, type: 'button', text: t, onclick: (ev) => { f = t; [...ev.target.parentNode.children].forEach((x) => x.classList.toggle('active', x === ev.target)); draw(); } }))), h('p', { class: 'note', text: `Showing the latest ${d.cases.length} of ${d.totals.cases} saved cases.` }), list); draw();
  }
  function tabMusic(b, d) {
    const box = h('div'); b.append(box);
    const draw = (m) => { box.replaceChildren(h('div', { class: 'tiles' }, tile(m.playing ? m.station : 'Nothing playing', 'Now playing'), tile(m.volume != null ? m.volume + '%' : '–', 'Volume')),
      h('div', { class: `eq${m.playing ? '' : ' off'}` }, [0, 1, 2, 3, 4].map(() => h('i'))),
      h('div', { class: 'btns' }, [['pause', '⏸ Pause'], ['resume', '▶ Resume'], ['stop', '⏹ Stop']].map(([a, t]) => h('button', { class: 'btn', type: 'button', disabled: !m.playing, text: t, onclick: () => act(a) })),
        h('button', { class: 'btn', type: 'button', disabled: !m.playing, text: '🔉 −10', onclick: () => act('volume', Math.max(1, (m.volume || 50) - 10)) }), h('button', { class: 'btn', type: 'button', disabled: !m.playing, text: '🔊 +10', onclick: () => act('volume', Math.min(100, (m.volume || 50) + 10)) })),
      h('div', { class: 'row' }, h('label', {}, '24/7 mode', h('small', { text: 'Stay in the voice channel and rejoin automatically' })), h('button', { class: 'sw', type: 'button', 'aria-pressed': String(m.is247), disabled: !m.playing && !m.is247, 'aria-label': '24/7 mode', onclick: () => act('247', !m.is247) })),
      h('p', { class: 'note', text: 'To start music, join a voice channel and use /music play or /music panel in Discord.' })); };
    async function act(action, value) { try { const r = await api(`/api/guild/${d.id}/music`, { action, value }); d.music = r.music; draw(r.music); toast('Done', 'ok'); } catch (e) { fail(e); } }
    draw(d.music);
    state.timer = setInterval(async () => { if (state.tab !== 'Music' || !state.gid) return; try { const x = await api(`/api/guild/${d.id}`); d.music = x.music; draw(x.music); } catch { /* keep last view */ } }, 6000);
  }
  function tabActions(b, d) {
    const sel = chanSelect(d, null, 'Choose a channel…'); sel.firstChild.disabled = true; sel.value = '';
    const go = (lock) => async (ev) => { if (!sel.value) return toast('Choose a channel first', 'bad'); const btn = ev.currentTarget; btn.disabled = true; try { await api(`/api/guild/${d.id}/lock`, { channelId: sel.value, lock }); toast(lock ? 'Channel locked for @everyone' : 'Channel unlocked', 'ok'); } catch (e) { fail(e); } btn.disabled = false; };
    b.append(h('div', { class: 'row' }, h('label', {}, 'Channel', h('small', { text: 'Lock stops @everyone from sending messages' })), sel),
      h('div', { class: 'btns' }, h('button', { class: 'btn danger', type: 'button', text: '🔒 Lock', onclick: go(true) }), h('button', { class: 'btn', type: 'button', text: '🔓 Unlock', onclick: go(false) })),
      h('p', { class: 'note', text: 'These actions use the same Discord permissions as the bot. For bans, timeouts and more, use Uranium commands in Discord.' }));
  }

  /* ---------- start ---------- */
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
  $('#scrim').addEventListener('click', closePanel); $('#pClose').addEventListener('click', closePanel);
  $('#refresh').addEventListener('click', () => { loadStats(); loadGuilds(); toast('Refreshed', 'ok'); });
  $('#search').addEventListener('input', (e) => { state.q = e.target.value; renderGuilds(); });
  $('#filters').addEventListener('click', (e) => { const f = e.target.dataset && e.target.dataset.f; if (!f) return; state.filter = f; [...$('#filters').children].forEach((c) => c.classList.toggle('active', c === e.target)); renderGuilds(); });
  (async () => {
    try {
      const me = await api('/api/me'); $('#hello').textContent = `Hi, ${me.username}`;
      const chip = $('#user'); chip.replaceChildren(me.avatar ? h('img', { src: `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`, alt: '' }) : '', me.username);
      loadStats(); loadGuilds();
    } catch (e) { fail(e); }
  })();
})();
