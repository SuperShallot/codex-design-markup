import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { buildAnnotationDraft, openAnnotationDraft } from "./local-draft.mjs";

export async function bindCanvasChat(directory,threadId){
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(threadId))throw Error("对话编号无效");
  const target=join(directory,".annotation-chat.json");
  const temporary=target+"."+randomUUID()+".tmp";
  await writeFile(temporary,JSON.stringify({threadId}),{mode:0o600});
  await rename(temporary,target);
  return {threadId};
}

export function registerMarkup(app, { z, loadProject, listProjects, projectPath, readJson, atomicJson, serial, HttpError }) {
  const point = z.tuple([z.number().int().min(0).max(1000), z.number().int().min(0).max(1000)]);
  const ink = z.string().regex(/^#[0-9a-f]{6}$/i);
  const mark = z.object({
    id: z.string().uuid(),
    nodeId: z.string().min(1).max(256),
    kind: z.enum(["pin","pen","rect","ellipse","arrow"]),
    color: ink.optional(),
    origin: z.enum(["element","drawing"]).optional(),
    points: z.array(point).min(2).max(2048),
    note: z.string().max(1000),
    selector: z.string().max(512),
    elementText: z.string().max(128),
    viewport: z.tuple([z.number().positive().max(100000),z.number().positive().max(100000)])
  }).strict();
  const operation = z.discriminatedUnion("action", [
    z.object({action:z.literal("add"),mark}).strict(),
    z.object({action:z.literal("note"),id:z.string().uuid(),version:z.number().int(),note:z.string().max(1000),color:ink.optional()}).strict(),
    z.object({action:z.literal("remove"),id:z.string().uuid(),version:z.number().int()}).strict()
  ]);
  const route = "/api/projects/:id/annotations";
  const file = id => join(projectPath(id),"annotations.json");
  async function read(id) {
    try { const state=await readJson(file(id)); for(const mark of state.marks) mark.color??="#db4429"; return state; }
    catch (error) { if (error.code==="ENOENT") return {schemaVersion:1,revision:0,marks:[]}; throw error; }
  }
  function visibleState(state,canvas) {
    const nodeIds=new Set(canvas.nodes.map(node=>node.id));
    return {...state,marks:state.marks.filter(mark=>nodeIds.has(mark.nodeId))};
  }
  app.get(route,async (req,res)=>{
    const id=req.params.id;
    const {canvas}=await loadProject(id);
    res.json(visibleState(await read(id),canvas));
  });
  const submissions=id=>join(projectPath(id),".annotation-handoffs");
  const digest=z.string().regex(/^[0-9a-f]{64}$/);
  const handoffRef=z.string().regex(/^[0-9a-f]{12}(?:[0-9a-f]{52})?$/);
  const shotRef=z.object({nodeId:z.string().min(1).max(256),digest}).strict();
  const mediaPath=(id,hash)=>join(submissions(id),"media",digest.parse(hash)+".webp");
  async function readHandoff(reference,projectIds) {
    const exact=reference.length===64;
    if(exact&&projectIds.length===1)return readJson(join(submissions(projectIds[0]),reference+".json"));
    const matches=[];
    for(const id of projectIds){
      const directory=submissions(id);
      let files;
      try{files=await readdir(directory)}catch(error){if(error.code==="ENOENT")continue;throw error}
      for(const name of files){
        if(name.startsWith(reference)&&/^[0-9a-f]{64}\.json$/.test(name))matches.push(join(directory,name));
      }
    }
    if(matches.length===0)throw new HttpError(404,"找不到该批注记录。");
    if(matches.length>1)throw new HttpError(409,"批注记录编号重复，请指定画布或使用完整编号。");
    return readJson(matches[0]);
  }
  async function boundChat(id) {
    try {
      const binding=await readJson(join(projectPath(id),".annotation-chat.json"));
      return z.string().uuid().parse(binding.threadId);
    } catch(error) {
      if(error.code==="ENOENT")throw new HttpError(422,"此画布还没有绑定 Codex 对话。");
      throw error;
    }
  }
  app.post(route+"/captures",async(req,res)=>{
    const id=req.params.id;
    const {nodeId,revision,data}=z.object({
      nodeId:z.string().min(1).max(256),revision:z.number().int().nonnegative(),
      data:z.string().min(24).max(940000).regex(/^[A-Za-z0-9+/]+=*$/)
    }).strict().parse(req.body);
    const {canvas}=await loadProject(id);
    const state=visibleState(await read(id),canvas);
    if(revision!==state.revision||!state.marks.some(m=>m.nodeId===nodeId))throw new HttpError(409,"批注已变化，请重新提交");
    const bytes=Buffer.from(data,"base64");
    if(bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP"||bytes.readUInt32LE(4)!==bytes.length-8)throw new HttpError(400,"截图格式无效");
    const hash=createHash("sha256").update(bytes).digest("hex");
    const file=mediaPath(id,hash);
    await serial(file,async()=>{
      try{await access(file);return}catch(error){if(error.code!=="ENOENT")throw error}
      await mkdir(join(submissions(id),"media"),{recursive:true});
      const tmp=file+"."+randomUUID()+".tmp";await writeFile(tmp,bytes,{mode:0o600});await rename(tmp,file);
    });
    res.json({nodeId,digest:hash});
  });
  app.post(route+"/handoffs",async(req,res)=>{
    const id=req.params.id;
    const {revision,captures}=z.object({revision:z.number().int().nonnegative(),captures:z.array(shotRef).max(500).optional()}).strict().parse(req.body);
    const threadId=await boundChat(id);
    const snapshot=await serial("annotations:"+id,async()=>{
      const {canvas}=await loadProject(id);
      const state=visibleState(await read(id),canvas);
      if(!state.marks.length)throw new HttpError(400,"请先添加一条标注");
      if(state.revision!==revision)throw new HttpError(409,"标注刚刚有更新，请核对后重新打开草稿");
      const groups=[...new Set(state.marks.map(m=>m.nodeId))];
      const images=[];
      if(captures){
        if(captures.length!==groups.length)throw new HttpError(409,"画面已变化，请重新生成截图。");
        for(const nodeId of groups){
          const shot=captures.find(s=>s.nodeId===nodeId);
          if(!shot)throw new HttpError(409,"画面已变化，请重新生成截图。");
          await access(mediaPath(id,shot.digest));
          const issues=state.marks.flatMap((m,i)=>m.nodeId===nodeId?[{number:i+1,note:m.note||"未填写修改要求",markId:m.id}]:[]);
          images.push({...shot,page:images.length+1,title:state.marks.find(m=>m.nodeId===nodeId).title,issues});
        }
      }
      const key=createHash("sha256").update(JSON.stringify(images.length?{state,images}:state)).digest("hex");
      const filename=join(submissions(id),key+".json");
      try{await readJson(filename)}catch(error){
        if(error.code!=="ENOENT")throw error;
        await mkdir(submissions(id),{recursive:true});
        await atomicJson(filename,{projectId:id,handoffId:key,...state,images});
      }
      return {handoffId:key,count:state.marks.length,threadId,imageCount:images.length};
    });
    res.json(snapshot);
  });
  app.get(route+"/handoffs/:key",async(req,res)=>{
    res.json(await readHandoff(handoffRef.parse(req.params.key),[req.params.id]));
  });
  app.get("/api/annotation-handoffs/:reference",async(req,res)=>{
    const reference=handoffRef.parse(req.params.reference);
    res.json(await readHandoff(reference,(await listProjects()).map(project=>project.id)));
  });
  app.post(route+"/handoffs/:key/draft",async(req,res)=>{
    const id=req.params.id,key=digest.parse(req.params.key);
    const page=new URL(req.get("referer")||"about:blank");
    if(req.get("sec-fetch-site")!=="same-origin"||req.get("origin")!==page.origin||
        page.pathname!=="/"||page.searchParams.get("project")!==id){
      throw new HttpError(403,"请在当前画布的批注工具栏打开草稿。");
    }
    const threadId=await boundChat(id);
    const snapshot=await readJson(join(submissions(id),key+".json"));
    if(!snapshot.images?.length)throw new HttpError(422,"请重新生成带有编号的截图。");
    const directory=join(submissions(id),"attachments",key);
    const draft=await buildAnnotationDraft(threadId,snapshot,directory,hash=>mediaPath(id,hash));
    let result;
    try{result=await serial("codex-annotation-draft",()=>openAnnotationDraft(draft))}
    catch(error){
      console.error("Could not prefill annotation draft:",error.message);
      result={ready:false};
    }
    res.json({...result,threadId,fallbackUrl:draft.fallbackUrl});
  });
  app.get(route+"/handoffs/:key/images/:page",async(req,res)=>{
    const {id,key,page}=req.params;
    const snapshot=await readJson(join(submissions(id),digest.parse(key)+".json"));
    const image=snapshot.images?.find(i=>i.page===Number(page));
    if(!image)throw new HttpError(404,"这次提交没有该截图");
    const bytes=await readFile(mediaPath(id,image.digest));
    if(req.query.format==="mcp")return res.json({title:image.title,issues:image.issues,data:bytes.toString("base64")});
    res.type("image/webp").send(bytes);
  });
  app.post(route,async (req,res)=>{
    const id=req.params.id, op=operation.parse(req.body);
    const state=await serial("annotations:"+id,async ()=>{
      const {canvas}=await loadProject(id);
      const saved=await read(id);
      if(op.action==="add"){
        const node=canvas.nodes.find(n=>n.id===op.mark.nodeId);
        if(!node) throw new HttpError(404,"标注的画面已移除");
        const existing=saved.marks.find(m=>m.id===op.mark.id);
        if(existing) return visibleState(saved,canvas);
        if(visibleState(saved,canvas).marks.length>=500) throw new HttpError(400,"当前画布已有 500 条标注");
        saved.marks.push({...op.mark,color:op.mark.color||"#db4429",version:1,asset:node.data.path,title:node.data.title||node.id});
      }else{
        const i=saved.marks.findIndex(m=>m.id===op.id);
        if(i<0 && op.action==="remove") return visibleState(saved,canvas);
        if(i<0 || saved.marks[i].version!==op.version) throw new HttpError(409,"这条标注已在其他窗口更改，请重新选择后再编辑");
        if(op.action==="remove") saved.marks.splice(i,1);
        else {saved.marks[i].note=op.note; if(op.color) saved.marks[i].color=op.color; saved.marks[i].version++;}
      }
      saved.revision++;
      await atomicJson(file(id),saved);
      return visibleState(saved,canvas);
    });
    res.json(state);
  });
}
