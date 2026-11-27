import { execFile } from "node:child_process";
import { link, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function buildAnnotationDraft(threadId, snapshot, directory, pathForDigest) {
  const lines=["请根据截图中的编号处理以下批注。"];
  const files=[];
  const notesById=new Map(snapshot.marks.map(mark=>[mark.id,mark.note]));
  const reference=snapshot.handoffId.slice(0,12);
  let noteCount=0;
  await mkdir(directory,{recursive:true});
  for(const image of snapshot.images){
    const number=String(image.page).padStart(2,"0");
    lines.push("", "图 "+number+" · "+image.title);
    for(const issue of image.issues){
      const note=(notesById.get(issue.markId)??issue.note).trim();
      if(note){lines.push("#"+issue.number+" "+note);noteCount++}
    }
    const attachment=join(directory,"批注图 "+number+".webp");
    try{await link(pathForDigest(image.digest),attachment)}
    catch(error){if(error.code!=="EEXIST")throw error}
    files.push(attachment);
  }
  if(!noteCount)lines[0]="以下截图仅标了位置，意见待补充。";
  lines.push("", "批注记录 "+reference);
  const text=lines.join("\n");
  const url=new URL("codex://threads/"+threadId);
  const marker="正在载入批注 "+snapshot.handoffId.slice(0,16);
  url.searchParams.set("prompt",marker);
  const fallback=new URL(url);
  const references=files.map((path,index)=>"![批注图 "+(index+1)+"](<"+path.replaceAll("\\","/").replaceAll(">","%3E")+">)");
  fallback.searchParams.set("prompt",text+"\n\n"+references.join("\n"));
  if(fallback.href.length>6500){
    fallback.searchParams.set("prompt","请查看批注记录 "+reference+" 中的完整意见"+
      "\n"+references.slice(0,3).join("\n"));
  }
  return { url:url.href, marker, text, files, fallbackUrl:fallback.href };
}

export function openAnnotationDraft(draft) {
  if(process.platform!=="win32")return Promise.resolve({ ready:false });
  return new Promise((resolve,reject)=>{
    const script=fileURLToPath(new URL("./local-draft.ps1",import.meta.url));
    const child=execFile("powershell.exe",["-NoProfile","-NonInteractive","-STA","-File",script],{
      windowsHide:true,timeout:22000,encoding:"utf8"
    },(error,stdout)=>{
      if(error){reject(error);return}
      try{resolve(JSON.parse(stdout))}catch(problem){reject(problem)}
    });
    child.stdin.on("error",reject);
    child.stdin.end(JSON.stringify(draft),"utf8");
  });
}
