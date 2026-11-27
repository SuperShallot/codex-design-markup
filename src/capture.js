// Read pixels from Codex Design's live node, then add the same shapes and pin numbers shown on the canvas.
import {domToCanvas} from "./index-NB5FNsou.js";

export function layoutPins(anchors,width,height,gap){
  const marginX=Math.min(gap/2,width/2),marginY=Math.min(gap/2,height/2);
  const positions=[];
  function available(x,y){
    return x>=marginX&&x<=width-marginX&&y>=marginY&&y<=height-marginY&&
      positions.every(([px,py])=>Math.hypot(px-x,py-y)>=gap);
  }
  const limit=Math.ceil(Math.max(width,height)/gap);
  for(const [ax,ay] of anchors){
    const x=Math.max(marginX,Math.min(width-marginX,ax*width/1000));
    const y=Math.max(marginY,Math.min(height-marginY,ay*height/1000));
    let chosen=available(x,y)?[x,y]:null;
    for(let ring=1;!chosen&&ring<=limit;ring++){
      for(let row=-ring;row<=ring&&!chosen;row++){
        const columns=Math.abs(row)===ring?Array.from({length:ring*2+1},(_,i)=>i-ring):[-ring,ring];
        for(const column of columns){
          const px=x+column*gap,py=y+row*gap;
          if(available(px,py)){chosen=[px,py];break}
        }
      }
    }
    positions.push(chosen||[x,y]);
  }
  return positions;
}

async function renderedNode(host,width,height,scale){
  const frame=host.querySelector("iframe");
  if(frame){
    const win=frame.contentWindow,doc=frame.contentDocument;
    if(!doc?.body||doc.readyState==="loading")throw Error("页面还在加载");
    await doc.fonts.ready;
    const options={width,height,scale};
    if(win.scrollX||win.scrollY)options.style={transform:"translate("+(-win.scrollX)+"px,"+(-win.scrollY)+"px)",transformOrigin:"top left"};
    return domToCanvas(doc.documentElement,options);
  }
  const image=host.querySelector("img");
  if(!image)throw Error("图稿尚未载入");
  await image.decode();
  const canvas=document.createElement("canvas");canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
  const ctx=canvas.getContext("2d"),style=getComputedStyle(image);
  ctx.scale(scale,scale);
  const fit=style.objectFit;
  if(fit==="contain"||fit==="cover"){
    const sx=width/image.naturalWidth,sy=height/image.naturalHeight;
    const ratio=fit==="contain"?Math.min(sx,sy):Math.max(sx,sy);
    const w=image.naturalWidth*ratio,h=image.naturalHeight*ratio;
    ctx.drawImage(image,(width-w)/2,(height-h)/2,w,h);
  }else ctx.drawImage(image,0,0,width,height);
  return canvas;
}

export async function captureMarkedNode(layer,entries){
  if(!layer?.isConnected)throw Error("画面已移除，请检查标注");
  const host=layer.parentElement,w=layer.clientWidth,h=layer.clientHeight;
  if(!w||!h)throw Error("画面尺寸无效");
  const scale=Math.min(1.5,1800/Math.max(w,h));
  const canvas=await renderedNode(host,w,h,scale);
  const ctx=canvas.getContext("2d"),width=canvas.width,height=canvas.height;
  // Annotation coordinates below use output pixels, regardless of how the base image was drawn.
  ctx.resetTransform();
  // An SVG with explicit width/height keeps vector-effect strokes independent of canvas zoom.
  const overlay=layer.cloneNode(false);
  overlay.removeAttribute("class");overlay.setAttribute("xmlns","http://www.w3.org/2000/svg");overlay.setAttribute("width",width);overlay.setAttribute("height",height);
  for(const {mark} of entries){
    const shape=layer.querySelector('[data-mark="'+CSS.escape(mark.id)+'"]');
    if(!shape)throw Error("画面上的批注已变化");
    overlay.append(shape.cloneNode(true));
  }
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(overlay)],{type:"image/svg+xml"}));
  try{
    const image=new Image();image.src=url;await image.decode();ctx.drawImage(image,0,0);
  }finally{URL.revokeObjectURL(url)}
  const pins=entries.map(({mark})=>host.querySelector('[data-pin="'+CSS.escape(mark.id)+'"]'));
  if(pins.some(pin=>!pin))throw Error("画面上的批注已变化");
  const radius=Math.max(11,Math.min(19,Math.round(Math.min(width,height)*.021)));
  const positions=layoutPins(pins.map(pin=>[Number(pin.dataset.x),Number(pin.dataset.y)]),width,height,radius*2+4);
  for(const [i,{mark,number}] of entries.entries()){
    const pin=pins[i],[x,y]=positions[i];
    ctx.beginPath();ctx.arc(x,y,radius,0,2*Math.PI);ctx.fillStyle=mark.color||"#db4429";ctx.fill();ctx.lineWidth=2;ctx.strokeStyle="#fff";ctx.stroke();
    ctx.fillStyle=pin.style.color;ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold "+Math.max(11,radius*1.08)+"px Arial";ctx.fillText(String(number),x,y+0.5);
  }
  let encoded=canvas.toDataURL("image/webp",.88);
  if(encoded.length>935000)encoded=canvas.toDataURL("image/webp",.68);
  let factor=.8;
  while(encoded.length>935000){
    const smaller=document.createElement("canvas");
    smaller.width=Math.max(1,Math.round(width*factor));smaller.height=Math.max(1,Math.round(height*factor));
    smaller.getContext("2d").drawImage(canvas,0,0,smaller.width,smaller.height);
    encoded=smaller.toDataURL("image/webp",.75);factor*=.8;
  }
  if(!encoded.startsWith("data:image/webp;base64,"))throw Error("当前浏览器无法生成 WebP 截图");
  return encoded.split(",")[1];
}
