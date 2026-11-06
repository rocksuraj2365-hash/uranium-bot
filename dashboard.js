(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = { user:null, guilds:[], filter:'manageable', query:'' };
  const commandGroups = [
    ['member','👥','Member tools','Manage member moderation, warnings, notes and actions.'],
    ['message','💬','Message tools','Message cleanup and channel conversation utilities.'],
    ['channel','#️⃣','Channel tools','Channel configuration, locking and management.'],
    ['role','🎭','Role tools','Role assignment and role administration.'],
    ['voice','🔊','Voice tools','Voice channel utilities and member controls.'],
    ['server','🏠','Server tools','Server information and configuration utilities.'],
    ['automod','🛡️','Auto moderation','Automated moderation rules and protection.'],
    ['info','ℹ️','Information','Useful information about members, servers and Uranium.'],
    ['music','🎵','Music','Music playback and voice-session controls.'],
    ['ai','🤖','Uranium AI','AI chat, AI channel and AI settings.'],
    ['premium','💎','Premium','Additional community and owner tools.']
  ];
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const avatar = (g) => g.icon ? 'https://cdn.discordapp.com/icons/'+g.id+'/'+g.icon+'.png?size=96' : '';
  const initials = (s) => String(s||'?').trim().slice(0,2).toUpperCase();
  const iconHTML = (g) => avatar(g) ? '<img class="server-avatar" src="'+avatar(g)+'" alt="" loading="lazy">' : '<span class="server-avatar server-avatar-fallback">'+escapeHTML(initials(g.name))+'</span>';
  function toast(message) {
    const el=$('#toast'); el.textContent=message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2300);
  }
  function renderCard(g) {
    const canManage=!!g.manageable;
    const card=document.createElement('article'); card.className='server-card';
    const avatarNode=avatar(g) ? '<img class="server-avatar" src="'+avatar(g)+'" alt="" loading="lazy">' : '<span class="server-avatar server-avatar-fallback">'+escapeHTML(initials(g.name))+'</span>';
    card.innerHTML='<div class="server-card-top">'+avatarNode+'<span class="permission '+(canManage?'permission-good':'permission-muted')+'">'+(canManage?'✓ Manageable':'View only')+'</span></div>'+
      '<h3>'+escapeHTML(g.name)+'</h3><p class="server-id">ID · '+escapeHTML(g.id)+'</p>'+
      '<div class="server-card-actions">'+
      (canManage?'<a class="button button-primary button-small" href="https://discord.com/channels/'+encodeURIComponent(g.id)+'" target="_blank" rel="noopener">Open server ↗</a>':'<span class="button button-disabled button-small">No manage access</span>')+
      '<button class="copy-btn" type="button" data-copy="'+escapeHTML(g.id)+'" aria-label="Copy server ID" title="Copy server ID">▣</button></div>';
    return card;
  }
  function filteredGuilds() {
    return state.guilds.filter(g=>(state.filter==='all'||g.manageable)&&g.name.toLowerCase().includes(state.query.toLowerCase()));
  }
  function fillGrid(target, list, emptyText) {
    const box=$(target); box.replaceChildren();
    if(!list.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent=emptyText;box.append(empty);return;}
    list.forEach(g=>box.append(renderCard(g)));
  }
  function renderServers() {
    const manageable=state.guilds.filter(g=>g.manageable);
    $('#statTotal').textContent=state.guilds.length;
    $('#statManageable').textContent=manageable.length;
    fillGrid('#featuredServers',manageable.slice(0,3),'No manageable servers were found for this Discord account.');
    const list=filteredGuilds();
    fillGrid('#allServers',list,state.filter==='manageable'?'No manageable servers match your search.':'No servers match your search.');
    $('#serverCount').textContent='Showing '+list.length+' of '+(state.filter==='all'?state.guilds.length:manageable.length)+' servers';
  }
  function renderCommands(query='') {
    const grid=$('#commandGrid'); grid.replaceChildren();
    const items=commandGroups.filter(x=>(x[0]+' '+x[2]+' '+x[3]).toLowerCase().includes(query.toLowerCase()));
    if(!items.length){const e=document.createElement('div');e.className='empty-state';e.textContent='No command groups match that search.';grid.append(e);return;}
    items.forEach(([key,emoji,title,desc])=>{
      const card=document.createElement('article');card.className='command-card';
      card.innerHTML='<span class="command-icon">'+emoji+'</span><div><span class="command-key">/'+key+'</span><h3>'+title+'</h3><p>'+desc+'</p></div><span class="command-arrow">↗</span>';
      grid.append(card);
    });
  }
  function go(view) {
    $$('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+view));
    $$('.side-link[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
    const labels={overview:'Overview',servers:'My servers',commands:'Command library'};
    $('#pageCrumb').textContent=labels[view]||'Overview';
    $('#sidebar').classList.remove('open');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function load() {
    $('#refreshBtn').classList.add('spinning');
    try {
      const me=await fetch('/api/me',{credentials:'same-origin'});
      if(!me.ok){location.href='/login';return;}
      state.user=await me.json();
      $('#profileName').textContent=state.user.username||'Discord user';
      const profile=$('#profile');
      if(state.user.avatar) profile.querySelector('.avatar-fallback')?.remove(),profile.insertAdjacentHTML('afterbegin','<img class="profile-avatar" src="https://cdn.discordapp.com/avatars/'+encodeURIComponent(state.user.id)+'/'+encodeURIComponent(state.user.avatar)+'.png?size=64" alt="">');
      const res=await fetch('/api/guilds',{credentials:'same-origin'});
      if(!res.ok) throw new Error('Could not load your Discord servers.');
      state.guilds=await res.json();
      renderServers();
    } catch(e) { toast(e.message||'Something went wrong.'); }
    finally { $('#refreshBtn').classList.remove('spinning'); }
  }
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-view]');if(nav){go(nav.dataset.view);return;}
    const jump=e.target.closest('[data-go]');if(jump){go(jump.dataset.go);return;}
    const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===filter));renderServers();return;}
    const copy=e.target.closest('[data-copy]');if(copy){navigator.clipboard?.writeText(copy.dataset.copy).then(()=>toast('Server ID copied')).catch(()=>toast('Could not copy.'));return;}
  });
  $('#serverSearch').addEventListener('input',e=>{state.query=e.target.value;renderServers();});
  $('#commandSearch').addEventListener('input',e=>renderCommands(e.target.value));
  $('#refreshBtn').addEventListener('click',load);
  $('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  renderCommands();load();
})();