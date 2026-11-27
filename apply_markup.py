"""Apply the annotation changes to a staging copy of the pinned plugin package."""
from pathlib import Path
from shutil import copy2
import sys

source = Path(__file__).resolve().parent / "src"
root = Path(sys.argv[1]).resolve()
if not (root / ".codex-plugin" / "plugin.json").is_file():
    raise SystemExit("Expected an upstream Codex Design plugin package directory.")

def patch(name,anchor,insert,previous=None):
    file=root/name
    text=file.read_bytes()
    ending=b'\r\n' if b'\r\n' in text else b'\n'
    def encode(s): return s.encode().replace(b'\n',ending)
    if encode(insert) in text: return
    if previous and encode(previous) in text: anchor=previous
    assert text.count(encode(anchor))==1,name
    file.write_bytes(text.replace(encode(anchor),encode(insert)))

copy2(source/'markup.js',root/'web/assets/local-markup.js')
copy2(source/'capture.js',root/'web/assets/local-capture.js')
copy2(source/'markup.css',root/'web/assets/local-markup.css')
copy2(source/'server.mjs',root/'dist/local-markup.mjs')
copy2(source/'draft.mjs',root/'dist/local-draft.mjs')
copy2(source/'draft.ps1',root/'dist/local-draft.ps1')
bridge='j.useEffect(()=>{K(!0)},[K])'
patch('web/assets/index-CzTzwGnc.js',bridge,'''j.useEffect(()=>{function markBridge(event){const op=event.detail;if(op.type==="selection")op.receive(os());if(op.type==="clear")Ta(null);if(op.type==="focus"){const node=c.getNode(op.id);if(node){const w=node.measured?.width||node.data?.width||400,h=node.measured?.height||node.data?.height||400;c.setCenter(node.position.x+w*op.x/1000,node.position.y+h*op.y/1000,{zoom:Math.max(.5,Math.min(1,c.getZoom())),duration:0})}}}window.addEventListener("codexdesign:markup",markBridge);return ()=>window.removeEventListener("codexdesign:markup",markBridge)},[c]),'''+bridge)
patch('web/index.html','  </head>','    <link rel="stylesheet" href="/assets/local-markup.css">\n    <script type="module" src="/assets/local-markup.js"></script>\n  </head>')
anchor='app.get(\n  "/api/plan",'
old_daemon='const { registerMarkup } = await import("./local-markup.mjs");\nregisterMarkup(app, { z: external_exports, loadProject, projectPath, readJson, atomicJson, serial, HttpError });\n'+anchor
patch('dist/daemon.mjs',anchor,old_daemon.replace('loadProject, projectPath','loadProject, listProjects, projectPath'),previous=old_daemon)
anchor='server.registerTool(\n  "list_canvas_projects",'
patch('dist/mcp.mjs',anchor,'''server.registerTool(
  "list_canvas_annotations",
  {
    description: "Read saved brush and shape annotations on this canvas, including notes, asset path, node id, HTML target and points on a normalized 0–1000 coordinate grid. Arrow tips are the last point.",
    inputSchema: { projectId },
    annotations: readAnnotations
  },
  handler(async ({ projectId: id }) => request(await ensureDaemon(), "/api/projects/" + encodeURIComponent(id) + "/annotations"))
);
'''+anchor)
anchor='## Runtime errors'
binding_anchor='server.registerTool(\n  "open_canvas",'
patch('dist/mcp.mjs',binding_anchor,'''server.registerTool(
  "bind_canvas_chat",
  {
    description: "Bind a canvas to an existing local Codex conversation so its annotation drafts return there. Use on user request with the actual thread ID.",
    inputSchema: { projectId, threadId: external_exports.string().uuid() },
    annotations: writeAnnotations
  },
  handler(async ({ projectId: id, threadId }) => {
    const { projectPath } = await request(await ensureDaemon(), "/api/projects/" + encodeURIComponent(id));
    const { bindCanvasChat } = await import("./local-markup.mjs");
    return bindCanvasChat(projectPath,threadId);
  })
);
'''+binding_anchor)
tool_anchor='server.registerTool(\n  "list_canvas_annotations",'
old_handoff_tool='''server.registerTool(
  "read_annotation_handoff",
  {
    description: "Read the exact annotations a user submitted from Codex Design. The snapshot includes notes, geometry, target elements and project-relative assets.",
    inputSchema: { projectId, handoffId: external_exports.string().regex(/^[0-9a-f]{64}$/) },
    annotations: readAnnotations
  },
  handler(async ({ projectId: id, handoffId }) => request(await ensureDaemon(), "/api/projects/" + encodeURIComponent(id) + "/annotations/handoffs/" + handoffId))
);
'''+tool_anchor
patch('dist/mcp.mjs',tool_anchor,'''server.registerTool(
  "read_annotation_handoff",
  {
    description: "Read a frozen annotation submission from the 12-character handoff reference shown in the chat or its full ID. Optionally supply projectId to limit the lookup. Returns numbered issues, screenshots, geometry and DOM targets.",
    inputSchema: { projectId: projectId.optional().describe("Optional canvas project ID"), handoffId: external_exports.string().regex(/^[0-9a-f]{12}(?:[0-9a-f]{52})?$/) },
    annotations: readAnnotations
  },
  handler(async ({ projectId: id, handoffId }) => request(await ensureDaemon(), id
    ? "/api/projects/" + encodeURIComponent(id) + "/annotations/handoffs/" + handoffId
    : "/api/annotation-handoffs/" + handoffId))
);
'''+tool_anchor,previous=old_handoff_tool)
patch('skills/ui-design-canvas/SKILL.md',anchor,'''## Canvas markups

When the user asks to apply annotations, read `list_canvas_annotations` for the current project. Each saved pen, rectangle, ellipse or arrow is attached to a node and its asset, with points in a 0–1000 viewport coordinate grid. Arrow tips use the last point. Read the note and optional DOM selector, check the current HTML, then make the requested scoped change. If the current chat predates installation of this tool, read annotations.json from the projectPath returned by open_canvas. An absent annotations.json means no saved annotations.

'''+anchor)
native_hook='j.useEffect(()=>{function markBridge(event){'
patch('web/assets/index-CzTzwGnc.js',native_hook,'''j.useEffect(()=>{function inspectMark(event){const op=event.detail;if(op.type==="inspect"&&op.element?.isConnected)Ta({nodeId:op.id,assetPath:op.assetPath,element:op.element})}window.addEventListener("codexdesign:markup",inspectMark);return ()=>window.removeEventListener("codexdesign:markup",inspectMark)},[]),'''+native_hook)
handoff_anchor='server.registerTool(\n  "read_annotation_handoff",'
patch('dist/mcp.mjs',handoff_anchor,r'''server.registerTool(
  "read_annotation_screenshot",
  {
    description: "Read one numbered canvas screenshot as an image with its matching issue numbers and notes.",
    inputSchema: { projectId, handoffId: external_exports.string().regex(/^[0-9a-f]{64}$/), page: external_exports.number().int().min(1).max(500) },
    annotations: readAnnotations
  },
  async ({ projectId: id, handoffId, page }) => {
    try {
      const shot = await request(await ensureDaemon(), "/api/projects/" + encodeURIComponent(id) + "/annotations/handoffs/" + handoffId + "/images/" + page + "?format=mcp");
      const notes = shot.issues.map(issue => "#" + issue.number + " " + issue.note);
      return { content: [{ type: "text", text: [shot.title, ...notes].join("\n") }, { type: "image", mimeType: "image/webp", data: shot.data }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: String(error.message || error) }] };
    }
  }
);
'''+handoff_anchor)
old_handoff_help='''For a numbered annotation submission, read the frozen `read_annotation_handoff` and use `read_annotation_screenshot` for each page in its images list. Match the pin number to its note and DOM target. Older submissions can have no images.

## Canvas markups'''
patch('skills/ui-design-canvas/SKILL.md','## Canvas markups','''A draft with “批注记录” provides a 12-character record code. Pass the code as handoffId to `read_annotation_handoff`, then use the returned full project and handoff IDs with `read_annotation_screenshot`. If the current chat still has the older MCP schema, retrieve the snapshot at /api/annotation-handoffs/<code> on the local canvas origin. Follow the written notes by pin number. Pins without notes are location markers.

## Canvas markups''',previous=old_handoff_help)
