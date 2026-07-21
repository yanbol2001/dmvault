(() => {
  'use strict';
  const cfg = Object.assign({endpoint:'',enabled:true,maxMessageLength:2000,cooldownSeconds:15}, window.DMVAULT_FEEDBACK_CONFIG || {});
  if (!cfg.enabled) return;
  const QUEUE_KEY='dmvault.feedback.queue.v1';
  const LAST_KEY='dmvault.feedback.lastSentAt';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const projectFromPath=()=>{const p=location.pathname.toLowerCase();if(p.includes('/mh-20th/'))return'Monster Hunter 20th';if(p.includes('/pendulum-color/'))return'Pendulum COLOR';if(p.includes('/godzilla-70th/'))return'Godzilla 70th';return'DMVault Platform';};
  const versionFromPage=()=>{const candidates=[document.querySelector('[data-content-version]')?.dataset.contentVersion,document.querySelector('#footer-version')?.textContent,document.querySelector('#platform-version')?.textContent,window.DMVAULT_CONFIG?.version];return candidates.find(Boolean)||'unknown';};
  const isPWA=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const pageName=()=>document.querySelector('h1')?.textContent?.trim()||document.title;
  const diagnostics=()=>({project:projectFromPath(),page:pageName(),version:versionFromPage(),url:location.href,online:navigator.onLine,pwa:isPWA(),viewport:`${innerWidth}×${innerHeight}`,platform:navigator.userAgentData?.platform||navigator.platform||'',userAgent:navigator.userAgent,language:navigator.language,time:new Date().toISOString()});
  const readQueue=()=>{try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')}catch{return[]}};
  const writeQueue=q=>localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-50)));
  const enqueue=p=>{const q=readQueue();q.push(p);writeQueue(q)};
  async function transmit(payload){
    if(!cfg.endpoint) throw new Error('尚未連接回報接收端');
    await fetch(cfg.endpoint,{method:'POST',mode:'no-cors',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
    return true;
  }
  async function flushQueue(){if(!navigator.onLine||!cfg.endpoint)return;const q=readQueue();if(!q.length)return;const remaining=[];for(const item of q){try{await transmit(item)}catch{remaining.push(item)}}writeQueue(remaining);}
  function build(){
    const btn=document.createElement('button');btn.className='dmv-feedback-button';btn.type='button';btn.textContent='💬 回報／建議';btn.setAttribute('aria-haspopup','dialog');
    const wrap=document.createElement('div');wrap.className='dmv-feedback-backdrop';wrap.hidden=true;
    wrap.innerHTML=`<section class="dmv-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="dmv-feedback-title"><div class="dmv-feedback-head"><div><h2 id="dmv-feedback-title">回報問題或提供建議</h2><p>目前頁面與裝置資料會自動附上。</p></div><button class="dmv-feedback-close" type="button" aria-label="關閉">×</button></div><form class="dmv-feedback-form"><label class="dmv-feedback-field"><span>回報類型</span><select name="type" required><option value="資料錯誤">資料錯誤</option><option value="畫面／功能異常">畫面／功能異常</option><option value="使用建議">使用建議</option><option value="留言鼓勵">留言鼓勵</option><option value="其他">其他</option></select></label><label class="dmv-feedback-field"><span>內容</span><textarea name="message" maxlength="${Number(cfg.maxMessageLength)||2000}" required placeholder="請說明哪裡有錯、發生什麼狀況，或你希望增加什麼功能。"></textarea><small class="dmv-feedback-hint">請不要填寫密碼、住址等敏感資料。</small></label><label class="dmv-feedback-field"><span>聯絡方式（選填）</span><input name="contact" maxlength="150" placeholder="暱稱、Email 或社群帳號"></label><div class="dmv-feedback-meta"></div><div class="dmv-feedback-actions"><button class="dmv-feedback-secondary dmv-feedback-copy" type="button">複製診斷資料</button><button class="dmv-feedback-submit" type="submit">送出回報</button></div><p class="dmv-feedback-status" role="status" aria-live="polite"></p></form></section>`;
    document.body.append(btn,wrap);
    const form=wrap.querySelector('form'),close=wrap.querySelector('.dmv-feedback-close'),status=wrap.querySelector('.dmv-feedback-status'),meta=wrap.querySelector('.dmv-feedback-meta'),submit=wrap.querySelector('.dmv-feedback-submit');
    const show=()=>{const d=diagnostics();meta.innerHTML=`作品：${esc(d.project)}<br>頁面：${esc(d.page)}<br>版本：${esc(d.version)}<br>模式：${d.pwa?'PWA':'瀏覽器'}・${d.online?'線上':'離線'}`;status.textContent=cfg.endpoint?'':'管理員尚未完成回報功能連線設定。';status.className='dmv-feedback-status'+(cfg.endpoint?'':' is-error');wrap.hidden=false;document.body.style.overflow='hidden';setTimeout(()=>form.elements.message.focus(),0)};
    const hide=()=>{wrap.hidden=true;document.body.style.overflow=''};
    btn.addEventListener('click',show);close.addEventListener('click',hide);wrap.addEventListener('click',e=>{if(e.target===wrap)hide()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!wrap.hidden)hide()});
    wrap.querySelector('.dmv-feedback-copy').addEventListener('click',async()=>{const text=JSON.stringify(diagnostics(),null,2);try{await navigator.clipboard.writeText(text);status.textContent='診斷資料已複製。';status.className='dmv-feedback-status is-ok'}catch{status.textContent='無法自動複製，請改用瀏覽器的分享或複製功能。';status.className='dmv-feedback-status is-error'}});
    form.addEventListener('submit',async e=>{e.preventDefault();const now=Date.now(),last=Number(localStorage.getItem(LAST_KEY)||0);if(now-last<(Number(cfg.cooldownSeconds)||15)*1000){status.textContent='請稍候幾秒再送出。';status.className='dmv-feedback-status is-error';return}const fd=new FormData(form);const payload={schema:1,id:(crypto.randomUUID?.()||`${now}-${Math.random().toString(16).slice(2)}`),type:String(fd.get('type')||''),message:String(fd.get('message')||'').trim(),contact:String(fd.get('contact')||'').trim(),diagnostics:diagnostics(),createdAt:new Date().toISOString()};if(!payload.message)return;submit.disabled=true;status.textContent='送出中…';status.className='dmv-feedback-status';try{if(!navigator.onLine){enqueue(payload);status.textContent='目前離線，回報已暫存；恢復連線後會自動送出。'}else{await transmit(payload);localStorage.setItem(LAST_KEY,String(now));status.textContent='已收到，謝謝你的回報！';status.className='dmv-feedback-status is-ok';form.reset();setTimeout(hide,1200)}}catch(err){if(cfg.endpoint){enqueue(payload);status.textContent='暫時無法送出，已保存並會在連線恢復後重試。'}else{status.textContent='回報接收端尚未設定，請管理員先完成 Google Apps Script 部署。'}status.className='dmv-feedback-status is-error'}finally{submit.disabled=false}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
  addEventListener('online',flushQueue);setTimeout(flushQueue,1200);
})();
