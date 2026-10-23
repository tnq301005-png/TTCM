/* =====================================================================
   MealMate – phần giao diện (JavaScript thuần, không cần thư viện)
   Cách đọc file này:
     1) Tiện ích nhỏ + biểu tượng (icon)
     2) Tải dữ liệu + tìm kiếm + lọc + phân trang        (logic GỐC, giữ nguyên)
     3) Cột chi tiết món + tính lại khẩu phần            (logic GỐC, giữ nguyên)
     4) AI recipe (gọi /api/recipe-ai)                   (logic GỐC, giữ nguyên)
     5) Chatbot "Ask about this dish" (gọi /api/generate)
     6) Đăng ký / đăng nhập / đăng xuất                  (gọi /api/register, /api/login ...)
   ===================================================================== */

/* ---------- 1) Tiện ích ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
const fmt=v=>String(v>=100?Math.round(v):v>=10?Math.round(v*10)/10:Math.round(v*100)/100);
// Hiện 0.5 thành "1/2", 1.25 thành "1 1/4" cho dễ đọc (chỉ để hiển thị)
const FR={.25:"1/4",.33:"1/3",.5:"1/2",.67:"2/3",.75:"3/4"};
const qty=v=>{if(v>=10)return fmt(v);const w=Math.floor(v+1e-9),t=FR[Math.round((v-w)*100)/100];return t?(w?w+" ":"")+t:fmt(v)};
const EM={"main course":"🍽️",desserts:"🍰",drinks:"🥤","alcohol cocktail":"🍸",salad:"🥗",soup:"🍲",starter:"🥟",bread:"🍞",sandwiches:"🥪",pancake:"🥞",egg:"🍳","biscuits and cookies":"🍪","condiments and sauces":"🫙",cereals:"🥣"};
const IMGP="https://datahive-prod-dataset-products.s3.eu-central-1.amazonaws.com/dataset/346/";
const ls=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};

// Biểu tượng SVG (đổi màu theo màu chữ xung quanh)
const S='fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICON={
 home:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.6 2.4 11.2c-.5.4-.2 1.3.5 1.3H4.6v8.1c0 .6.5 1.1 1.1 1.1h4.1v-6.2c0-.5.4-.9.9-.9h2.6c.5 0 .9.4.9.9v6.2h4.1c.6 0 1.1-.5 1.1-1.1v-8.1h1.7c.7 0 1-.9.5-1.3z"/></svg>`,
 heart:`<svg viewBox="1.6 2.6 20.8 19.2"><path ${S} stroke-width="1.9" d="M12 20.4S3.2 14.9 3.2 8.9c0-2.6 2-4.6 4.5-4.6 1.8 0 3.4 1 4.3 2.6.9-1.6 2.5-2.6 4.3-2.6 2.5 0 4.5 2 4.5 4.6 0 6-8.8 11.5-8.8 11.5z"/></svg>`,
 clock:`<svg viewBox="1.4 1.4 21.2 21.2"><circle ${S} stroke-width="1.9" cx="12" cy="12" r="9.4"/><path ${S} d="M12 6.4V12l3.6 2.4"/></svg>`,
 user:`<svg viewBox="0 0 24 24"><circle fill="currentColor" cx="12" cy="7.2" r="4.4"/><path fill="currentColor" d="M3.8 21c0-4.4 3.6-7 8.2-7s8.2 2.6 8.2 7c0 .6-.4 1-1 1H4.8c-.6 0-1-.4-1-1z"/></svg>`,
 userplus:`<svg viewBox="0 0 26 24"><circle fill="currentColor" cx="10" cy="7.2" r="4.4"/><path fill="currentColor" d="M1.8 21c0-4.4 3.6-7 8.2-7s8.2 2.6 8.2 7c0 .6-.4 1-1 1H2.8c-.6 0-1-.4-1-1z"/><path stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M21.4 14.2v6.4M18.2 17.4h6.4"/></svg>`,
 search:`<svg viewBox="0 0 24 24"><circle ${S} cx="10.5" cy="10.5" r="6.6"/><path ${S} d="m15.6 15.6 5.2 5.2"/></svg>`,
 chevron:`<svg viewBox="0 0 24 24"><path ${S} stroke-width="2.4" d="m4.5 8.5 7.5 7.5 7.5-7.5"/></svg>`,
 close:`<svg viewBox="0 0 24 24"><path ${S} stroke-width="2.2" d="M5 5l14 14M19 5 5 19"/></svg>`,
 check:`<svg viewBox="0 0 24 24"><path ${S} stroke-width="3.4" d="m5 12.8 4.6 4.6L19 7.6"/></svg>`,
 chat:`<svg viewBox="0 0 28 28"><path ${S} stroke-width="1.9" d="M14 4.2c5.9 0 10.6 3.9 10.6 8.8S19.900 21.800 14 21.800c-1.200 0-2.300-.2-3.400-.5l-4.600 2.100 1.200-4C5.300 17.900 3.400 15.600 3.400 13 3.400 8.100 8.100 4.200 14 4.200z"/></svg>`,
 back:`<svg viewBox="0 0 24 24"><path ${S} stroke-width="2.2" d="M15 5l-7 7 7 7"/></svg>`,
 plus:`<svg viewBox="0 0 24 24"><path ${S} stroke-width="2.4" d="M12 5v14M5 12h14"/></svg>`
};
const ic=n=>`<span class="ic">${ICON[n]}</span>`;
document.querySelectorAll("[data-icon]").forEach(el=>{el.innerHTML=ICON[el.dataset.icon]||""});

/* ---------- Địa chỉ server (API) ----------
   Bình thường trang và API cùng chạy ở http://localhost:8000 (uvicorn). Nếu bạn lỡ mở trang bằng
   công cụ khác (Live Server, cổng 5500...), code tự tìm API ở cổng 8000 của cùng máy. */
let API="",apiUp=false;
const apiReady=(async()=>{
 const tries=["",`http://${location.hostname||"localhost"}:8000/`];
 for(const base of tries){
  try{const r=await fetch(base+"api/health",{credentials:"include"});if(r.ok&&(await r.json()).ai!==undefined){API=base;apiUp=true;return}}catch(e){}
 }
})();
const apiFetch=async(path,opt={})=>{await apiReady;return fetch(API+path,{credentials:"include",...opt})};
const SERVER_HINT="Cannot reach the server. Start it with:  uvicorn api.main:app --port 8000  and open http://localhost:8000";

/* ---------- 2) Trạng thái + dữ liệu + tìm kiếm ---------- */
const PAGE_SIZE=12;
let R=[],home=[],list=[],page=1,cur=null,view="home",nt=0,SV,fav=ls("hm_fav",[]),hist=ls("hm_hist",[]),authMode="login",currentUser=null;
const SUGGEST=["chicken","egg","rice","broccoli","tomato"];
const hue=r=>[...(r.y[0]||"")].reduce((a,c)=>a+c.charCodeAt(0),0)*37%360;
const img=r=>(EM[r.y[0]]||"🍴")+(r.m?`<img src="${esc(IMGP+r.m)}" alt="" loading="lazy" onerror="this.remove()">`:"");
const tgt=()=>Math.max(1,+$("sv").value||cur.s);   // số khẩu phần đang chọn (mặc định = khẩu phần gốc)
const heartBtn=i=>`<button class="heart ${fav.includes(i)?"on":""}" data-fav="${i}" aria-label="Favorite">${ic("heart")}</button>`;

async function load(){
 try{
  const resp=await fetch("data/recipes.json.gz");if(!resp.ok)throw new Error("cannot load data/recipes.json.gz");
  R=JSON.parse(await new Response(resp.body.pipeThrough(new DecompressionStream("gzip"))).text());
 }catch(e){$("status").textContent="Could not read the data ("+e.message+"). Run the app with uvicorn (see README) in Chrome, Edge, Safari 16.4+ or a recent Firefox.";return}
 R.forEach(r=>r.h=r.g.map(i=>i[0]).join("|"));
 const opts=(id,all,key)=>{
  const c=new Set(R.flatMap(r=>r[key]));
  if(id==="meal")c.delete("brunch");
  $(id).innerHTML=`<option value="">${all}</option>`+[...c].sort().map(v=>`<option value="${esc(v)}">${esc(cap(v))}</option>`).join("");
 };
 opts("meal","All meals","t");opts("diet","All diets","d");opts("cu","All cuisines","u");opts("dish","All types","y");
 $("sv").innerHTML=`<option value="">Any</option>`+Array.from({length:50},(_,k)=>`<option value="${k+1}">${k+1}</option>`).join("");
 $("go").disabled=false;search();
 getS().then(s=>{if(!s)document.body.classList.add("noai")});
}

// Nguyên liệu nằm NGAY TRONG ô Ingredients, cách nhau bằng dấu phẩy: "chicken, egg, rice, "
const termsOf=v=>[...new Set(v.split(/[,;\n]+/).map(s=>s.trim().toLowerCase()).filter(Boolean))];
const ingTerms=()=>termsOf($("ing").value);
// Tự thêm dấu cách sau mỗi dấu phẩy: "chicken,egg" -> "chicken, egg"
function tidyIng(){
 const el=$("ing"),v=el.value,t=v.replace(/\s*[,;]\s*(?=\S)/g,", ").replace(/[,;]$/,", ");
 if(t!==v)el.value=t;
}
// Ghi danh sách vào ô nhập, mỗi nguyên liệu kèm ", " để gõ tiếp món mới
function setIng(list){$("ing").value=list.length?list.join(", ")+", ":"";renderChips()}
// Dưới ô nhập: gợi ý bấm để thêm / bấm lại để bỏ (món đã chọn hiện đậm)
function renderChips(){
 const all=ingTerms();
 $("ingChips").innerHTML=`<span class="chips-hint">Try:</span>`+SUGGEST.map(w=>{
  const on=all.includes(w);
  return `<button class="chip sug ${on?"on":""}" data-add="${w}" aria-pressed="${on}">${ic(on?"check":"plus")}${w}</button>`}).join("");
}
let ingTimer;

function search(){
 const terms=ingTerms().map(t=>new RegExp("(^|[^a-z])"+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(s|es)?($|[^a-z])"));
 const n=+$("sv").value||0,q=$("q").value.trim().toLowerCase(),f={t:$("meal").value,d:$("diet").value,u:$("cu").value,y:$("dish").value},all=$("all").checked,ord=$("ord").value,out=[];
 for(const r of R){
  if(n&&(r.s<n-2||r.s>n+2))continue;
  if((f.t&&!r.t.includes(f.t))||(f.d&&!r.d.includes(f.d))||(f.u&&!r.u.includes(f.u))||(f.y&&!r.y.includes(f.y)))continue;
  if(q&&!r.n.toLowerCase().includes(q))continue;
  let k=0;for(const re of terms)if(re.test(r.h))k++;
  if(terms.length&&(all?k<terms.length:k===0))continue;
  out.push({r,k});
 }
 out.sort((a,b)=>(ord?(ord==="asc"?a.r.c-b.r.c:b.r.c-a.r.c):0)||b.k-a.k||a.r.n.localeCompare(b.r.n));
 nt=terms.length;home=out;view="home";nav();show(home);
 if(!out.length)$("status").textContent='No dishes match. Remove an ingredient or filter, or untick "Match ingredients".';
}
function nav(){
 document.querySelectorAll("#nav button").forEach(b=>b.classList.toggle("on",b.dataset.v===view));
 $("rtitle").textContent={home:"Recipes",fav:"Favorites",hist:"History"}[view];
 $("filters").hidden=view!=="home";
}
function show(l){
 list=l;page=1;
 $("cnt").textContent=`${l.length.toLocaleString("en-US")} dishes`;
 $("status").textContent=l.length?"":(view==="home"?"":"Nothing here yet.");
 renderPage();
}
function renderPage(){
 const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
 page=Math.min(Math.max(1,page),pages);
 const part=list.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
 $("grid").innerHTML=part.map(({r,k})=>{
  const tags=[...r.d,...r.u,...r.y].slice(0,2);
  return `<article class="card" data-i="${r.i}"><div class="ph" style="--h:${hue(r)}">${img(r)}${heartBtn(r.i)}</div>
  <div class="cb"><h3>${esc(r.n)}</h3><p class="kc">${Math.round(r.c/r.s)} kcal / serving</p>${nt&&view==="home"?`<p class="mt">Matches ${k}/${nt} ingredients</p>`:""}
  <div class="tags">${tags.map(v=>`<span class="tag">${esc(cap(v))}</span>`).join("")}</div>
  <button class="view" data-view="${r.i}">View details</button></div></article>`}).join("");
 renderPager(pages);
}
function renderPager(pages){
 const el=$("pager");
 if(pages<=1){el.innerHTML="";return}
 const nums=[...new Set([1,pages,page-1,page,page+1])].filter(n=>n>=1&&n<=pages).sort((a,b)=>a-b);
 let h=`<button data-p="${page-1}" ${page===1?"disabled":""} aria-label="Previous page">‹</button>`,last=0;
 nums.forEach(n=>{
  if(n-last>1)h+=`<span class="dots">…</span>`;
  h+=`<button data-p="${n}" class="${n===page?"on":""}">${n}</button>`;last=n;
 });
 h+=`<button data-p="${page+1}" ${page===pages?"disabled":""} aria-label="Next page">›</button>`;
 el.innerHTML=h;
}
function goPage(p){
 const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
 page=Math.min(Math.max(1,+p||1),pages);
 renderPage();
 window.scrollTo({top:$("grid").getBoundingClientRect().top+window.scrollY-80,behavior:"smooth"});
}

/* ---------- 3) Cột chi tiết món ---------- */
// Nhân lượng nguyên liệu theo hệ số = khẩu phần chọn / khẩu phần gốc
function ingList(){const f=tgt()/cur.s;return cur.g.map(([food,q,m,w])=>({food,q:q?q*f:null,m:m||"",w:w?w*f:null}))}
const amount=i=>{
 const a=[];
 if(i.q)a.push(qty(i.q)+(i.m&&i.m!=="<unit>"?" "+esc(i.m):""));
 if(i.w&&i.m!=="gram")a.push(i.q?`(${Math.round(i.w)} g)`:`${Math.round(i.w)} g`);
 return a.join(" ");
};
function setPanel(open){
 $("app").classList.toggle("panel-off",!open);
 $("scrim").hidden=!(open&&innerWidth<=1360);
}
function select(r){
 cur=r;hist=[r.i,...hist.filter(i=>i!==r.i)].slice(0,30);save("hm_hist",hist);
 closeChat();
 $("pn").innerHTML=`<div class="p-hero" style="--h:${hue(r)}">${img(r)}${heartBtn(r.i)}</div>
 <h3 class="p-name">${esc(r.n)}</h3>
 <p class="p-line">Diet: ${esc(r.d.map(cap).join(", ")||"none")}</p>
 <p class="p-line">Cuisine: ${esc(r.u.map(cap).join(", ")||"none")}</p>
 <p class="p-line" id="pk"></p>
 <div class="p-tags">${r.d.map(v=>`<span class="tag">${esc(cap(v))}</span>`).join("")}</div>
 <div class="p-sep"></div>
 <div class="p-ih"><span class="lbl">Ingredients</span><small id="pf"></small></div><ul id="pi"></ul>
 <section class="ai-box ai-only"><div class="ai-head"><img src="assets/images/leaf-ai.svg" alt=""><h3>AI Recipe</h3></div>
  <button id="gen" class="ai-gen">Write the recipe with AI</button><div id="rc"></div>
  <p class="note">Written by AI from the ingredients and servings above. Check doneness and food safety yourself.</p></section>`;
 $("pfoot").hidden=false;
 draw();$("pn").scrollTop=0;setPanel(true);
}
function draw(){
 const r=cur,t=tgt(),f=t/r.s;
 $("pk").textContent=`Calories: ${Math.round(r.c/r.s)} kcal / serving`;
 $("pf").textContent=t===r.s?`original: ${r.s} servings`:`×${fmt(f)}: ${r.s} → ${t} servings`;
 $("pi").innerHTML=ingList().map(i=>`<li><span class="nm">${esc(i.food)}</span><span class="am">${amount(i)}</span></li>`).join("");
 const rc=$("rc");if(rc)rc.innerHTML="";
}
const getS=async()=>{if(SV===undefined){try{SV=(await(await apiFetch("api/health")).json()).ai?true:null}catch(e){SV=null}}return SV};

//Gọi công thức

function recipeTextHtml(t){
 const out=[];let open="";
 const close=()=>{if(open){out.push(`</${open}>`);open=""}};
 for(const raw of t.split("\n")){
  const line=raw.trim();if(!line)continue;
  let m;
  if(/^steps:?$/i.test(line)){close();out.push("<h4>Steps</h4>")}
  else if(/^tips:?$/i.test(line)){close();out.push("<h4>Tips</h4>")}
  else if(m=line.match(/^\d+[.)]\s*(.*)$/)){if(open!=="ol"){close();out.push("<ol>");open="ol"}out.push(`<li>${esc(m[1])}</li>`)}
  else if(m=line.match(/^[-•*]\s+(.*)$/)){if(open!=="ul"){close();out.push("<ul>");open="ul"}out.push(`<li>${esc(m[1])}</li>`)}
  else if(/^(prep|cook)\s*:/i.test(line)){close();out.push(`<p class="sub">${esc(line)}</p>`)}
  else if(/^notes?\s*:/i.test(line)){close();out.push(`<p class="note">${esc(line.replace(/^notes?\s*:\s*/i,""))}</p>`)}
  else{close();out.push(`<p>${esc(line)}</p>`)}
 }
 close();return out.join("");
}


async function gen(){
 const r=cur,b=$("gen"),box=$("rc");b.disabled=true;
 box.textContent="Writing the recipe with AI...";

 try{
  const res=await fetch("api/recipe-ai-stream",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({name:r.n,servings:tgt(),ingredients:ingList().map(i=>({food:i.food,quantity:i.q,measure:i.m||null}))})});
  if(!res.ok){
   const out=await res.json().catch(()=>({}));
   if(res.status===401)openAuth("login");
   throw new Error(typeof out.detail==="string"?out.detail:"Could not create the recipe, please try again.");
  }
  const reader=res.body.getReader(),dec=new TextDecoder();let text="";
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   text+=dec.decode(value,{stream:true});
   if(cur===r)box.innerHTML=recipeTextHtml(text);   // chữ hiện dần
  }
  text+=dec.decode();
  if(cur===r)box.innerHTML=recipeTextHtml(text);
 }catch(e){if(cur===r)box.textContent=e.message}
 b.disabled=false;
}

function toggleFav(i){
 const on=!fav.includes(i);fav=on?[...fav,i]:fav.filter(x=>x!==i);save("hm_fav",fav);
 document.querySelectorAll(`[data-fav="${i}"]`).forEach(b=>b.classList.toggle("on",on));
 if(view==="fav")show(fav.map(i=>({r:R[i],k:0})));
}

/* ---------- 5) Chatbot "Ask about this dish" ---------- */
// Tên và đơn vị các chất dinh dưỡng trong dữ liệu (r.x = dinh dưỡng của CẢ món)
const NUT={PROCNT:["Protein","g"],FAT:["Total fat","g"],FASAT:["Saturated fat","g"],FAMS:["Monounsaturated fat","g"],FAPU:["Polyunsaturated fat","g"],FATRN:["Trans fat","g"],
 CHOLE:["Cholesterol","mg"],CHOCDF:["Carbohydrates","g"],SUGAR:["Sugars","g"],FIBTG:["Fiber","g"],WATER:["Water","g"],NA:["Sodium","mg"],K:["Potassium","mg"],CA:["Calcium","mg"],
 FE:["Iron","mg"],MG:["Magnesium","mg"],P:["Phosphorus","mg"],ZN:["Zinc","mg"],VITA_RAE:["Vitamin A","µg"],VITC:["Vitamin C","mg"],VITD:["Vitamin D","µg"],TOCPHA:["Vitamin E","mg"],
 VITK1:["Vitamin K","µg"],THIA:["Thiamin (B1)","mg"],RIBF:["Riboflavin (B2)","mg"],NIA:["Niacin (B3)","mg"],VITB6A:["Vitamin B6","mg"],FOLDFE:["Folate","µg"],VITB12:["Vitamin B12","µg"]};
let chat=[],chatBusy=false;
function dishContext(){
 const r=cur,t=tgt();
 const per=Object.entries(r.x||{}).filter(([k])=>NUT[k]).map(([k,v])=>`${NUT[k][0]}: ${fmt(v/r.s)} ${NUT[k][1]}`).join("; ");
 return "You are the nutrition helper inside a recipe app. ONLY explain the ingredients and the nutrition of the dish below "
  +"(what an ingredient is, what a nutrient does, which ingredients contribute most). Never search for, recommend or compare other dishes; "
  +"if asked about anything else, say politely that you can only talk about this dish's ingredients and nutrition. "
  +"Answer in English, in under 120 words, and say values are approximate.\n\n"
  +`Dish: ${r.n}\nDiet labels: ${r.d.join(", ")||"none"}\nCuisine: ${r.u.join(", ")||"none"}\n`
  +`Original servings: ${r.s}; calories per serving: ${Math.round(r.c/r.s)} kcal\nServings shown to the user: ${t}\n`
  +`Ingredients (for ${t} servings):\n`+ingList().map(i=>`- ${[i.q?fmt(i.q):"",i.m!=="<unit>"?i.m:"",i.food].filter(Boolean).join(" ")}${i.w?` (${Math.round(i.w)} g)`:""}`).join("\n")
  +`\nNutrition per serving: ${per||"not available"}`;
}
function renderChat(){
 $("msgs").innerHTML=chat.map(m=>`<div class="m ${m.role==="user"?"u":""} ${m.err?"err":""}">${esc(m.content)}</div>`).join("")
  +(chatBusy?`<div class="m">Thinking...</div>`:"");
 $("msgs").scrollTop=$("msgs").scrollHeight;
 $("sug").hidden=chat.length>1;
}
function openChat(){
 if(!cur)return;
 chat=[{role:"assistant",content:`Hi! Ask me about the ingredients or nutrition of “${cur.n}”.`}];
 $("sug").innerHTML=["What gives this dish most of its calories?","Is this dish high in sodium?","Where does the protein come from?"].map(q=>`<button type="button">${esc(q)}</button>`).join("");
 $("chat").hidden=false;renderChat();setTimeout(()=>$("chatText").focus(),50);
}
function closeChat(){$("chat").hidden=true;chat=[];chatBusy=false}
async function sendChat(text){
 text=text.trim();if(!text||chatBusy||!cur)return;
 chat.push({role:"user",content:text});chatBusy=true;renderChat();
 // Chỉ gửi các lượt hỏi-đáp thật (bỏ lời chào đầu); lượt user đầu tiên được gắn kèm dữ liệu món
 let turns=chat.filter((m,k)=>!(k===0&&m.role==="assistant")&&!m.err&&!(chat[k+1]&&chat[k+1].err)).map(m=>({role:m.role,content:m.content}));
 turns=turns.slice(-19);while(turns.length&&turns[0].role!=="user")turns.shift();
 turns[0]={role:"user",content:dishContext()+"\n\nQuestion: "+turns[0].content};
 try{
  const res=await apiFetch("api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({input:turns})});
  const out=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(typeof out.detail==="string"?out.detail:"The assistant could not answer, please try again.");
  chat.push({role:"assistant",content:(out.text||"").trim()||"Sorry, I have no answer for that."});
 }catch(e){chat.push({role:"assistant",content:e.message,err:true})}
 chatBusy=false;renderChat();
}

/* ---------- Gắn sự kiện cho giao diện ---------- */
$("go").onclick=()=>{setIng(ingTerms());search()};
$("ing").addEventListener("keydown",e=>{
 if(e.key==="Enter"){e.preventDefault();clearTimeout(ingTimer);const l=ingTerms();setIng(l);search()}   // Enter: chuẩn hoá "a, b, " rồi tìm
});
// Gõ tới đâu, dấu phẩy + cách tự được thêm và danh sách món tự cập nhật (chờ 0,4 giây sau khi ngừng gõ)
$("ing").addEventListener("input",e=>{
 if(e.inputType&&e.inputType.startsWith("delete")){renderChips()}else tidyIng();
 renderChips();clearTimeout(ingTimer);ingTimer=setTimeout(()=>{if(R.length)search()},400);
});
$("q").addEventListener("keydown",e=>{if(e.key==="Enter")search()});
$("ingChips").addEventListener("click",e=>{
 const ad=e.target.closest("[data-add]");if(!ad)return;
 const w=ad.dataset.add,l=ingTerms();
 setIng(l.includes(w)?l.filter(x=>x!==w):[...l,w]);   // bấm lần nữa thì bỏ món đó
 clearTimeout(ingTimer);search();
});
// Đổi bộ lọc là danh sách cập nhật ngay
for(const id of["meal","diet","cu","dish","ord","all"])$(id).addEventListener("change",()=>{if(R.length)search()});
$("sv").addEventListener("change",()=>{if(cur)draw();if(R.length)search()});
$("nav").addEventListener("click",e=>{const b=e.target.closest("[data-v]");if(!b)return;const v=b.dataset.v;
 if(v==="home"){view="home";nav();show(home)}else{view=v;nav();show((v==="fav"?fav:hist).map(i=>({r:R[i],k:0})))}});
$("pager").addEventListener("click",e=>{const b=e.target.closest("[data-p]");if(b&&!b.disabled)goPage(b.dataset.p)});
$("grid").addEventListener("click",e=>{
 const h=e.target.closest("[data-fav]");if(h){toggleFav(+h.dataset.fav);return}
 const c=e.target.closest(".card");if(c)select(R[+c.dataset.i]);
});
$("pn").addEventListener("click",e=>{const t=e.target,h=t.closest("[data-fav]");
 if(h)toggleFav(+h.dataset.fav);else if(t.id==="gen")gen()});
$("pclose").onclick=()=>setPanel(false);
$("scrim").onclick=()=>{setPanel(false)};
$("ask").onclick=openChat;
$("chatBack").onclick=closeChat;
$("chatClose").onclick=()=>{closeChat();setPanel(false)};
$("sug").addEventListener("click",e=>{const b=e.target.closest("button");if(b)sendChat(b.textContent)});
$("chatForm").addEventListener("submit",e=>{e.preventDefault();const v=$("chatText").value;$("chatText").value="";sendChat(v)});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!$("authModal").hidden)closeAuth();else if(!$("chat").hidden)closeChat()}});

/* ---------- 6) Đăng ký / đăng nhập ---------- */
function setErr(f,msg){            // f = "Username" | "Email" | "Password"
 const p=$("err"+f),i=$("auth"+f);
 if(p)p.textContent=msg;
 if(i)i.classList.toggle("invalid",!!msg);
}
function clearErrs(){["Username","Email","Password"].forEach(f=>setErr(f,""));$("authError").textContent=""}
function openAuth(mode="login"){
 authMode=mode;const login=mode==="login";
 $("authModal").hidden=false;
 $("authTitle").textContent=login?"Sign in":"Create account";
 $("authSub").textContent=login?"Sign in to use your account.":"Create a new account to join MealMate.";
 $("usernameText").textContent=login?"Username or email":"Username";
 $("emailLabel").hidden=login;
 $("authPassword").autocomplete=login?"current-password":"new-password";
 $("authSubmit").textContent=login?"Sign in":"Create account";
 $("authSwitch").textContent=login?"Don’t have an account? Create one":"Already have an account? Sign in";
 clearErrs();
 $("authUsername").value="";$("authEmail").value="";$("authPassword").value="";
 setTimeout(()=>$("authUsername").focus(),50);
}
function closeAuth(){$("authModal").hidden=true}
// Đổi thông báo lỗi của server (tiếng Việt) sang tiếng Anh cho khớp giao diện
const AUTH_ERR={401:"Incorrect username/email or password.",409:"That username or email is already taken.",422:"Please check the details you entered.",400:"Please check the details you entered."};
async function authRequest(url,payload){
 let r;
 try{r=await apiFetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})}
 catch(e){throw new Error(SERVER_HINT)}                     // server chưa chạy / mở sai địa chỉ
 let data={};try{data=await r.json()}catch(e){}
 if(!r.ok){
  const mk=msg=>Object.assign(new Error(msg),{status:r.status,code:data.detail});
  if(AUTH_ERR[r.status])throw mk(AUTH_ERR[r.status]);
  if(r.status===404||r.status===405)throw mk(SERVER_HINT);
  throw mk(`Server error ${r.status}: `+(typeof data.detail==="string"?data.detail:"please check the terminal running uvicorn."));
 }
 return data;
}
function renderAuth(){
 const el=$("authArea");
 if(currentUser){
  el.innerHTML=`<div class="who">${ic("user")}<span>Hi, <b>${esc(currentUser.username)}</b></span></div><button id="logoutBtn" class="btn-outline">Sign out</button>`;
  $("logoutBtn").onclick=logout;
 }else{
  el.innerHTML=`<button id="loginBtn" class="btn-outline">${ic("user")}Sign in</button><button id="registerBtn" class="btn-solid">${ic("userplus")}Create account</button>`;
  $("loginBtn").onclick=()=>openAuth("login");
  $("registerBtn").onclick=()=>openAuth("register");
 }
}
async function loadMe(){
 try{
  const r=await apiFetch("api/me");const d=await r.json();
  currentUser=d.logged_in?d.user:null;renderAuth();
 }catch(e){currentUser=null;renderAuth()}
}
async function logout(){
 try{await apiFetch("api/logout",{method:"POST"})}catch(e){}
 currentUser=null;renderAuth();
}
$("authClose").onclick=closeAuth;
$("authModal").addEventListener("click",e=>{if(e.target===$("authModal"))closeAuth()});
$("authSwitch").onclick=()=>openAuth(authMode==="login"?"register":"login");
["Username","Email","Password"].forEach(f=>$("auth"+f).addEventListener("input",()=>setErr(f,"")));
$("authForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const errBox=$("authError"),btn=$("authSubmit"),u=$("authUsername").value.trim(),em=$("authEmail").value.trim(),pw=$("authPassword").value;
 clearErrs();
 // Kiểm tra nhanh ở trình duyệt (server vẫn kiểm tra lại)
 let bad=false;
 if(!u){setErr("Username",authMode==="login"?"Please enter your username or email.":"Please enter a username.");bad=true}
 else if(authMode==="register"&&!/^[A-Za-z0-9_]{3,30}$/.test(u)){setErr("Username","3–30 characters: letters, numbers or underscores only.");bad=true}
 if(authMode==="register"){
  if(!em){setErr("Email","Please enter your email.");bad=true}
  else if(!/^\S+@\S+\.\S+$/.test(em)){setErr("Email","Invalid email (e.g. name@example.com).");bad=true}
 }
 if(!pw){setErr("Password","Please enter your password.");bad=true}
 else if(authMode==="register"&&pw.length<6){setErr("Password","Password must be at least 6 characters.");bad=true}
 if(bad)return;
 btn.disabled=true;
 try{
  const data=authMode==="login"
   ?await authRequest("api/login",{username:u,password:pw})
   :await authRequest("api/register",{username:u,email:em,password:pw});
  currentUser={username:data.username,email:data.email};
  renderAuth();closeAuth();
 }catch(err){
  if(err.status===401)setErr("Password","Incorrect username/email or password.");
  else if(err.code==="username_taken")setErr("Username","This username is already taken.");
  else if(err.code==="email_taken")setErr("Email","This email is already registered.");
  else errBox.textContent=err.message;
 }
 btn.disabled=false;
});

renderAuth();renderChips();
setPanel(innerWidth>1360);   // màn hình rộng: cột chi tiết luôn hiện; màn hình hẹp: chỉ hiện khi chọn món
loadMe();
load();
