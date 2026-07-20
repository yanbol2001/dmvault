/* DMVault shared cultivation + owned component v1.3 */
(()=>{
'use strict';
const body=document.body;
const TIMER_KEY=body.dataset.dmvaultTimerKey||'dmvault_timer_';
const OWNED_KEY=body.dataset.dmvaultOwnedKey||'dmvault_owned_';
const now=()=>Date.now();
const fmt=sec=>{
  sec=Math.max(0,Math.ceil(sec));
  const h=Math.floor(sec/3600);
  sec%=3600;
  const m=Math.floor(sec/60),s=sec%60;
  return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':');
};
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
const write=(key,val)=>localStorage.setItem(key,JSON.stringify(val));
const boxes=[...document.querySelectorAll('.care-tools[data-timer-id]')];
const ownedInputs=[...document.querySelectorAll('.owned-check')];

function syncOwned(id){
  const checked=localStorage.getItem(OWNED_KEY+id)==='1';
  ownedInputs
    .filter(input=>{
      const box=input.closest('.route-column')?.querySelector('.care-tools');
      return box?.dataset.ownedId===id;
    })
    .forEach(input=>{
      input.checked=checked;
      input.closest('.route-column')?.classList.toggle('is-owned',checked);
      input.closest('label')?.setAttribute('title',checked?'取消已養過':'標記為已養過');
    });
}

ownedInputs.forEach(input=>{
  const box=input.closest('.route-column')?.querySelector('.care-tools');
  const id=box?.dataset.ownedId;
  if(!id)return;
  syncOwned(id);
  input.addEventListener('change',()=>{
    localStorage.setItem(OWNED_KEY+id,input.checked?'1':'0');
    syncOwned(id);
    dispatchEvent(new CustomEvent('dmvault-owned-changed',{detail:{id,owned:input.checked}}));
  });
});

boxes.forEach(box=>{
  const id=box.dataset.timerId;
  const duration=Number(box.dataset.duration||0);
  const start=box.querySelector('.care-start');
  const countdown=box.querySelector('.care-countdown');
  const time=box.querySelector('.compact-time');
  const oldControls=box.querySelector('.care-timer');
  const buttons=oldControls?.querySelector('.care-compact-buttons');
  const freeze=buttons?.querySelector('.freeze-btn');
  const reset=buttons?.querySelector('.reset-btn');

  // 真正改成單列 DOM：倒數與按鈕都放進同一個 countdown 容器。
  if(countdown && buttons && buttons.parentElement!==countdown){
    countdown.appendChild(buttons);
  }
  if(oldControls) oldControls.remove();

  let state=read(TIMER_KEY+id);
  const elapsedMs=()=>!state?0:(state.elapsedMs||0)+(state.frozen?0:now()-(state.startedAt||now()));
  const persist=()=>write(TIMER_KEY+id,state);

  function render(){
    if(!state){
      box.classList.remove('timer-active','timer-complete','timer-frozen');
      if(start) start.hidden=false;
      if(countdown) countdown.hidden=true;
      if(time) time.textContent=fmt(duration);
      return;
    }

    const remain=Math.max(0,duration-elapsedMs()/1000);
    box.classList.add('timer-active');
    box.classList.toggle('timer-frozen',!!state.frozen);
    box.classList.toggle('timer-complete',duration>0&&remain<=0);
    if(start) start.hidden=true;
    if(countdown) countdown.hidden=false;
    if(time) time.textContent=duration?fmt(remain):'--:--:--';
    if(freeze) freeze.textContent=state.frozen?'解除':'冷凍';
  }

  start?.addEventListener('click',()=>{
    state={startedAt:now(),elapsedMs:0,frozen:false};
    persist();
    render();
  });

  freeze?.addEventListener('click',()=>{
    if(!state)return;
    if(state.frozen){
      state.startedAt=now();
      state.frozen=false;
    }else{
      state.elapsedMs=elapsedMs();
      state.startedAt=0;
      state.frozen=true;
    }
    persist();
    render();
  });

  reset?.addEventListener('click',()=>{
    if(!confirm('確定重設這個培養計時？'))return;
    localStorage.removeItem(TIMER_KEY+id);
    state=null;
    render();
  });

  render();
  setInterval(render,1000);
});

addEventListener('storage',event=>{
  if(event.key?.startsWith(OWNED_KEY)){
    syncOwned(event.key.slice(OWNED_KEY.length));
  }
});
})();
