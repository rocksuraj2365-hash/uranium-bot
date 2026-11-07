(() => {
  const $ = (id) => document.getElementById(id);
  const PAGE_SIZE = 30;
  const state = { categories: [], page: 0, category: 'all', query: '' };
  const icons = { member:'👤', message:'💬', channel:'📺', role:'🏷️', voice:'🔊', server:'🏰', automod:'🛡️', info:'ℹ️', music:'🎵', ai:'🤖', premium:'💎', license:'🔑', utility:'🧮', community:'🌐', fun:'🎮', servertools:'🧰', support:'📨' };
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function allCommands() {
    return state.categories.flatMap(category => category.commands.map(command => ({ ...command, category: category.name, categoryDescription: category.description })));
  }
  function render() {
    const grid = $('publicCommandGrid');
    const query = state.query.trim().toLowerCase();
    const filtered = allCommands().filter(command =>
      (state.category === 'all' || command.category === state.category) &&
      (!query || [command.name, command.description, command.category, command.slash, command.prefix, command.access].join(' ').toLowerCase().includes(query))
    );
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.page = Math.max(0, Math.min(state.page, pages - 1));
    const start = state.page * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    grid.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No commands match that search. Try another word or category.';
      grid.append(empty);
    } else {
      visible.forEach(command => {
        const card = document.createElement('article');
        card.className = 'command-card';
        const restricted = command.access && command.access !== 'Available subject to command permissions';
        card.innerHTML = '<span class="command-icon">' + (icons[command.category] || '📚') + '</span><div><span class="command-key">' + escapeHTML(command.slash) + '</span><h3>' + escapeHTML(command.name) + '</h3><p>' + escapeHTML(command.description) + '</p><div class="command-meta"><code class="command-syntax">' + escapeHTML(command.prefix) + '</code>' + (restricted ? '<span class="command-access">' + escapeHTML(command.access) + '</span>' : '') + '</div></div>';
        grid.append(card);
      });
    }
    $('publicCommandCount').textContent = filtered.length ? 'Showing ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, filtered.length) + ' of ' + filtered.length + ' commands' : '0 commands';
    $('publicCommandPage').textContent = 'Page ' + (state.page + 1) + ' of ' + pages;
    $('publicCommandPrev').disabled = state.page === 0;
    $('publicCommandNext').disabled = state.page >= pages - 1;
  }
  async function init() {
    try {
      const response = await fetch('/commands.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Command catalog could not be loaded.');
      const data = await response.json();
      state.categories = Array.isArray(data.categories) ? data.categories : [];
      const category = $('publicCommandCategory');
      category.replaceChildren(new Option('All categories (' + (data.total || 0) + ')', 'all'));
      state.categories.forEach(item => category.add(new Option(item.name + ' (' + item.commands.length + ')', item.name)));
      $('publicCommandSummary').textContent = (data.total || allCommands().length) + ' commands across ' + state.categories.length + ' categories • generated from the current command source files';
      render();
    } catch (error) {
      $('publicCommandSummary').textContent = error.message || 'Could not load commands.';
      $('publicCommandGrid').innerHTML = '<div class="empty-state">The command catalog is temporarily unavailable. Please refresh the page.</div>';
    }
  }
  $('publicCommandSearch').addEventListener('input', event => { state.query = event.target.value; state.page = 0; render(); });
  $('publicCommandCategory').addEventListener('change', event => { state.category = event.target.value; state.page = 0; render(); });
  $('publicCommandPrev').addEventListener('click', () => { state.page--; render(); });
  $('publicCommandNext').addEventListener('click', () => { state.page++; render(); });
  init();
})();
