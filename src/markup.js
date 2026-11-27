import {captureMarkedNode, layoutPins} from "./local-capture.js";
const ns="http://www.w3.org/2000/svg";
const labels={pin:"点选批注",pen:"画笔",rect:"矩形",ellipse:"椭圆",arrow:"箭头"};
const icons={
  element:'<path d="M4 10V4h6m4 0h6v6M4 14v6h6m3-10 7 5-4 1-1 4z"/>',
  pen:'<path d="M10 13.5c2.2-3.9 5.6-8.1 9.1-10.2.9-.5 1.9.4 1.4 1.4-1.8 3.8-5.2 7.8-8.6 10.4z"/><path d="M10.5 14.3c-2.1-1.2-4.3.1-4.7 2.1-.3 1.4-1.1 2.4-2.5 3.2 2.5.8 5.8.8 7.5-1.2 1.1-1.3 1.1-2.8-.3-4.1z"/>',
  rect:'<rect x="3.5" y="5" width="17" height="14" rx="2.4"/>',
  ellipse:'<ellipse cx="12" cy="12" rx="8.8" ry="6.9"/>',
  arrow:'<path d="M4.5 19.5 19 5m-9 0h9v9"/>',
  pin:'<path d="M19 10c0 4.7-7 10.3-7 10.3S5 14.7 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.1"/>',
  prev:'<path d="m14 6-6 6 6 6"/>',next:'<path d="m10 6 6 6-6 6"/>',
  handoff:'<path d="m4 4 16 7-7 3-3 7-6-17Z M13 14l7-3"/>',
  inspect:'<path d="M3 9V4h5m8 0h5v5m0 6v5h-5m-8 0H3v-5"/><circle cx="12" cy="12" r="3"/>',
  remove:'<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
  save:'<path d="M5 4h12l3 3v13H4V5a1 1 0 0 1 1-1Zm3 0v5h8V4m0 16v-6H8v6"/>',
  saved:'<path d="m5 12 4 4 10-10"/>',
  discard:'<path d="M9 5 4 10l5 5m-5-5h10a5 5 0 0 1 0 10h-2"/>',
  dismiss:'<path d="m6 6 12 12M18 6 6 18"/>',
  waiting:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
  alert:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4m0 4h.01"/>',
  external:'<path d="M13 5h6v6m0-6-9 9m7 0v5H5V7h5"/>'
};
const icon=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+icons[k]+'</svg>';
function svg(tag,attrs){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el}
const panel=document.createElement("section");
panel.className="mark-panel";panel.hidden=true;panel.setAttribute("aria-label","画布标注");
panel.innerHTML='<div class="mark-row tools"></div><div class="mark-msg mark-sr-only" role="status"></div>';
document.body.append(panel);
const toolsRow=panel.querySelector(".tools"), msg=panel.querySelector(".mark-msg");
const editor=document.createElement("section");
editor.className="mark-card";editor.hidden=true;editor.setAttribute("aria-label","批注详情");
editor.innerHTML='<header><b class="card-number"></b><strong>批注</strong></header><textarea maxlength="1000" aria-label="修改意见" placeholder="写下要改什么…"></textarea><footer><span class="save-state mark-sr-only" role="status"></span></footer>';
document.body.append(editor);
const note=editor.querySelector("textarea"), feedback=editor.querySelector(".save-state");
const cardHeading=editor.querySelector("strong"), footer=editor.querySelector("footer");
iconButton(editor.querySelector("header"),"dismiss","收起批注");
const inspect=iconButton(footer,"inspect","检查元素");
const remove=iconButton(footer,"remove","删除批注");
const discard=iconButton(footer,"discard","放弃修改");discard.hidden=true;
const save=iconButton(footer,"save","保存批注");save.className="mark-save";
function button(parent,text,action){const b=document.createElement("button");b.type="button";b.textContent=text;b.dataset.action=action;parent.append(b);return b}
function iconButton(parent,key,name){const b=button(parent,"",key);b.title=b.ariaLabel=name;b.innerHTML=icon(key);return b}
for(const [key,name] of Object.entries(labels))iconButton(toolsRow,key,name).className="mark-tool";
const elementTool=iconButton(toolsRow,"element","选取网页元素");elementTool.className="mark-tool";toolsRow.prepend(elementTool);
const inkwell=document.createElement("div");inkwell.className="mark-inks";inkwell.setAttribute("role","group");inkwell.ariaLabel="标注颜色";toolsRow.append(inkwell);
const palette=[["靛蓝","#5061D9"],["珊瑚","#E65949"],["琥珀","#C6800C"],["青绿","#118880"],["石墨","#3F4552"]];
for(const [name,value] of palette){
  const b=button(inkwell,"","ink");b.title=b.ariaLabel=name;b.dataset.color=value;b.style.setProperty("--ink",value);b.className="ink-choice";
}
const custom=document.createElement("input");custom.type="color";custom.className="mark-custom";custom.ariaLabel="自定义颜色";custom.title="自定义颜色";inkwell.append(custom);
const navigatorBox=document.createElement("div");navigatorBox.className="mark-navigate";toolsRow.append(navigatorBox);
const prev=iconButton(navigatorBox,"prev","上一条批注");
const next=iconButton(navigatorBox,"next","下一条批注");
const handoff=iconButton(toolsRow,"handoff","在本对话确认批注");
const handoffLabel=document.createTextNode("在本对话确认批注");handoff.append(handoffLabel);handoff.className="mark-handoff";
const draftLink=document.createElement("a");
draftLink.className="mark-draft-link";
draftLink.innerHTML=icon("external");
draftLink.title=draftLink.ariaLabel="打开带截图引用的草稿";
draftLink.hidden=true;toolsRow.append(draftLink);
function panelStatus(text="",state="handoff",href=""){
  msg.textContent=text;
  handoff.dataset.state=state;
  handoff.title=text||handoff.ariaLabel;
  handoff.innerHTML=icon(state);handoff.append(handoffLabel);
  draftLink.hidden=!href;
  if(href)draftLink.href=href;
}
function saveStatus(text="",state="save"){
  feedback.textContent=text;
  save.dataset.state=state;
  save.title=text||save.ariaLabel;
  save.innerHTML=icon(state);
}
let opening=false;
const done=button(toolsRow,"完成","close");done.className="mark-done";
let project="",active=false,tool="pen",marks=[],revision=-1,draft=null,gesture=null,edit=null,busy=false,toggle;
let ink=palette[0][1], nextInk=ink, focusId=null, motion=0;
try{const saved=localStorage.getItem("codexdesign-ink");if(/^#[0-9a-f]{6}$/i.test(saved||""))ink=nextInk=saved}catch{}
function bridge(op){window.dispatchEvent(new CustomEvent("codexdesign:markup",{detail:op}))}
const layers=new Map();
const currentProject=()=>new URL(location.href).searchParams.get("project")||"";
const api=()=>"/api/projects/"+encodeURIComponent(project)+"/annotations";
const channel=typeof BroadcastChannel==="function"?new BroadcastChannel("codexdesign-markup"):null;
function accept(state){if(state.revision<revision)return;revision=state.revision;marks=state.marks;refresh()}
async function load(){
  const id=project;if(!id)return false;
  try{
    const response=await fetch(api());
    if(!response.ok)throw Error("读取标注失败");
    const state=await response.json();
    if(project!==id)return false;
    accept(state);return true;
  }catch(e){
    if(project===id)panelStatus(e.message,"alert");
    return false;
  }
}
if(channel)channel.onmessage=e=>{if(e.data===project&&active)load()};
window.addEventListener("focus",()=>{if(active)load()});
function locationOf(m){
  if(m.kind==="arrow")return m.points[0];
  if(m.kind==="pen"||m.kind==="pin")return m.points.at(-1);
  return [Math.max(m.points[0][0],m.points[1][0]),Math.min(m.points[0][1],m.points[1][1])];
}
function positionCard(){
  if(editor.hidden)return;
  const m=draft||edit,l=m&&layers.get(m.nodeId);
  if(!l)return;
  const r=l.getBoundingClientRect(),[x,y]=locationOf(m);
  const pin=l.parentElement.querySelector('[data-pin="'+m.id+'"]')?.getBoundingClientRect();
  const px=pin?pin.left+pin.width/2:r.left+x*r.width/1000,py=pin?pin.top+pin.height/2:r.top+y*r.height/1000,w=editor.offsetWidth,h=editor.offsetHeight;
  const left=px+22+w<innerWidth?px+20:px-w-20;
  editor.style.left=Math.max(8,Math.min(innerWidth-w-8,left))+"px";
  const floor=Math.min(innerHeight-8,panel.getBoundingClientRect().top-6);
  editor.style.top=Math.max(8,Math.min(floor-h,py-20))+"px";
}
function setEditor(mark,isDraft=false){
  draft=isDraft?mark:null; edit=isDraft?null:mark?{...mark}:null;editor.hidden=!mark;
  ink=mark?.color||nextInk;note.value=mark?.note||"";saveStatus();panelStatus();discard.hidden=true;
  if(mark){focusId=mark.id;cardHeading.title=mark.elementText||mark.title||labels[mark.kind]}
  refresh();
}
function dirty(){return !!draft||!!edit&&(edit.note!==note.value.trim()||edit.color!==ink)}
function clearEditor(){setEditor(null)}
async function settle(){
  if(busy)return false;
  if(dirty())return saveCurrent(false);
  return true;
}
function setActive(open){
  active=open;panel.hidden=!active;toggle?.setAttribute("aria-pressed",String(active));
  if(active){panelStatus();load()}else{gesture=null;clearEditor()}
  syncLayers();refresh();
}
function shape(mark,layer,selected){
  const [a,b]=[mark.points[0],mark.points.at(-1)],dx=b[0]-a[0],dy=b[1]-a[1];
  let tag,attrs;
  if(mark.kind==="pen"){tag="polyline";attrs={points:mark.points.map(p=>p.join(",")).join(" ")}}
  else if(mark.kind==="rect"){tag="rect";attrs={x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(dx),height:Math.abs(dy)}}
  else if(mark.kind==="ellipse"){tag="ellipse";attrs={cx:(a[0]+b[0])/2,cy:(a[1]+b[1])/2,rx:Math.abs(dx)/2,ry:Math.abs(dy)/2}}
  else{
    const r=layer.getBoundingClientRect(),sx=r.width/1000||1,sy=r.height/1000||1,angle=Math.atan2(dy*sy,dx*sx),h=Math.min(16,Math.hypot(dx*sx,dy*sy)*.45);
    const wing=sign=>[b[0]-h*Math.cos(angle+sign*.52)/sx,b[1]-h*Math.sin(angle+sign*.52)/sy].join(" ");
    tag="path";attrs={d:"M"+a.join(" ")+" L"+b.join(" ")+" M"+wing(-1)+" L"+b.join(" ")+" L"+wing(1)};
  }
  const g=svg("g",{"data-mark":mark.id});
  if(mark.kind==="pin")return g;
  const stroke=mark.color||"#db4429";
  g.append(svg(tag,{...attrs,fill:"none",stroke,"stroke-width":selected?3.2:2.7,"vector-effect":"non-scaling-stroke","stroke-linejoin":"round","stroke-linecap":"round"}));
  return g;
}
function pinText(el,color){
  el.style.background=color;
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  el.style.color=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?"#141517":"#fff";
}
function arrangePins(l){
  const pins=l.parentElement?.querySelector(".mark-pins");if(!pins?.childElementCount)return;
  const {width,height}=l.getBoundingClientRect();if(!width||!height)return;
  const buttons=[...pins.children];
  const positions=layoutPins(buttons.map(b=>[Number(b.dataset.x),Number(b.dataset.y)]),width,height,26);
  buttons.forEach((b,i)=>{
    const [x,y]=positions[i];b.style.left=(100*x/width)+"%";b.style.top=(100*y/height)+"%";
  });
}
function paint(id){
  const l=layers.get(id);if(!l)return;
  const pins=l.parentNode.querySelector(".mark-pins");if(!pins)return;
  const drawing=document.createDocumentFragment(),used=new Set();
  const all=marks.filter(m=>m.nodeId===id);if(draft?.nodeId===id&&!all.some(m=>m.id===draft.id))all.push(draft);
  for(const m of all){
    const selected=m.id===(edit||draft)?.id,shown=selected?{...m,color:ink}:m;
    drawing.append(shape(shown,l,selected));
    let b=pins.querySelector('[data-pin="'+m.id+'"]');
    if(!b){b=button(pins,"","pin-open");b.dataset.pin=m.id;b.className="mark-pin nodrag nopan";b.onpointerdown=e=>e.stopPropagation();b.onclick=e=>{e.stopPropagation();openMark(m.id,false)}}
    const index=marks.findIndex(s=>s.id===m.id),n=index<0?marks.length+1:index+1;
    b.textContent=String(n);b.ariaLabel="打开批注 "+n;b.title=m.note||b.ariaLabel;
    const [x,y]=locationOf(m);b.dataset.x=x;b.dataset.y=y;pinText(b,shown.color||"#db4429");
    b.setAttribute("aria-pressed",String(selected));used.add(m.id);
  }
  for(const b of [...pins.children])if(!used.has(b.dataset.pin))b.remove();
  l.replaceChildren(drawing);arrangePins(l);
}
function drawLive(){if(!gesture)return;const {l,mark}=gesture;const old=l.querySelector(".mark-live"),g=shape(mark,l,true);g.classList.add("mark-live");if(old)old.replaceWith(g);else l.append(g)}
function refresh(){
  for(const b of toolsRow.querySelectorAll(".mark-tool"))b.setAttribute("aria-pressed",String(b.dataset.action===tool));
  for(const b of inkwell.querySelectorAll("button"))b.setAttribute("aria-pressed",String(b.dataset.color.toLowerCase()===ink.toLowerCase()));
  custom.value=ink;custom.classList.toggle("custom-picked",!palette.some(p=>p[1].toLowerCase()===ink.toLowerCase()));
  prev.disabled=next.disabled=handoff.disabled=!marks.length||busy||opening;
  custom.disabled=done.disabled=busy||opening;
  if(toggle)toggle.disabled=busy||opening;
  const m=draft||edit;if(m){
    inspect.hidden=!m.selector;
    const n=marks.findIndex(s=>s.id===m.id);
    const badge=editor.querySelector(".card-number");badge.textContent=String(n<0?marks.length+1:n+1);pinText(badge,ink);remove.hidden=!!draft;
  }
  for(const b of editor.querySelectorAll("button"))b.disabled=busy||opening;note.readOnly=busy||opening;
  for(const id of layers.keys())paint(id);
  positionCard();
}
function point(e,l){const r=l.getBoundingClientRect();return [Math.round(1000*(e.clientX-r.left)/r.width),Math.round(1000*(e.clientY-r.top)/r.height)].map(v=>Math.min(1000,Math.max(0,v)))}
function context(l,m,exact){
  const frame=l.parentNode.querySelector("iframe");
  if(!frame?.contentDocument)return;
  const points=m.points, lower=k=>Math.min(...points.map(p=>p[k])),upper=k=>Math.max(...points.map(p=>p[k]));
  const pt=m.kind==="arrow"?points.at(-1):[(lower(0)+upper(0))/2,(lower(1)+upper(1))/2];
  const d=frame.contentDocument;let el=exact||d.elementFromPoint(pt[0]*frame.clientWidth/1000,pt[1]*frame.clientHeight/1000);
  if(!el)return;
  if(!exact&&el.closest("button,a,input,textarea,select"))el=el.closest("button,a,input,textarea,select");
  m.elementText=(el.textContent||"").trim().replace(/\s+/g," ").slice(0,128);
  const parts=[];for(let t=el;t&&t!==d.documentElement;t=t.parentElement){
    if(t.id){parts.unshift("#"+CSS.escape(t.id));break}
    const siblings=[...(t.parentElement?.children||[])].filter(x=>x.localName===t.localName);
    parts.unshift(CSS.escape(t.localName)+(siblings.length>1?":nth-of-type("+(siblings.indexOf(t)+1)+")":""));
  }
  m.selector=parts.join(" > ").slice(0,512);
}
async function finishMark(m){
  if(!await settle())return;
  setEditor(m,true);
  const ok=await saveCurrent(true);
  if(ok&&matchMedia("(pointer:fine)").matches)note.focus({preventScroll:true});
}
function newMark(id,kind,points,l){
  return {id:crypto.randomUUID(),nodeId:id,kind,points,color:nextInk,note:"",selector:"",elementText:"",viewport:[Math.max(1,l.clientWidth),Math.max(1,l.clientHeight)]};
}
function installLayer(id,host){
  const l=svg("svg",{viewBox:"0 0 1000 1000",preserveAspectRatio:"none",class:"mark-layer nodrag nopan",role:"img","aria-label":"标注绘图区"});
  const pins=document.createElement("div");pins.className="mark-pins";
  host.append(l,pins);layers.set(id,l);
  l.onpointerdown=e=>{
    e.stopPropagation();if(e.button!==0||!e.isPrimary||busy||gesture||opening)return;
    e.preventDefault();const p=point(e,l),mark=newMark(id,tool,[p,p],l);
    if(tool==="element"){
      const doc=host.querySelector("iframe")?.contentDocument;
      if(!doc){panelStatus("这是一张图片，请使用落点或画笔批注。","alert");return}
      const hit=doc.elementFromPoint(p[0]*l.clientWidth/1000,p[1]*l.clientHeight/1000);
      if(hit){const el=hit.closest("button,a,input,textarea,select")||hit;markElement({nodeId:id,element:el})}
      return;
    }
    gesture={l,pointer:e.pointerId,mark};l.setPointerCapture(e.pointerId);
  };
  function extend(e){const m=gesture.mark,p=point(e,l);if(m.kind!=="pen")m.points[1]=p;else if(String(p)!==String(m.points.at(-1))){if(m.points.length>=2048)m.points=m.points.filter((_,i)=>i%2===0);m.points.push(p)}}
  l.onpointermove=e=>{
    if(gesture?.l!==l||e.pointerId!==gesture.pointer)return;e.stopPropagation();
    const events=e.getCoalescedEvents?.();for(const event of events?.length?events:[e])extend(event);
    if(!motion)motion=requestAnimationFrame(()=>{motion=0;drawLive()});
  };
  l.onpointerup=e=>{
    if(gesture?.l!==l||e.pointerId!==gesture.pointer)return;e.stopPropagation();extend(e);
    const m=gesture.mark;gesture=null;const a=m.points[0];l.querySelector(".mark-live")?.remove();
    if(m.kind==="pin"||m.points.some(b=>Math.abs(b[0]-a[0])+Math.abs(b[1]-a[1])>3)){context(l,m);finishMark(m)}
  };
  l.onlostpointercapture=l.onpointercancel=()=>{if(gesture?.l===l){gesture=null;paint(id)}};
  l.onclick=l.ondblclick=e=>{e.preventDefault();e.stopPropagation()};
  paint(id);
}
function syncLayers(){
  for(const [id,l] of layers)if(!active||!l.isConnected){l.parentElement?.querySelector(".mark-pins")?.remove();l.remove();layers.delete(id)}
  if(!active)return;
  for(const node of document.querySelectorAll(".react-flow__node[data-id]")){
    const host=node.querySelector(".html-node,.image-node");if(host&&!layers.has(node.dataset.id))installLayer(node.dataset.id,host);
  }
}
async function markElement(selected){
  if(!selected?.element?.isConnected||!await settle())return;
  const {nodeId,element}=selected,r=element.getBoundingClientRect();
  bridge({type:"clear"});setActive(true);const l=layers.get(nodeId);if(!l)return;
  const norm=(x,y)=>[x/l.clientWidth,y/l.clientHeight].map(v=>Math.round(Math.max(0,Math.min(1,v))*1000));
  const mark=newMark(nodeId,"rect",[norm(r.left,r.top),norm(r.right,r.bottom)],l);
  mark.origin="element";context(l,mark,element);
  const prior=marks.find(m=>m.nodeId===nodeId&&m.selector===mark.selector&&m.kind==="rect"&&
    (m.origin==="element"||(!m.origin&&m.points.length===2&&m.points.every((p,i)=>p.every((v,j)=>Math.abs(v-mark.points[i][j])<=2)))));
  if(prior){await openMark(prior.id,false);note.focus({preventScroll:true})}else await finishMark(mark);
}
// The canvas has its own markup controls. Cancel Chromium's context menu on this surface.
const cancelCanvasMenu=e=>e.preventDefault();
document.addEventListener("contextmenu",e=>{
  if(currentProject()&&e.target.closest?.(".react-flow"))cancelCanvasMenu(e);
},true);
function suppressPreviewMenu(frame){
  try{frame.contentDocument?.addEventListener("contextmenu",cancelCanvasMenu,true)}catch{}
}
document.addEventListener("load",e=>{
  if(e.target.matches?.(".html-node iframe"))suppressPreviewMenu(e.target);
},true);
function mount(){
  const id=currentProject();
  if(id!==project){project=id;active=false;panel.hidden=true;marks=[];revision=-1;gesture=null;busy=false;focusId=null;clearEditor();load()}
  const bar=document.querySelector(".canvas-toolbar");
  if(bar&&!bar.querySelector(".markup-toggle")){
    toggle=button(bar,"","toggle");toggle.className="markup-toggle";toggle.title="画笔与图形标注";toggle.setAttribute("aria-pressed",String(active));toggle.innerHTML=icon("pen")+"标注";toggle.onclick=async()=>{if(!opening&&await settle()){if(!active)bridge({type:"clear"});setActive(!active)}};
    bar.querySelector('[aria-label="选择工具"]')?.addEventListener("click",async()=>{if(active&&!opening&&await settle())setActive(false)});
  }
  syncLayers();positionCard();
}
let queued=false;new MutationObserver(records=>{
  if(queued||!records.some(r=>!r.target.closest?.(".mark-panel,.mark-layer,.mark-pins")))return;
  const moved=records.some(r=>r.target.matches?.(".react-flow__viewport,.react-flow__node"));
  queued=true;requestAnimationFrame(()=>{queued=false;mount();if(active&&moved){for(const l of layers.values())arrangePins(l);positionCard()}});
}).observe(document.querySelector("#root"),{subtree:true,childList:true,attributes:true,attributeFilter:["style"]});
mount();
for(const frame of document.querySelectorAll(".html-node iframe"))suppressPreviewMenu(frame);
window.addEventListener("popstate",mount);window.addEventListener("resize",positionCard);
window.addEventListener("beforeunload",e=>{if(dirty()||busy){e.preventDefault();e.returnValue=""}});
document.addEventListener("keydown",async e=>{
  if(!active||busy||opening)return;
  if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)&&!editor.hidden){e.preventDefault();if(await saveCurrent(false))clearEditor();return}
  if(e.key!=="Escape")return;
  e.preventDefault();e.stopPropagation();
  if(gesture){const id=gesture.mark.nodeId;gesture=null;paint(id)}
  else if(edit||draft){if(await settle())clearEditor()}
  else setActive(false);
},true);
async function openMark(id,center){
  if(opening||!await settle())return;
  const m=marks.find(item=>item.id===id);if(!m)return;
  const [x,y]=locationOf(m);
  if(center)bridge({type:"focus",id:m.nodeId,x,y});
  setEditor(m);requestAnimationFrame(positionCard);
}
async function write(action){
  const id=project;busy=true;refresh();
  try{
    const r=await fetch(api(),{method:"POST",headers:{"Content-Type":"application/json","X-Canvas-Request":"1"},body:JSON.stringify(action)});const s=await r.json();
    if(project!==id)return false;
    if(!r.ok){if(r.status===409)await load();throw Error(s.error||"保存失败")}
    accept(s);channel?.postMessage(id);return true;
  }catch(e){if(project===id){panelStatus(e.message,"alert");saveStatus("未保存："+e.message,"alert");discard.hidden=false}return false}
  finally{if(project===id){busy=false;refresh()}}
}
async function saveCurrent(keepOpen){
  if(busy)return false;
  const current=draft||edit;if(!current)return true;
  if(dirty()){
    const values={note:note.value.trim(),color:ink};
    const op=draft?{action:"add",mark:{...draft,...values}}:{action:"note",id:edit.id,version:edit.version,...values};
    if(!await write(op))return false;
  }
  const saved=marks.find(m=>m.id===current.id);
  if(keepOpen&&saved){setEditor(saved);saveStatus("已保存","saved")}else clearEditor();
  return true;
}
async function chooseInk(value){
  if(busy||opening)return;
  ink=nextInk=value;try{localStorage.setItem("codexdesign-ink",ink)}catch{}
  if(edit||draft)await saveCurrent(true);else refresh();
}
custom.onchange=()=>chooseInk(custom.value);
async function draftMarkup(){
  if(opening||busy||!marks.length)return;
  const id=project,endpoint=api();
  const sameCanvas=()=>project===id&&currentProject()===id;
  opening=true;refresh();
  try{
    if(!await settle()||!sameCanvas()||!await load()||!sameCanvas())return;
    if(!marks.length){panelStatus("当前画面没有可提交的批注","alert");return}
    const version=revision;
    const entries=marks.map((mark,i)=>({mark,number:i+1}));
    const markedNodes=new Map();
    for(const entry of entries){
      const id=entry.mark.nodeId;
      if(!markedNodes.has(id))markedNodes.set(id,[]);
      markedNodes.get(id).push(entry);
    }
    const captures=[];
    for(const [nodeId,nodeEntries] of markedNodes){
      panelStatus("正在生成编号截图 "+(captures.length+1)+" / "+markedNodes.size,"waiting");
      const data=await captureMarkedNode(layers.get(nodeId),nodeEntries);
      if(!sameCanvas())return;
      if(revision!==version)throw Error("画布已变化，请重新提交。");
      const upload=await fetch(endpoint+"/captures",{method:"POST",headers:{"Content-Type":"application/json","X-Canvas-Request":"1"},body:JSON.stringify({revision:version,nodeId,data})});
      const part=await upload.json();if(!upload.ok)throw Error(part.error||"截图保存失败");
      if(!sameCanvas())return;
      captures.push(part);
    }
    const r=await fetch(endpoint+"/handoffs",{method:"POST",headers:{"Content-Type":"application/json","X-Canvas-Request":"1"},body:JSON.stringify({revision:version,captures})});
    const result=await r.json();if(!sameCanvas())return;
    if(!r.ok){if(r.status===409)await load();throw Error(result.error||"无法保存截图，请重试")}
    panelStatus("正在准备批注草稿","waiting");
    const staged=await fetch(endpoint+"/handoffs/"+result.handoffId+"/draft",{
      method:"POST",referrerPolicy:"same-origin",headers:{"X-Canvas-Request":"1"}
    });
    const delivery=await staged.json();if(!sameCanvas())return;
    if(!staged.ok)throw Error(delivery.error||"无法打开草稿，请重试");
    if(delivery.ready&&delivery.pastedImages)panelStatus("草稿已填入本对话，请检查后手动发送","saved");
    else if(delivery.existingDraft)panelStatus("对话输入框里已有草稿，请先处理","alert");
    else panelStatus("截图和意见已保存，可打开草稿链接","alert",delivery.fallbackUrl);
  }catch(e){if(sameCanvas())panelStatus(e.message,"alert")}
  finally{opening=false;refresh()}
}
note.oninput=()=>{if(dirty())saveStatus("待保存");else saveStatus("已保存","saved")};
async function command(e){
  const b=e.target.closest("button"),key=b?.dataset.action;if(!key||busy||opening)return;
  if(labels[key]||key==="element"){if(!await settle())return;clearEditor();tool=key;refresh()}
  if(key==="inspect"){
    const m=edit||draft,l=m&&layers.get(m.nodeId),doc=l?.parentElement.querySelector("iframe")?.contentDocument;
    let element;try{element=doc?.querySelector(m.selector)}catch{}
    if(!element){saveStatus("原元素已变化","alert");return}
    if(await settle()){setActive(false);bridge({type:"inspect",id:m.nodeId,assetPath:m.asset,element})}
  }
  if(key==="ink")await chooseInk(b.dataset.color);
  if(key==="prev"||key==="next"){
    if(!marks.length)return;const i=marks.findIndex(m=>m.id===focusId);
    const index=i<0?(key==="next"?0:marks.length-1):(i+(key==="next"?1:-1)+marks.length)%marks.length;
    await openMark(marks[index].id,true);
  }
  if(key==="close"&&await settle())setActive(false);
  if(key==="handoff"&&e.isTrusted)await draftMarkup();
  if(key==="dismiss"&&await settle())clearEditor();
  if(key==="discard")clearEditor();
  if(key==="save")await saveCurrent(false);
  if(key==="remove"&&edit&&await write({action:"remove",id:edit.id,version:edit.version})){focusId=null;clearEditor()}
}
panel.onclick=editor.onclick=command;
