export const CONTROL_DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>mxwl agent control</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e5e5e5;background:#09090b}*{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#18181b 0,#09090b 46%)}
    header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #27272a;background:#09090be8;backdrop-filter:blur(12px)}
    h1{font-size:15px;margin:0}.muted{color:#71717a;font-size:11px}.spacer{flex:1}button,input{font:inherit}
    button{border:1px solid #3f3f46;background:#18181b;color:#d4d4d8;border-radius:7px;padding:7px 10px;cursor:pointer}button:hover{border-color:#71717a}button.primary{background:#7c3aed;border-color:#8b5cf6;color:white}
    main{max-width:1100px;margin:auto;padding:18px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.metric{padding:12px;border:1px solid #27272a;border-radius:9px;background:#111113}.metric b{display:block;font-size:22px}.metric span{font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:.08em}
    .section{margin:20px 0 8px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.1em}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}.card{border:1px solid #27272a;border-radius:10px;background:#111113;padding:12px}.top{display:flex;align-items:flex-start;gap:9px}.dot{width:9px;height:9px;border-radius:50%;margin-top:5px;flex:none}.working{background:#38bdf8}.attention{background:#fbbf24}.idle{background:#52525b}.error{background:#f87171}.starting{background:#a78bfa}.title{font-weight:600;font-size:13px}.meta{font-size:10px;color:#71717a;margin-top:2px}.activity{font-size:12px;color:#d4d4d8;margin:10px 0;min-height:18px}.actions{display:flex;gap:6px;flex-wrap:wrap}.prompt{display:flex;gap:6px;margin-top:10px}.prompt input{min-width:0;flex:1;border:1px solid #3f3f46;background:#09090b;color:#f4f4f5;border-radius:7px;padding:7px}.permission{margin-top:10px;padding:9px;border:1px solid #78350f;background:#451a031f;border-radius:8px;font-size:11px}.notice{display:flex;gap:9px;padding:10px;border-bottom:1px solid #27272a}.notice:last-child{border:0}.notice button{margin-left:auto}.empty{padding:24px;text-align:center;color:#52525b}.auth{max-width:430px;margin:15vh auto;padding:20px;border:1px solid #3f3f46;border-radius:12px;background:#111113}.auth input{width:100%;margin:12px 0;border:1px solid #52525b;background:#09090b;color:white;border-radius:7px;padding:9px}
    @media(max-width:620px){header{padding:12px}main{padding:12px}.summary{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.desktop-label{display:none}}
  </style>
</head>
<body>
  <div id="auth" class="auth" hidden><h1>Connect to mxwl</h1><p class="muted">Paste the control token from mxwl Settings. It stays in this browser.</p><input id="tokenInput" type="password" placeholder="Control token"><button class="primary" onclick="saveToken()">Connect</button></div>
  <div id="app" hidden>
    <header><h1>mxwl agent control</h1><span id="connection" class="muted">connecting…</span><span class="spacer"></span><button onclick="refresh()">Refresh</button></header>
    <main><div id="summary" class="summary"></div><div class="section">Agents across every machine</div><div id="agents" class="grid"></div><div class="section">Needs attention</div><div id="attention" class="card"></div></main>
  </div>
  <script>
    var token = localStorage.getItem('mxwl.controlToken') || new URLSearchParams(location.search).get('token') || '';
    if (new URLSearchParams(location.search).has('token')) { localStorage.setItem('mxwl.controlToken', token); history.replaceState({}, '', location.pathname); }
    function saveToken(){ token=document.getElementById('tokenInput').value.trim(); localStorage.setItem('mxwl.controlToken',token); start(); }
    function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
    async function api(path,options){options=options||{};options.headers=Object.assign({'Authorization':'Bearer '+token,'Content-Type':'application/json'},options.headers||{});var r=await fetch(path,options);if(r.status===401){localStorage.removeItem('mxwl.controlToken');token='';start();throw new Error('Unauthorized')}if(!r.ok)throw new Error(await r.text());return r.status===204?null:r.json()}
    function start(){document.getElementById('auth').hidden=!!token;document.getElementById('app').hidden=!token;if(token)refresh()}
    async function refresh(){try{var data=await api('/api/status');render(data);document.getElementById('connection').textContent='live · '+new Date().toLocaleTimeString()}catch(e){document.getElementById('connection').textContent=e.message}}
    function render(data){var counts={working:0,attention:0,idle:0,error:0};data.agents.forEach(function(a){counts[a.activity.state]=(counts[a.activity.state]||0)+1});document.getElementById('summary').innerHTML=['working','attention','idle','error'].map(function(k){return '<div class="metric"><b>'+counts[k]+'</b><span>'+k+'</span></div>'}).join('');document.getElementById('agents').innerHTML=data.agents.length?data.agents.map(agentCard).join(''):'<div class="empty">No live agents</div>';document.getElementById('attention').innerHTML=data.attention.length?data.attention.map(notice).join(''):'<div class="empty">Nothing needs you</div>'}
    function agentCard(a){var p=a.permission;return '<article class="card"><div class="top"><i class="dot '+esc(a.activity.state)+'"></i><div><div class="title">'+esc(a.workspaceTitle)+' · '+esc(a.agentLabel)+'</div><div class="meta">'+esc(a.hostLabel)+' · '+esc(a.cwd)+'</div></div></div><div class="activity">'+esc(a.activity.summary)+'</div>'+(p?'<div class="permission"><b>'+esc(p.title)+'</b><div class="actions" style="margin-top:7px">'+p.options.map(function(o){return '<button onclick="respond(\''+esc(a.wsId)+'\',\''+esc(p.requestId)+'\',\''+esc(o.optionId)+'\')">'+esc(o.name)+'</button>'}).join('')+'</div></div>':'')+'<div class="actions"><button onclick="focusAgent(\''+esc(a.wsId)+'\')">Open in mxwl</button></div><div class="prompt"><input id="prompt-'+esc(a.wsId)+'" placeholder="Send an instruction…"><button class="primary" onclick="promptAgent(\''+esc(a.wsId)+'\')">Send</button></div></article>'}
    function notice(n){return '<div class="notice"><i class="dot '+esc(n.kind==='done'?'idle':n.kind)+'"></i><div><div class="title">'+esc(n.title)+'</div><div class="meta">'+esc(n.detail)+'</div></div><button onclick="focusAgent(\''+esc(n.wsId)+'\')">Open</button></div>'}
    async function focusAgent(id){await api('/api/agents/'+encodeURIComponent(id)+'/focus',{method:'POST'});}
    async function promptAgent(id){var input=document.getElementById('prompt-'+id);var text=input.value.trim();if(!text)return;input.value='';await api('/api/agents/'+encodeURIComponent(id)+'/prompt',{method:'POST',body:JSON.stringify({text:text,wait:false})});refresh()}
    async function respond(id,requestId,optionId){await api('/api/agents/'+encodeURIComponent(id)+'/respond',{method:'POST',body:JSON.stringify({requestId:requestId,optionId:optionId})});refresh()}
    start();setInterval(function(){if(!document.hidden&&token)refresh()},2500);
  </script>
</body>
</html>`
