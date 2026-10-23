/* MealMate - Nutrition chatbot (English only)
 * Answers questions about protein, potassium, sodium, vitamins, calories... from the dish's total_nutrients (r.x in recipes.json.gz).
 *  1) Amount questions      -> answered instantly from the dish data (exact numbers, no AI and no API key needed).
 *  2) Explanation questions -> sent to the AI together with the dish's full nutrient data; if AI is unavailable, falls back to the numbers.
 *
 * Load this file AFTER js/app.js (<script src="js/chatbot.js"></script>).
 * Uses from app.js: $, esc, cur, tgt, ingList, fmt, getS, apiFetch, openAuth.
 * app.js must call cbOnSelect() inside select(r).
 */

let chat = []; // conversation history of the widget: [{role:'user'|'assistant', content}]

/** Send turns to the backend (/api/generate) and return the answer text. */
async function llm(turns){
  const res = await apiFetch('api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:turns})});
  const out = await res.json().catch(()=>({}));
  if(res.status===401 && typeof openAuth==='function') openAuth('login');
  if(!res.ok) throw new Error(typeof out.detail==='string'?out.detail:'The assistant could not answer, please try again.');
  return (out.text||'').trim() || 'Sorry, I have no answer for that.';
}
/** Tiny markdown: escape HTML, **bold**, line breaks. */
function md(t){
  return esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
}

const CB_NUT = [ // [key in total_nutrients, unit, name, daily value, aliases (lower-case)]
  ['PROCNT','g','Protein',50,['protein','proteins']],
  ['FAT','g','Total fat',78,['total fat','fat','fats','lipid']],
  ['FASAT','g','Saturated fat',20,['saturated fat','saturated']],
  ['FAMS','g','Monounsaturated fat',null,['monounsaturated fat','monounsaturated','mufa']],
  ['FAPU','g','Polyunsaturated fat',null,['polyunsaturated fat','polyunsaturated','pufa']],
  ['FATRN','g','Trans fat',null,['trans fat','trans']],
  ['CHOLE','mg','Cholesterol',300,['cholesterol']],
  ['CHOCDF','g','Carbohydrate',275,['carbohydrate','carbohydrates','carbs','carb']],
  ['SUGAR','g','Sugars',null,['sugar','sugars']],
  ['FIBTG','g','Fiber',28,['fiber','fibre']],
  ['WATER','g','Water',null,['water']],
  ['NA','mg','Sodium',2300,['sodium','salt']],
  ['K','mg','Potassium',4700,['potassium']],
  ['CA','mg','Calcium',1300,['calcium']],
  ['FE','mg','Iron',18,['iron']],
  ['MG','mg','Magnesium',420,['magnesium']],
  ['P','mg','Phosphorus',1250,['phosphorus','phosphorous']],
  ['ZN','mg','Zinc',11,['zinc']],
  ['VITA_RAE','\u00b5g','Vitamin A',900,['vitamin a','vit a']],
  ['VITC','mg','Vitamin C',90,['vitamin c','vit c']],
  ['VITD','\u00b5g','Vitamin D',20,['vitamin d','vit d']],
  ['TOCPHA','mg','Vitamin E',15,['vitamin e','vit e']],
  ['VITK1','\u00b5g','Vitamin K',120,['vitamin k','vit k']],
  ['THIA','mg','Vitamin B1 (Thiamin)',1.2,['vitamin b1','vit b1','thiamin','thiamine','b1']],
  ['RIBF','mg','Vitamin B2 (Riboflavin)',1.3,['vitamin b2','vit b2','riboflavin','b2']],
  ['NIA','mg','Vitamin B3 (Niacin)',16,['vitamin b3','vit b3','niacin','b3']],
  ['VITB6A','mg','Vitamin B6',1.7,['vitamin b6','vit b6','b6']],
  ['FOLDFE','\u00b5g','Folate (B9)',400,['folate','vitamin b9','b9','folic acid']],
  ['VITB12','\u00b5g','Vitamin B12',2.4,['vitamin b12','vit b12','b12']]
].map(([k,u,name,dv,a])=>({k,u,name,dv,a}));
const CB_BY = Object.fromEntries(CB_NUT.map(n=>[n.k,n]));
const CB_ALIAS = CB_NUT.flatMap(n=>n.a.map(a=>[a,n.k])).sort((x,y)=>y[0].length-x[0].length); // longest alias matches first: "saturated fat" beats "fat"
const CB_GROUP = {
  vitamins:['VITA_RAE','VITC','VITD','TOCPHA','VITK1','THIA','RIBF','NIA','VITB6A','FOLDFE','VITB12'],
  minerals:['NA','K','CA','FE','MG','P','ZN'],
  overview:['PROCNT','FAT','CHOCDF','FIBTG','SUGAR','NA']
};
const CB_T = {
  perServ:'per serving',dv:'of daily value',High:'High',Moderate:'Moderate',Low:'Low',whole:'Whole recipe',none:'This dish has no data for that nutrient.',
  cal:'Calories',energy:'Energy split',kcalServ:'kcal per serving',note:'Daily values use a 2,000 kcal reference diet (\u226520% is high, \u22645% is low).',
  ing:'Ingredients',nutr:'Nutrient',pick:'Pick a dish first, then ask me about its nutrition.',
  hello:n=>`Hi! I'm the MealMate assistant. Ask me about the nutrition of \u201c${n}\u201d: protein, potassium, sodium, vitamins, calories\u2026`,
  hello0:`Hi! I'm the MealMate assistant. Pick a dish from the list, then ask me about its protein, potassium, sodium, vitamins and more.`,
  ctxNone:'No dish selected yet',
  noAI:'I can answer questions about nutrient amounts, calories and ingredients from this dish\u2019s data (try \u201cHow much potassium?\u201d). For open-ended questions, the AI service needs to be enabled (GEMINI_API_KEY).',
  aiFail:'The AI service is unavailable right now, so here are the numbers from the data instead.',
  p:'Protein',c:'Carbs',f:'Fat',salt:'(salt is measured as sodium)'
};
const cbSv = n => n===1?'serving':'servings';
const nzq = s => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const cbNum = v => v>=100?String(Math.round(v)):v>=10?String(Math.round(v*10)/10):v>=1?String(Math.round(v*100)/100):v>=0.1?String(Math.round(v*1000)/1000):String(Math.round(v*10000)/10000);

/** Find the nutrients mentioned in the question. */
function cbFind(q){
  let s=' '+nzq(q)+' ',found=[];
  for(const [a,k] of CB_ALIAS){
    s=s.replace(new RegExp('(^| )'+a+'(?= |$)','g'),(m,p)=>{if(!found.includes(k))found.push(k);return p+'~'});
  }
  return found;
}
/** Work out the intent and build an answer from the dish data. Returns {text,html}, or null when the AI is needed. */
function cbLocal(q, r, n, opt={}){
  const T=CB_T,s=nzq(q),x=r.x||{};
  const m=s.match(/(\d{1,2}) ?(servings?|people|persons?|portions?)\b/); if(m)n=Math.max(1,+m[1]);
  let keys=cbFind(q);
  const wantCal=/\b(calories?|kcal|energy)\b/.test(s);
  const wantIng=/\b(ingredients?)\b/.test(s);
  if(!keys.length){
    if(/\bvitamins?\b/.test(s))keys=CB_GROUP.vitamins;
    else if(/\b(minerals?)\b/.test(s))keys=CB_GROUP.minerals;
    else if(/\b(nutrition|nutrients?|nutritional|macros?|summary)\b/.test(s))keys=CB_GROUP.overview;
  }
  const explain=/\b(why|what is|what are|what does|benefits?|good for|healthy|should|can i|how to|diabet\w*)\b/.test(s);
  if(opt.forAI) return {keys,wantCal,wantIng,explain};
  if(wantCal&&!keys.length) return cbCalories(r,n,T);
  if(wantIng&&!keys.length) return cbIngredients(T);
  if(!keys.length) return null;
  keys=keys.filter(k=>CB_BY[k]);
  const rows=keys.map(k=>{
    const nu=CB_BY[k],v=x[k]; if(v==null) return {nu,v:null};
    const per=v/r.s,tot=v*n/r.s,pct=nu.dv?per/nu.dv*100:null;
    const lvl=pct==null?null:pct>=20?'High':pct<=5?'Low':'Moderate';
    return {nu,v,per,tot,pct,lvl};
  });
  const name=nu=>nu.name, saltNote=/\b(salt)\b/.test(s)&&keys.includes('NA')?` ${T.salt}`:'';
  const line=o=>o.v==null?`${name(o.nu)}: ${T.none}`:`${name(o.nu)}: ${cbNum(o.per)} ${o.nu.u} ${T.perServ}`+(o.pct!=null?` (${Math.round(o.pct)}% ${T.dv} \u2013 ${T[o.lvl]})`:'')+`; ${n} ${cbSv(n)}: ${cbNum(o.tot)} ${o.nu.u}; ${T.whole} (${r.s} ${cbSv(r.s)}): ${cbNum(o.v)} ${o.nu.u}.`;
  const text=rows.map(line).join('\n')+saltNote;
  let html;
  if(rows.length===1){
    const o=rows[0];
    html=o.v==null?`<p>${esc(text)}</p>`:`<div class="nc"><div class="nt">${esc(name(o.nu))}</div><div class="nb">${cbNum(o.per)} ${o.nu.u}<small> ${T.perServ}</small></div>`+
      (o.pct!=null?`<div class="bar"><i class="${o.lvl}" style="width:${Math.min(100,o.pct)}%"></i></div><div class="nr"><b>${Math.round(o.pct)}%</b> ${T.dv} \u00b7 ${T[o.lvl]}</div>`:'')+
      `<div class="nr">${n} ${cbSv(n)}: <b>${cbNum(o.tot)} ${o.nu.u}</b></div><div class="nr">${T.whole} (${r.s} ${cbSv(r.s)}): ${cbNum(o.v)} ${o.nu.u}</div>`+
      (o.pct!=null?`<div class="nr dim">${T.note}</div>`:'')+(saltNote?`<div class="nr dim">${esc(saltNote.trim())}</div>`:'')+`</div>`;
  }else{
    html=`<table class="nct"><tr><th>${T.nutr}</th><th>${T.perServ}</th><th>${n} ${cbSv(n)}</th><th>%</th></tr>`+rows.map(o=>o.v==null?`<tr><td>${esc(name(o.nu))}</td><td colspan="3">\u2013</td></tr>`:
      `<tr><td>${esc(name(o.nu))}</td><td>${cbNum(o.per)} ${o.nu.u}</td><td>${cbNum(o.tot)} ${o.nu.u}</td><td>${o.pct==null?'\u2013':Math.round(o.pct)+'%'}</td></tr>`).join('')+`</table><div class="nr dim">${T.note}</div>`;
  }
  if(wantCal){const c=cbCalories(r,n,T);return{text:c.text+'\n'+text,html:c.html+html}}
  return {text,html};
}
function cbCalories(r,n,T){
  const x=r.x||{},p=(x.PROCNT||0)*4,c=(x.CHOCDF||0)*4,f=(x.FAT||0)*9,t=p+c+f||1,pc=v=>Math.round(v/t*100);
  const per=Math.round(r.c/r.s),tot=Math.round(r.c*n/r.s);
  const text=`${T.cal}: ${per} ${T.kcalServ}; ${n} ${cbSv(n)}: ${tot} kcal; ${T.whole} (${r.s} ${cbSv(r.s)}): ${Math.round(r.c)} kcal. ${T.energy}: ${T.p} ${pc(p)}%, ${T.c} ${pc(c)}%, ${T.f} ${pc(f)}%.`;
  const html=`<div class="nc"><div class="nt">${T.cal}</div><div class="nb">${per} kcal<small> ${T.perServ}</small></div><div class="nr">${n} ${cbSv(n)}: <b>${tot} kcal</b></div><div class="nr">${T.whole} (${r.s} ${cbSv(r.s)}): ${Math.round(r.c)} kcal</div>`+
    `<div class="split"><i class="p" style="width:${pc(p)}%"></i><i class="c" style="width:${pc(c)}%"></i><i class="f" style="width:${pc(f)}%"></i></div><div class="nr dim">${T.p} ${pc(p)}% \u00b7 ${T.c} ${pc(c)}% \u00b7 ${T.f} ${pc(f)}%</div></div>`;
  return {text,html};
}
function cbIngredients(T){
  const l=ingList().map(i=>`${i.q?fmt(i.q)+' '+i.m+' ':''}${i.food}`.replace(/\s+/g,' ').trim());
  return {text:`${T.ing} (${tgt()} ${cbSv(tgt())}):\n- ${l.join('\n- ')}`,html:`<b>${T.ing}</b> (${tgt()} ${cbSv(tgt())})<ul>${l.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`};
}
/** Context sent to the AI: the dish's full nutrient data (per serving + whole recipe) taken from total_nutrients. */
function cbContext(r,n){
  const x=r.x||{},lines=CB_NUT.filter(u=>x[u.k]!=null).map(u=>`- ${u.name}: ${cbNum(x[u.k]/r.s)} ${u.u} per serving; ${cbNum(x[u.k])} ${u.u} for the whole original recipe${u.dv?` (${Math.round(x[u.k]/r.s/u.dv*100)}% daily value per serving)`:''}`);
  return `DISH: ${r.n}\nOriginal servings: ${r.s}. User is cooking for: ${n} servings.\nCalories: ${Math.round(r.c)} kcal for the whole original recipe = ${Math.round(r.c/r.s)} kcal per serving.\nDiet labels: ${(r.d||[]).join(', ')||'none'}. Cuisine: ${(r.u||[]).join(', ')}. Dish type: ${(r.y||[]).join(', ')}.\nINGREDIENTS (scaled to ${n} servings): ${ingList().map(i=>`${i.q?fmt(i.q)+' '+i.m+' ':''}${i.food}`.replace(/\s+/g,' ').trim()).join('; ')}\nNUTRIENTS (from total_nutrients):\n${lines.join('\n')}`;
}
const CB_SYS='You are a friendly nutrition assistant inside a recipe website. Answer ONLY about the dish below, using ONLY the numbers in the data. Never invent or change numbers; if the data does not contain the answer, say so. Always reply in English, concisely (max ~120 words), plain text, no markdown tables. Give general nutrition facts only; no medical advice and no other dish suggestions.';

/* ---------- Floating chatbot widget (bottom-right corner) ---------- */
const CW_AV='<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#30483a"/><path d="M13 23a6.5 6.5 0 0 1 3-12 7.5 7.5 0 0 1 16 0 6.5 6.5 0 0 1 3 12z" fill="#fff"/><rect x="14" y="21" width="20" height="5" rx="2.5" fill="#efe9dc"/><circle cx="24" cy="34" r="9.5" fill="#f6e3c3"/><circle cx="20.3" cy="33" r="1.5" fill="#252827"/><circle cx="27.7" cy="33" r="1.5" fill="#252827"/><path d="M21 37.2q3 2.6 6 0" stroke="#a64b4b" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="17.5" cy="36" r="1.7" fill="#f2a998" opacity=".65"/><circle cx="30.5" cy="36" r="1.7" fill="#f2a998" opacity=".65"/></svg>';
const CW_IC=p=>`<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const CW_QUICK=[['\ud83e\udd69','Protein','How much protein?'],['\ud83c\udf4c','Potassium','How much potassium?'],['\ud83e\uddc2','Sodium','Sodium level?'],['\ud83e\uddb4','Calcium & iron','Calcium and iron?'],['\ud83d\udc8a','Vitamins','Vitamins'],['\ud83c\udf3e','Fiber & sugar','Fiber and sugar'],['\ud83e\uddc8','Fat','Fat and saturated fat'],['\ud83d\udd25','Calories','Calories'],['\ud83d\udccb','Full nutrition','Full nutrition'],['\ud83e\udd55','Ingredients','What ingredients are used?']];
const cwTime=()=>new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
function cwBuild(){
  if(document.getElementById('cw'))return;
  const w=document.createElement('div');w.id='cw';
  w.innerHTML=`<button id="cwFab" class="cw-fab" aria-label="Open nutrition assistant" aria-expanded="false">${CW_AV}<i class="cw-dot" id="cwDot" hidden></i></button>
  <section class="cw-win" id="cwWin" role="dialog" aria-label="MealMate assistant" hidden>
    <header class="cw-head"><span class="cw-av lg">${CW_AV}</span><div class="cw-title"><b>MealMate Assistant</b><small><i></i>Online</small></div>
      <div class="cw-tools"><button id="cwExp" aria-label="Expand chat">${CW_IC('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>')}</button><button id="cwMin" aria-label="Minimize chat">${CW_IC('<path d="M6 9l6 6 6-6"/>')}</button></div></header>
    <div class="cw-ctx" id="cwCtx"></div>
    <div class="cw-body" id="ms" aria-live="polite"></div>
    <button class="cw-down" id="cwDown" hidden aria-label="Scroll to latest">${CW_IC('<path d="M6 9l6 6 6-6"/>')}</button>
    <footer class="cw-foot"><button id="cwMenu" aria-label="Show or hide suggested questions" aria-pressed="true">${CW_IC('<path d="M4 6h16M4 12h16M4 18h16"/>')}</button>
      <input id="cq" placeholder="Ask about protein, potassium, vitamins\u2026" autocomplete="off" aria-label="Your question">
      <button id="cwClear" aria-label="Clear chat">${CW_IC('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>')}</button>
      <button id="cs" class="cw-send" aria-label="Send">${CW_IC('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>')}</button></footer></section>`;
  document.body.append(w);
  const win=$('cwWin'),fab=$('cwFab'),ms=$('ms');
  const open=v=>{win.hidden=!v;fab.hidden=v;fab.setAttribute('aria-expanded',v);if(v){$('cwDot').hidden=true;setTimeout(()=>{$('cq').focus();ms.scrollTop=ms.scrollHeight},30)}else fab.focus()};
  fab.onclick=()=>open(true);$('cwMin').onclick=()=>open(false);
  win.addEventListener('keydown',e=>{if(e.key==='Escape')open(false)});
  $('cwExp').onclick=()=>win.classList.toggle('big');
  $('cs').onclick=()=>ask($('cq').value);
  $('cq').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing)ask(e.target.value)});
  $('cwMenu').onclick=()=>cwQuick();$('cwClear').onclick=cwStart;
  ms.addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(b)ask(b.dataset.q)});
  ms.addEventListener('scroll',()=>{$('cwDown').hidden=ms.scrollHeight-ms.scrollTop-ms.clientHeight<90});
  $('cwDown').onclick=()=>ms.scrollTo({top:ms.scrollHeight,behavior:'smooth'});
  cwStart();
}
function cbBubble(role,html){
  const ms=$('ms');if(!ms)return null;
  const row=document.createElement('div');const isU=role==='u'||role==='user';row.className='cw-row '+(isU?'u':'a');
  row.innerHTML=(isU?'':`<span class="cw-av">${CW_AV}</span>`)+`<div class="cw-col"><div class="cw-b">${html}</div><time>${cwTime()}</time></div>`;
  ms.append(row);ms.scrollTop=ms.scrollHeight;return row.querySelector('.cw-b');
}
/** Show/hide the suggested-question grid. Exactly one grid exists at a time; cwQuick() with no argument flips it. */
function cwQuick(show){
  const ms=$('ms');if(!ms)return;
  const ex=ms.querySelector('.cw-quick');
  if(show===undefined)show=!ex;
  if(ex)ex.remove();
  if(show){
    const d=document.createElement('div');d.className='cw-quick';
    d.innerHTML=CW_QUICK.map(([i,l,q])=>`<button data-q="${esc(q)}"><span class="ic">${i}</span><span>${esc(l)}</span></button>`).join('');
    ms.append(d);ms.scrollTop=ms.scrollHeight;
  }
  const b=$('cwMenu');if(b){b.classList.toggle('on',show);b.setAttribute('aria-pressed',show);b.title=show?'Hide suggested questions':'Show suggested questions'}
}
function cwCtx(){const el=$('cwCtx');if(el)el.innerHTML=cur?`<span>Dish</span><b title="${esc(cur.n)}">${esc(cur.n)}</b>`:`<span>${CB_T.ctxNone}</span>`}
function cwStart(){
  const ms=$('ms');if(!ms)return;ms.innerHTML='';chat.length=0;
  cwCtx();cbBubble('a',esc(cur?CB_T.hello(cur.n):CB_T.hello0));cwQuick(true);
}
/** Called by app.js when the user picks a dish: the chatbot switches to that dish. */
function cbOnSelect(){
  cwBuild();cwStart();
  if($('cwWin').hidden)$('cwDot').hidden=false;
}
async function ask(q){
  q=(q||'').trim();if(!q)return;
  const T=CB_T,inp=$('cq'),btn=$('cs');
  cwQuick(false);cbBubble('u',esc(q));if(inp)inp.value='';
  if(!cur){cbBubble('a',esc(T.pick));return}
  const r=cur,n=tgt();
  const wait=cbBubble('a','<span class="cw-typing"><i></i><i></i><i></i></span>');if(btn)btn.disabled=true;
  const hist=chat.slice(-8);
  let local=null;try{local=cbLocal(q,r,n)}catch(e){console.error(e)}
  const info=cbLocal(q,r,n,{forAI:true});
  let out;
  if(local&&!info.explain){out=local}                        // amount question: answer straight from the data
  else{
    const ai=typeof getS==='function'?await getS():null;
    if(ai){
      try{
        const turns=[{role:'user',content:CB_SYS+'\n\n'+cbContext(r,n)},{role:'assistant',content:'Understood. I will answer from this data only.'},...hist,{role:'user',content:q}];
        const t=await llm(turns);
        out={text:t,html:md(t)};
      }catch(e){out=local?{text:T.aiFail+'\n'+local.text,html:`<p class="dim">${T.aiFail}</p>`+local.html}:{text:T.noAI,html:`<p>${esc(T.noAI)}</p>`}}
    }else out=local?{text:local.text,html:local.html}:{text:T.noAI,html:`<p>${esc(T.noAI)}</p>`};
  }
  if(wait)wait.innerHTML=out.html;
  if(cur===r)chat.push({role:'user',content:q},{role:'assistant',content:out.text});
  const ms=$('ms');if(ms)ms.scrollTop=ms.scrollHeight;
  if(btn)btn.disabled=false;
}
cwBuild(); // show the mascot as soon as the page opens, even before a dish is chosen
