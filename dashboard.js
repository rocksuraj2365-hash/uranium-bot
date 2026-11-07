(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = { user:null, guilds:[], filter:'manageable', query:'', selectedGuild:null, channels:[], commandCatalog:[], commandPage:0, commandCategory:'all', commandQuery:'' };
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
      (canManage?'<button class="button button-primary button-small" type="button" data-configure="'+escapeHTML(g.id)+'">⚙ Configure</button><a class="button button-secondary button-small" href="https://discord.com/channels/'+encodeURIComponent(g.id)+'" target="_blank" rel="noopener">Open ↗</a>':'<span class="button button-disabled button-small">No manage access</span>')+
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
  function renderCommands(query=state.commandQuery) {
    state.commandQuery=query;
    const grid=$('#commandGrid'); if(!grid) return;
    const all=state.commandCatalog.flatMap(category=>category.commands.map(command=>({...command,category:category.name})));
    const q=String(query||'').trim().toLowerCase();
    const items=all.filter(command=>(state.commandCategory==='all'||command.category===state.commandCategory)&&
      (!q||[command.name,command.description,command.category,command.slash,command.prefix,command.access].join(' ').toLowerCase().includes(q)));
    const pageSize=30, pages=Math.max(1,Math.ceil(items.length/pageSize));
    state.commandPage=Math.max(0,Math.min(state.commandPage,pages-1));
    const start=state.commandPage*pageSize, visible=items.slice(start,start+pageSize);
    grid.replaceChildren();
    if(!visible.length){const e=document.createElement('div');e.className='empty-state';e.textContent='No commands match your search. Try another word or category.';grid.append(e);}
    visible.forEach(item=>{
      const card=document.createElement('article');card.className='command-card';
      const restricted=item.access&&item.access!=='Available subject to command permissions';
      card.innerHTML='<span class="command-icon">'+escapeHTML(({member:'👤',message:'💬',channel:'📺',role:'🏷️',voice:'🔊',server:'🏰',automod:'🛡️',info:'ℹ️',music:'🎵',ai:'🤖',premium:'💎',license:'🔑',utility:'🧮',community:'🌐',fun:'🎮',servertools:'🧰',support:'📨'})[item.category]||'📚')+'</span><div><span class="command-key">'+escapeHTML(item.slash)+'</span><h3>'+escapeHTML(item.name)+'</h3><p>'+escapeHTML(item.description)+'</p><div class="command-meta"><code class="command-syntax">'+escapeHTML(item.prefix)+'</code>'+(restricted?'<span class="command-access">'+escapeHTML(item.access)+'</span>':'')+'</div></div>';
      grid.append(card);
    });
    const count=$('#commandCount'); if(count) count.textContent=items.length?'Showing '+(start+1)+'–'+Math.min(start+pageSize,items.length)+' of '+items.length+' commands':'0 commands';
    const label=$('#commandPageLabel'); if(label) label.textContent='Page '+(state.commandPage+1)+' of '+pages;
    const prev=$('#commandPrev'), next=$('#commandNext'); if(prev) prev.disabled=state.commandPage===0; if(next) next.disabled=state.commandPage>=pages-1;
  }
  async function loadCommandCatalog() {
    try {
      const response=await fetch('/commands.json',{cache:'no-store'}); if(!response.ok) throw new Error('Command catalog could not be loaded.');
      const data=await response.json(); state.commandCatalog=Array.isArray(data.categories)?data.categories:[];
      const select=$('#commandCategory'); if(select){select.replaceChildren(new Option('All categories ('+(data.total||0)+')','all'));state.commandCatalog.forEach(category=>select.add(new Option(category.name+' ('+category.commands.length+')',category.name)));}
      renderCommands();
    } catch(error) {
      const count=$('#commandCount'); if(count) count.textContent=error.message||'Catalog unavailable';
      const grid=$('#commandGrid'); if(grid){grid.replaceChildren();const e=document.createElement('div');e.className='empty-state';e.textContent='Could not load the command catalog. Refresh the page to retry.';grid.append(e);}
    }
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
  async function configureGuild(id) {
    const guild=state.guilds.find(g=>g.id===id); if(!guild || !guild.manageable) return;
    state.selectedGuild=guild; $('#guildSettings').hidden=false; $('#settingsTitle').textContent=guild.name+' settings';
    $('#settingsStatus').textContent='Connecting to Uranium bot… this may take a little while if the service is waking up.';
    $('#settingsFeedback').textContent=''; $('#saveSettings').disabled=true; go('servers');
    try {
      const response=await fetch('/api/guilds/'+encodeURIComponent(id)+'/control',{credentials:'same-origin'}); const data=await response.json();
      if(!response.ok) throw new Error(data.error||'Could not load server settings.');
      state.channels=data.channels||[];
      const fill=(selector,label,selected)=>{const el=$(selector);el.replaceChildren(new Option(label,''));state.channels.forEach(ch=>el.add(new Option('# '+ch.name,ch.id)));el.value=selected||'';};
      $('#settingPrefix').value=data.settings.prefix||'!'; $('#settingAI').checked=data.settings.ai!==false;
      fill('#settingAIChannel','No automatic AI channel',data.settings.aiChannel); fill('#settingModlog','Disabled',data.settings.modlog);
      $('#settingsStatus').textContent='Connected. Changes apply to this server’s bot configuration.'; $('#saveSettings').disabled=false;
    } catch(error) { $('#settingsStatus').textContent=error.message||'Could not load settings.'; }
  }
  async function saveSettings() {
    if(!state.selectedGuild) return; const button=$('#saveSettings'); button.disabled=true; button.textContent='Saving…'; $('#settingsFeedback').textContent='';
    try {
      const response=await fetch('/api/guilds/'+encodeURIComponent(state.selectedGuild.id)+'/control',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({prefix:$('#settingPrefix').value,ai:$('#settingAI').checked,aiChannel:$('#settingAIChannel').value,modlog:$('#settingModlog').value})});
      const data=await response.json(); if(!response.ok) throw new Error(data.error||'Could not save settings.');
      $('#settingsFeedback').textContent='Saved ✓'; $('#settingsStatus').textContent='Settings saved successfully.'; toast('Server settings saved');
    } catch(error) { $('#settingsFeedback').textContent=error.message||'Save failed.'; }
    finally { button.disabled=false; button.textContent='Save server settings'; }
  }
  document.addEventListener('click',e=>{
    const page=e.target.closest('[data-cmd-page]');if(page){state.commandPage+=Number(page.dataset.cmdPage);renderCommands();return;}
    const config=e.target.closest('[data-configure]');if(config){configureGuild(config.dataset.configure);return;}
    const nav=e.target.closest('[data-view]');if(nav){go(nav.dataset.view);return;}
    const jump=e.target.closest('[data-go]');if(jump){go(jump.dataset.go);return;}
    const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===filter));renderServers();return;}
    const copy=e.target.closest('[data-copy]');if(copy){if(!navigator.clipboard?.writeText){toast('Clipboard is unavailable in this browser.');return;}navigator.clipboard.writeText(copy.dataset.copy).then(()=>toast('Server ID copied')).catch(()=>toast('Could not copy.'));return;}
  });
  $('#serverSearch').addEventListener('input',e=>{state.query=e.target.value;renderServers();});
  $('#commandSearch').addEventListener('input',e=>{state.commandPage=0;renderCommands(e.target.value);});
  $('#commandCategory').addEventListener('change',e=>{state.commandCategory=e.target.value;state.commandPage=0;renderCommands();});
  $('#refreshBtn').addEventListener('click',load);
  $('#saveSettings').addEventListener('click',saveSettings);
  $('#closeSettings').addEventListener('click',()=>{$('#guildSettings').hidden=true;state.selectedGuild=null;});
  $('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  loadCommandCatalog();load();
})();