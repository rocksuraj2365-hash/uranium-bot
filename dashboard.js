(async () => {
  const me = await fetch('/api/me');
  if (!me.ok) { location.href = '/login'; return; }
  const user = await me.json();
  document.getElementById('hello').textContent = 'Hi, ' + user.username;
  const res = await fetch('/api/guilds');
  const guilds = (await res.json()).filter((g) => g.manageable);
  const box = document.getElementById('guilds');
  if (!guilds.length) { box.textContent = 'No manageable servers found.'; return; }
  for (const g of guilds) {
    const row = document.createElement('div');
    row.className = 'card row';
    const name = document.createElement('span');
    name.textContent = g.name;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'Manageable';
    row.append(name, tag);
    box.appendChild(row);
  }
})();
