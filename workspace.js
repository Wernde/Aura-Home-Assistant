(()=>{'use strict';
const TYPES=new Set(['calendar','weather','home','scene','shopping','settings','awareness','gateway']);
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const shell=q('#workspaceShell'),title=q('#workspaceTitle'),eyebrow=q('#workspaceEye'),body=q('#workspaceBody'),source=q('#workspaceSource'),fresh=q('#workspaceFreshness'),pin=q('#workspacePin'),expand=q('#workspaceExpand'),close=q('#workspaceClose');
if(!shell)return;
let active=null,pinned=false,state='closed';
const now=()=>new Intl.DateTimeFormat('en-AU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
function validate(type,payload){return TYPES.has(type)&&payload&&typeof payload==='object'}
function setState(next){state=next;shell.dataset.state=next}
function content(type,payload){
 if(type==='calendar'){const rows=qa('#events .event').map(x=>`<div class="workspace-item"><time>${x.querySelector('time')?.textContent||''}</time><div><strong>${x.querySelector('strong')?.textContent||'Event'}</strong><small>Family calendar</small></div></div>`).join('');return rows?`<div class="workspace-list">${rows}</div>`:'<div class="workspace-empty">No shared events are available.</div>'}
 if(type==='weather')return '<div class="workspace-grid"><div class="workspace-tile"><span>Current</span><strong>23° · Partly cloudy</strong></div><div class="workspace-tile"><span>Next change</span><strong>Cooler after sunset</strong></div><div class="workspace-tile"><span>Low / high</span><strong>13° / 26°</strong></div><div class="workspace-tile"><span>Rain chance</span><strong>20%</strong></div></div>';
 if(type==='home')return '<div class="workspace-grid"><div class="workspace-tile"><span>Home state</span><strong>Everything looks normal</strong></div><div class="workspace-tile"><span>Verification</span><strong>Local gateway</strong></div><div class="workspace-tile"><span>Security</span><strong>Listed doors secure</strong></div><div class="workspace-tile"><span>Climate</span><strong>Living zone comfortable</strong></div></div><button class="workspace-primary" data-command="Give me a home report">Ask Aura for details</button>';
 if(type==='scene')return `<div class="workspace-tile"><span>Selected scene</span><strong>${payload.name}</strong><p>This preview prepares the scene workspace while verified device commands continue through the local gateway.</p></div>`;
 if(type==='shopping')return '<div class="workspace-empty">Shopping workspace registered. List editing will move here from the legacy drawer in the next pass.</div>';
 if(type==='settings')return '<div class="workspace-empty">Settings workspace registered. Household, voice and reduced-motion controls will be migrated here next.</div>';
 if(type==='awareness')return '<div class="workspace-tile"><span>Privacy state</span><strong>Camera disabled</strong><p>Awareness remains opt-in and local-first. Open the existing awareness panel only after explicit permission.</p></div>';
 if(type==='gateway')return '<div class="workspace-grid"><div class="workspace-tile"><span>Home Assistant</span><strong>Gateway offline</strong></div><div class="workspace-tile"><span>Command policy</span><strong>Allowlisted only</strong></div><div class="workspace-tile"><span>Results</span><strong>Pending → confirmed</strong></div><div class="workspace-tile"><span>High-risk actions</span><strong>Blocked</strong></div></div>';
 return '<div class="workspace-error">This workspace is unavailable.</div>';
}
function openWorkspace(type,payload={},origin){if(!validate(type,payload))return;setState('requested');if(active&&!pinned)closeWorkspace(false);active={type,payload};setState('prepared');eyebrow.textContent=payload.eye||'AURA workspace';title.textContent=payload.title||type;source.textContent=`Source: ${payload.source||'Local interface'}`;fresh.textContent=`Updated ${now()}`;body.innerHTML=content(type,payload);document.body.classList.add('workspace-open');shell.hidden=false;requestAnimationFrame(()=>{shell.classList.add('visible');setState('visible');close.focus()});}
function closeWorkspace(restore=true){if(pinned&&restore)return;shell.classList.remove('visible','expanded','workspace-pinned');document.body.classList.remove('workspace-open','workspace-expanded');setState('closed');active=null;pinned=false;pin.setAttribute('aria-pressed','false');setTimeout(()=>{shell.hidden=true;body.innerHTML=''},340)}
pin.onclick=()=>{pinned=!pinned;pin.setAttribute('aria-pressed',String(pinned));shell.classList.toggle('workspace-pinned',pinned)};
expand.onclick=()=>{const on=shell.classList.toggle('expanded');document.body.classList.toggle('workspace-expanded',on);expand.setAttribute('aria-pressed',String(on))};
close.onclick=()=>closeWorkspace(true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)closeWorkspace(true)});
function bind(sel,type,getPayload){qa(sel).forEach(el=>el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openWorkspace(type,getPayload?getPayload(el):{},el)},true))}
bind('.next-card, #calendarBtn','calendar',()=>({title:'Today',eye:'Calendar',source:'Family calendar'}));
bind('.weather-card','weather',()=>({title:'Brisbane weather',eye:'Weather',source:'Local weather summary'}));
bind('.status-summary, .summary-row','home',()=>({title:'Verified home status',eye:'Home',source:'Home Assistant gateway'}));
bind('[data-scene]','scene',el=>({title:el.dataset.scene,eye:'Scene',name:el.dataset.scene,source:'Home Assistant scene'}));
bind('[data-tool="shopping"]','shopping',()=>({title:'Shopping list',eye:'Family hub',source:'Local household data'}));
bind('[data-tool="settings"]','settings',()=>({title:'Settings',eye:'Household',source:'Local settings'}));
bind('#awarenessOpen','awareness',()=>({title:'Awareness',eye:'Privacy',source:'On-device camera state'}));
bind('#gatewayOpen','gateway',()=>({title:'Home Assistant',eye:'Connections',source:'Local gateway'}));
const form=q('#command'),input=q('#input'),response=q('#response');if(form&&input)form.addEventListener('submit',e=>{if(/\b(unlock|disarm)\b/i.test(input.value)){e.preventDefault();e.stopImmediatePropagation();response.textContent='That security action is blocked. Aura cannot unlock doors or disarm alarms through general conversation.';document.body.dataset.ai='alert';setTimeout(()=>document.body.dataset.ai='idle',2200)}},true);
window.AuraWorkspace={open:openWorkspace,close:closeWorkspace,get state(){return state},get active(){return active}};
})();