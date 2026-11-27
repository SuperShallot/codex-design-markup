# Codex Design Markup

给 Codex Design 画布加上编号批注。可以在网页预览和图片上落点、画笔标注，或用矩形、椭圆和箭头指出具体位置。网页元素也能直接选取并保留定位信息。

- 标注可改色、编辑、删除，并按编号逐条定位。
- 每个有批注的画面生成一张截图，附件按「批注图 01.webp」依次命名。
- 截图和已填写的编号意见可放入原 Codex 对话的草稿。确认后由使用者手动发送。
- 草稿里的短记录号可以查回完整意见、截图及元素定位。

## Windows 安装

需要支持插件的 Codex 与 Codex CLI、Git、Python 3.10 或更新版本，以及 MCP 进程可调用的 Node.js 22.12 或更新版本。桌面草稿附件功能在 Windows Codex 桌面端验证。

```powershell
git clone https://github.com/SuperShallot/codex-design-markup.git
cd codex-design-markup
python build.py
codex plugin marketplace add ./build/marketplace
codex plugin add codex-design-markup@codex-design-markup-local
codex plugin list
```

构建脚本下载并校验上游 Codex Design 0.2.2 的固定提交，再在本地生成可安装的 marketplace。选择已解压的本地安装包时，可以从添加 marketplace 那一步开始，把路径换成解压目录。

安装后重启 Codex。Codex Design Markup 与上游插件使用同一项目存储和本地服务。建议在同一个 Codex 实例里只启用其中一个。

## 使用

在 Codex 中通过插件打开画布，并请 Codex 将画布绑定到你想使用的现有聊天。然后在画布工具栏点「标注」，选取网页元素或绘制标记，点编号填写意见。

点「在本对话确认批注」生成截图和草稿。若桌面端无法直接填入附件，画布会显示带截图引用的草稿入口。

## 源码与许可

`src/` 包含批注功能源码，`apply_markup.py` 把这些改造接入固定版本的上游插件。本仓库公开改造源码和构建脚本，上游预构建文件由构建脚本直接获取。

改造基于 Weixuan 的 [Codex Design](https://github.com/ummydev/codexdesign)。本项目使用 [GPL-3.0-only](./LICENSE)，变更与署名见 [NOTICE.md](./NOTICE.md)。
