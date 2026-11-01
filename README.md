# Smart Tab Pin

为 Obsidian 提供双击固定标签、编辑 Markdown / Excalidraw 时自动固定，以及跳转到已有固定标签的功能。使用 Obsidian 原生 Pin，无需配置。

Double-click to pin tabs, automatically pin Markdown and Excalidraw tabs as you edit, and reuse existing pinned tabs in Obsidian.

## 功能与使用

| 操作 | 效果 |
| --- | --- |
| 双击文件标签的标题、图标或空白处 | 固定 / 取消固定该标签 |
| 点击固定标签上的 × | 直接关闭该标签，无需先取消固定 |
| 在左侧文件列表中双击文件 | 打开并固定；已经固定的文件保持固定 |
| 在左侧文件列表中单击已经固定的文件 | 跳转到已有标签，避免重复打开 |
| 编辑 Markdown 内容 | 自动固定对应标签；手动取消后，下次编辑会再次固定 |
| 在 Excalidraw 中完成内容修改 | 自动固定当前绘图标签；仅浏览不会固定 |
| 单击其他文件，且当前标签未固定 | 保持 Obsidian 原生的标签替换行为 |

左侧文件列表支持 Obsidian 原生文件列表和 [Notebook Navigator](https://github.com/johansan/notebook-navigator)。Notebook Navigator 是可选插件，无需安装也能使用 Smart Tab Pin。

例如：单击笔记 A 进行浏览，再单击 B 时沿用原生替换行为；开始编辑 B 后，B 自动固定，此后打开 C 时 B 会保留。想主动保留一个 PDF 或图片，也可以直接双击它的标签。

## Excalidraw 支持

Excalidraw 是可选依赖。支持在当前绘图标签中完成画线、新建、移动、缩放、删除元素、修改文字或样式，以及撤销/重做后自动固定。插入图片或公式在提交为可撤销的元素变更时也会触发。取消固定后，下一次完成修改会再次固定。

仅打开绘图、选择元素、平移画布、缩放视野或切换工具不会自动固定。笔画和拖动在提交时（通常为松开鼠标/笔）固定。初始加载和常规外部同步产生的临时变更不触发。

通过 `excalidrawAPI.onIncrement` 独立订阅可撤销变更，不接管现有脚本钩子。缺少此接口的旧版本不会启用绘图自动固定，其他功能继续可用。此处按提交类型识别修改，而非用户输入来源；脚本若在当前绘图中提交可撤销变更，也会触发固定。

## 固定标签的关闭按钮

主编辑区的固定标签同时显示固定图标和原生 × 关闭按钮。点击固定图标取消固定，点击 × 直接关闭；双击标题仍切换固定状态。插件样式恢复被隐藏的原生关闭按钮，不修改关闭流程、快捷键或侧边栏标签。禁用插件会恢复默认显示。

## 安装

要求：**Obsidian 桌面端 1.5.7 或更高版本**。

1. 前往 [Releases](https://github.com/xgrfffff/smart-tab-pin/releases/latest)，下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在你的 Obsidian 仓库中创建 `.obsidian/plugins/smart-tab-pin/`，把三个文件放进去：

   ```text
   你的仓库/
   └── .obsidian/
       └── plugins/
           └── smart-tab-pin/
               ├── main.js
               ├── manifest.json
               └── styles.css
   ```

3. 重启 Obsidian，在「设置 → 第三方插件」中启用 **Smart Tab Pin**。若受限模式开启，需先关闭。

插件没有设置页，启用后即可使用。无需 npm 或构建步骤；`styles.css` 随插件自动加载。

更新时，用新版本的三个文件替换原文件，再禁用并重新启用插件，或重启 Obsidian。

## 行为说明

- **自动固定的范围**：Markdown 实时预览和源码模式，以及上述 Excalidraw 可撤销内容修改。Markdown 中的输入（含中文输入法）、删除、剪切、粘贴、拖动文本、撤销和重做等实际改变内容的操作会触发。
- **不会触发自动固定**：仅打开文件、移动光标、选中文本或常规外部同步；阅读模式下的复选框、属性面板、Canvas 编辑，以及 Markdown 中第三方插件未标记为用户操作的程序修改也不在自动固定范围内。
- **双击标签的范围**：Markdown、PDF、Canvas、图片等文件标签，支持分屏和弹出窗口。不处理侧边栏面板标签、关闭按钮或固定图标等状态按钮。
- **修饰键**：Ctrl / Cmd / Shift / Alt 点击保留原有行为，带这些修饰键的双击也不切换固定。
- **多个固定副本**：单击左侧文件时，优先跳转到当前标签，其次是同窗口内的固定副本。
- **原生固定规则**：固定笔记中的内部链接在其他标签打开；关联视图（linked views）沿用 Obsidian 自身的联动固定规则。
- **状态保存**：插件启动时不改变已有固定状态；禁用插件也不会取消已有固定。布局保存和恢复由 Obsidian 负责。

## 兼容性与反馈

作者已在自己的 Obsidian 桌面环境中长期日常使用。最低版本声明为 1.5.7，不代表已逐一测试所有版本、主题及第三方插件组合。

插件通过 Obsidian 原生接口固定标签，通过 CodeMirror 识别用户编辑。标签及文件列表定位也依赖 Obsidian 和 Notebook Navigator 的界面结构；这些应用更新后可能需要适配。

遇到问题可在 [Issues](https://github.com/xgrfffff/smart-tab-pin/issues) 中提供 Obsidian 版本、操作系统、复现步骤，以及是否使用 Notebook Navigator。

## 验证

运行 `node --test` 执行模拟 Obsidian/Excalidraw 事件的回归测试，无需安装依赖。它覆盖自动固定、忽略浏览/临时变更、延迟加载、视图替换、卸载清理与既有 Markdown/双击行为。

Excalidraw 对接依据为插件 2.29.0 及其画布 `onIncrement` 接口；加载保护依赖视图的 `_loaded` / `semaphores` 状态，未来更新可能需要适配。关闭按钮样式已在 Obsidian 1.14.5 / Obsidian Nord 主题下确认显示。模拟测试不替代真实界面验收，仍需检查绘画、公式插入、撤销/重做、关闭及弹出窗口等交互。

## 源码

`main.js` 即完整 JavaScript 源码，运行时使用 Obsidian 提供的模块，无需构建。`manifest.json` 保存插件信息，`versions.json` 记录插件版本与最低 Obsidian 版本的对应关系。

接口参考：[Obsidian API](https://github.com/obsidianmd/obsidian-api)、[CodeMirror 用户操作标记](https://github.com/codemirror/state/blob/main/src/transaction.ts)。
