# AI 编码规范 · AI Coding Standard

> 本文档约束 AI 助手在本仓库的一切改动。每次任务先读本文档，做完必须验证，提交必须用双语格式。
> This document governs all AI-assisted changes in this repo. Read before coding, verify after coding, commit bilingually.

## 1. 项目架构 · Architecture

```
js/textures.js   锁屏/照片 App 状态机 + CanvasTexture 生成（纯函数，无 Three 依赖）
js/geo.js        roundedGrid 圆角平面几何生成
js/eggs.js       彩蛋注册表 + localStorage 持久化
js/sfx.js        WebAudio 实时合成音效引擎（零音频资源、零网络请求）
js/model.js      3D 部件装配 + 爆炸位移曲线 + partK 部件级覆盖
js/main.js       交互编排、面板/玩法/物理/相机、boot 流程（唯一入口）
build.py         把上述模块按依赖序合并 + three.js 以 data URL 注入 importmap
test/*.mjs       Puppeteer e2e（smoke/egg/label/photo/shot/fun）
```

**铁律 · Iron rules**

- 最终产物是**单文件** `iphoneDuo.html`：新增 js 文件必须同步挂进 `build.py` 合并序列。
- 不引入任何运行时网络请求（three、纹理、音效全部内联/合成）。
- 不引入新的 npm 运行时依赖（puppeteer-core 为 devDependency 例外）。
- UI 入口三件套：`index.html` 结构 + `css/style.css` 样式 + `js/main.js` 逻辑，缺一不可。
- localStorage 键统一 `iphoneDuo.*` 前缀。

## 2. 代码风格 · Code Style

- **语言**：代码与注释用中文注释解释「为什么」，标识符用英文；用户可见文案用简体中文。
- **克制**：短促、就地、不过度抽象。三行相似代码好过一个过早的抽象。不加防御性代码兜不可能发生的分支。
- **音效**：任何新交互要手感就调 `sfx('tick|ui|snap|hinge|thud|shutter|pop|boot|whoosh|right|wrong|win')`，禁止加载音频文件。
- **状态**：玩法状态一律挂模块级对象（如 `quiz`、`asm`、`phys`），`switchDevice` 时必须清理（见 main.js 的清理段）。
- **定时器**：`setTimeout` 持久玩法的定时器必须存句柄（如 `quiz.t`）并在退出路径 `clearTimeout`，防止泄漏飞相机。
- **CSS**：玻璃态面板复用既有 `.panel`/`.dock` 风格变量（`--acc` 等），移动端断点同步覆盖。

## 3. 验证流程 · Verification（每次做完必须全跑）

```bash
# 1. 语法
node --check js/main.js && node --check js/<新文件>.js

# 2. 重新打包（改了 js/ 后必跑）
python3 build.py

# 3. 本地起服务（若未起）
python3 -m http.server 8124 &

# 4. e2e —— 新特性写进对应测试或新建 test/<feature>.mjs
node test/smoke.mjs        # 冒烟
node test/fun.mjs          # 可玩性全量（含新特性）
node test/label.mjs        # 标注回归
node test/egg.mjs          # 彩蛋回归
node test/photo.mjs        # 照片墙回归
node test/shot.mjs duo p18s p18 p18m   # 四设备截图
```

**通过标准**：全绿 + 全程无 pageerror。截图存 `/tmp/*.png` 供人工核对，不入库。
**测试脚本纪律**：诊断用的临时脚本命名 `_diag*.mjs`，问题定位后**必须删除**，不留库。

## 4. 提交信息规范 · Commit Message（双语 · Bilingual）

每次提交必须同时给出英文与中文，格式：

```
<type>(<scope>): <english subject> / <中文主题>

【EN】
- english bullet point
- english bullet point

【中文】
- 中文小点
- 中文小点
```

- `<type>`：`feat` / `fix` / `test` / `docs` / `chore` / `refactor`
- 主题行控制在 72 字符内（中英合计），正文小点每条一行，先英后中，一一对应。
- 一次提交只做一件事：特性、修复、测试、文档不混提。

**示例 · Example**

```
feat(xray): add X-ray vision mode / 新增X光透视模式

【EN】
- Add dock toggle swapping shell materials to fresnel ghost shader
- Inner boards/battery/camera glow through translucent housing
- e2e: toggle on/off, assert no pageerror, cleanup on switchDevice

【中文】
- 控制坞新增X光开关，外壳材质切换为菲涅尔幽灵着色器
- 主板/电池/摄像头在半透明机身内发光可见
- e2e：开关切换断言、无页面错误、切设备时清理状态
```

## 5. 禁止事项 · Prohibited

- ❌ 未经用户明确要求创建 README/文档类文件（本文档为用户明确要求）。
- ❌ 提交含密钥、`node_modules`、`/tmp` 截图的文件。
- ❌ `git push --force`、改 git config、跳过验证直接提交。
- ❌ 在 e2e 里用 `sleep` 盲等替代 `waitForFunction` 轮询断言（竞态来源）。
- ❌ 引入物理引擎/音频文件/外部 CDN 破坏单文件自包含。

## 6. 排查套路 · Debug Playbook

1. 复现并最小化：临时 `_diag<N>.mjs` 分层二分（干净页面 → 前置链 → 疑点）。
2. 挂 `page.on('pageerror')` 收集运行时错误，先看控制台再猜代码。
3. 怀疑测试脚本本身：核对探针字段的真实类型（如 `__fun().rec` 是布尔不是对象）。
4. 疑似竞态：找出所有定时器/自动启动路径（keynote、quizNext 的 setTimeout）。
5. 定位后删除 `_diag` 脚本，把结论沉淀进正式测试断言。
