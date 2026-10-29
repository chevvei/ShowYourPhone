#!/usr/bin/env python3
# iPhone Duo · 单文件打包
# 产物：dist/iphoneDuo.html —— three.js(ESM) + OrbitControls 以 data: URL 进 importmap，
# 本地 textures/geo/model/main 合并为一个内联 module，CSS 内联。
# 双击即可用（现代 Chrome / Edge / Firefox，file:// 或 http:// 均可）。
#
# 工程套路：
# 1) data: URL 模块没有 base path，模块间相对 import ('./xxx.js') 无法解析 →
#    所以本地模块必须"文本合并"；而 three 官方 ESM 有巨型 export 块，改写易错 →
#    原样封进 data URL 走 importmap，bare specifier 'three' 照常解析，两全其美。
# 2) 合并时逐文件删除 import 行、剥掉 export 前缀，唯一需要重建的跨模块引用
#    是 model.js 的 `import * as TX from './textures.js'` → 用导出名列表构造 TX 对象。
import argparse
import base64
import json
import posixpath
import re
import pathlib
import secrets

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "dist" / "iphoneDuo.html"


def strip_imports(src, keep=None):
    """删除模块文件里的全部 import 声明（含多行 named-import 块）。
    keep(specifier) 返回 True 的语句保留（如需走 importmap 的 three/addons 插件）。"""
    out, i, lines = [], 0, src.split("\n")
    while i < len(lines):
        if re.match(r"^import\b", lines[i]):
            stmt = [lines[i]]
            # 收集到语句结束（块尾的 } from '...'; 或单行 ... from '...';，允许行尾注释）
            while i < len(lines) and not re.search(r"from\s*['\"].*['\"]\s*;?\s*(//.*)?$", lines[i]):
                i += 1
                if i < len(lines):
                    stmt.append(lines[i])
            m = re.search(r"from\s*['\"]([^'\"]+)['\"]", "\n".join(stmt))
            if m and keep and keep(m.group(1)):
                out.extend(stmt)
            i += 1
            continue
        out.append(lines[i])
        i += 1
    return "\n".join(out)


def strip_exports(src):
    """剥掉顶层 `export [async] function/const/let/class` 前缀（名字保留在同作用域）。"""
    return re.sub(r"^export\s+(?=(async\s+)?(function|const|let|class)\b)", "", src, flags=re.M)


def tex_exports(src):
    return re.findall(r"^export\s+function\s+(\w+)", src, flags=re.M)


def data_url(js):
    return "data:text/javascript;base64," + base64.b64encode(js.encode()).decode()


def bundle_addons(entries):
    """把 examples/jsm 插件链打成 data-URL importmap。
    相对导入（'./Pass.js'）在 data URL 模块里无法解析 → 重写成 'three/addons/...' 裸键，
    传递依赖自动递归收集。返回 {importmap 键: data URL}。"""
    jsm = ROOT / "node_modules" / "three" / "examples" / "jsm"
    seen, mapping = set(), {}

    def key(rel):
        return f"three/addons/{rel}"

    def visit(rel):
        if rel in seen:
            return
        seen.add(rel)
        js = (jsm / rel).read_text()
        deps = [
            posixpath.normpath(posixpath.join(posixpath.dirname(rel), m.group(1)))
            for m in re.finditer(r"from\s*'(\.[^']+)'", js)
        ]
        js = re.sub(
            r"from\s*'(\.[^']+)'",
            lambda m: "from '%s'" % key(posixpath.normpath(
                posixpath.join(posixpath.dirname(rel), m.group(1)))),
            js,
        )
        mapping[key(rel)] = data_url(js)
        for d in deps:
            visit(d)

    for e in entries:
        visit(e)
    return mapping


def build():
    ap = argparse.ArgumentParser(description="iPhone Duo 单文件打包")
    ap.add_argument("--config", default="iphoneDuo-custom.json",
                    help="发布者配置 JSON（页面里「导出配置」产出，含照片 dataURL）；存在即嵌入 HTML")
    ap.add_argument("--code", default=None,
                    help="sharecode（默认自动生成）；额外产出 dist/share/<code>.json，链接 ?sharecode=<code> 可加载")
    args = ap.parse_args()

    css = (ROOT / "css" / "style.css").read_text()
    three = (ROOT / "node_modules" / "three" / "build" / "three.module.js").read_text()
    orbit = (ROOT / "node_modules" / "three" / "examples" / "jsm" / "controls" / "OrbitControls.js").read_text()

    # ---- 合并本地模块：textures → TX 对象 → geo → eggs → model → main ----
    tex = strip_exports(strip_imports((ROOT / "js" / "textures.js").read_text()))
    tx_names = tex_exports((ROOT / "js" / "textures.js").read_text())
    geo = strip_exports(strip_imports((ROOT / "js" / "geo.js").read_text()))
    eggs = strip_exports(strip_imports((ROOT / "js" / "eggs.js").read_text()))
    sfx = strip_exports(strip_imports((ROOT / "js" / "sfx.js").read_text()))
    mic = strip_exports(strip_imports((ROOT / "js" / "micro.js").read_text()))
    # 部件小游戏四件套：离子塔防 / 点阵射击 / 声波冲浪 / 磁力迷阵（互相独立，仅依赖 three）
    tur = strip_exports(strip_imports((ROOT / "js" / "turret.js").read_text()))
    sht = strip_exports(strip_imports((ROOT / "js" / "shoot.js").read_text()))
    wav = strip_exports(strip_imports((ROOT / "js" / "wave.js").read_text()))
    maz = strip_exports(strip_imports((ROOT / "js" / "maze.js").read_text()))
    mod = strip_exports(strip_imports((ROOT / "js" / "model.js").read_text()))
    # main 里的 postprocessing 导入保留（走 importmap data URL），其余（three / 本地模块）删除
    main = strip_imports(
        (ROOT / "js" / "main.js").read_text(),
        keep=lambda s: s.startswith("three/addons/postprocessing/"),
    )

    tx_obj = "const TX = { " + ", ".join(tx_names) + " };\n"
    merged = (
        "import * as THREE from 'three';\n"
        "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';\n\n"
        + tex + "\n" + tx_obj + "\n" + geo + "\n" + eggs + "\n" + sfx + "\n" + mic
        + "\n" + tur + "\n" + sht + "\n" + wav + "\n" + maz + "\n" + mod + "\n" + main
    )

    importmap = {
        "imports": {
            "three": data_url(three),
            "three/addons/controls/OrbitControls.js": data_url(orbit),
            # Bloom 后处理插件链（相对导入重写为裸键，依赖自动递归收集）
            **bundle_addons([
                "postprocessing/EffectComposer.js",
                "postprocessing/RenderPass.js",
                "postprocessing/UnrealBloomPass.js",
                "postprocessing/OutputPass.js",
            ]),
        }
    }

    html = (ROOT / "index.html").read_text()
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css" />',
        "<style>\n" + css + "\n</style>",
    )
    html = re.sub(
        r'<script type="importmap">[\s\S]*?</script>',
        '<script type="importmap">\n' + json.dumps(importmap) + "\n</script>",
        html,
        count=1,
    )
    html = html.replace(
        '<script type="module" src="js/main.js"></script>',
        '<script type="module">\n' + merged + "\n</script>",
    )

    # ---- 发布者默认配置：嵌入 HTML（照片随发布）+ 生成 sharecode 文件 ----
    cfg_path = ROOT / args.config
    cfg = None
    if cfg_path.exists():
        cfg = json.loads(cfg_path.read_text())
        # JSON 内嵌 <script> 时 '</' 可能截断标签，'\/' 是 JSON 合法转义（等价 '/'）
        safe = json.dumps(cfg, ensure_ascii=False).replace("</", "<\\/")
        html = html.replace(
            '<script type="application/json" id="defaultConfig">{}</script>',
            '<script type="application/json" id="defaultConfig">' + safe + "</script>",
        )
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html)
    size = OUT.stat().st_size / 1024 / 1024
    print(f"OK  {OUT}  ({size:.2f} MB, TX exports: {len(tx_names)})")

    if cfg:
        code = args.code or secrets.token_hex(3).upper()   # 6 位随机码
        share = OUT.parent / "share" / f"{code}.json"
        share.parent.mkdir(exist_ok=True)
        share.write_text(json.dumps(cfg, ensure_ascii=False))
        n_img = len(cfg.get("imgsO", [])) + len(cfg.get("imgsI", []))
        print(f"     内置默认配置：{args.config}（{n_img} 张照片，打开即显示）")
        print(f"     sharecode 文件：{share}")
        print(f"     分享链接（部署后）：https://<你的域名>/iphoneDuo.html?sharecode={code}")
        print("     部署：把 dist/ 整个目录拖进 Netlify Drop / GitHub Pages，或")
        print("           python3 -m http.server 8000 --directory dist 内网演示")
    else:
        print(f"     未找到 {args.config} —— 不嵌入默认配置（如需照片随发布，先在页面「⤓ 导出配置」）")


if __name__ == "__main__":
    build()
