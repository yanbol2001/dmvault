
(()=>{
const cfg=window.OVERVIEW_CONFIG||{};
const list=document.getElementById('cultivationList');
const count=document.getElementById('cultivationCount');
const fmt=ms=>{let s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600);s%=3600;let m=Math.floor(s/60);s%=60;return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':')};
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
function elapsed(st){return +(st?.elapsedMs||0)+(st?.frozen?0:Date.now()-(st?.startedAt||Date.now()))}
function render(){
 const active=[];
 (cfg.routes||[]).forEach(r=>{
   let state=null,key='';
   if(cfg.kind==='mh'){
     key=`dmv_${r.id}_timer`; state=read(key);
     if(!state){const old=localStorage.getItem(`dmv_${r.id}_start`);if(old)state={startedAt:+old,elapsedMs:0,frozen:false}}
   }else{key=(cfg.timerPrefix||'dmvault_timer_')+r.id;state=read(key)}
   if(!state)return;
   const remain=Math.max(0,(r.duration*1000)-elapsed(state));
   active.push({...r,remain,done:r.duration>0&&remain<=0});
 });
 count.textContent=`${active.length} 項`;
 if(!active.length){list.innerHTML='<div class="cultivation-empty">目前沒有培養中的進化計時。</div>';return}
 list.innerHTML=active.map(r=>`<a class="cultivation-card ${r.done?'':'running'}" href="${cfg.evolutionHref||'evolution.html'}${r.anchor||''}"><span class="cultivation-state">${r.done?'可進化':'培養中'}</span><strong>${r.target}</strong><small>${r.source} → ${r.target}</small><span class="cultivation-time">${r.done?'可進化':fmt(r.remain)}</span></a>`).join('');
}
render();setInterval(render,1000);addEventListener('storage',render);
})();
