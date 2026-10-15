#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""make_unit.py — 从 LimbusArchive 的本地 API 取边狱人格的逐帧精灵，生成卫戍协议能用的 Spine 骨架。

流水线：
    GET /api/frames?id=<人格ID>            → 帧组清单（每帧带 bundle/pid/w/h/px/py/ppu）
    GET /api/object?bundle=&pid=           → 该帧 PNG
    → 拼图集页 → 写 <name>.png / <name>.atlas
    → 写 Spine JSON（region attachment + attachment timeline）
    → 打印 data/assets.json 要用的 spine 条目

用法：
    python tools/limbus/make_unit.py --id 10104 --char char_limbus_yisang \
        --api http://127.0.0.1:47821 --mod mods/limbus-company

帧组 → 动画的映射（自动）：
    Poses 组里的 idle/dmg/gud/dead/miss → 各自的姿态动画
    …_S1 / …_S2 / …_S3                   → attack1 / attack2 / attack3（逐帧）
    其余 …                                → 同名动画
"""
import argparse, json, os, sys, urllib.request, io, re

try:                                    # Windows 控制台默认 GBK，中文/符号会炸
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：pip install pillow")

PAGE_MAX = 4096          # 图集单页边长上限
PAD = 2                  # region 之间的间隔
FPS = 12.0               # 逐帧动画的帧率（与 LimbusArchive 默认一致）
SPINE_VERSION = "3.8.99"


# ---------------------------------------------------------------- 取帧
def api_json(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def api_bytes(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def fetch_frames(api, identity_id):
    d = api_json(f"{api}/api/frames?id={identity_id}")
    groups = d.get("groups") or []
    if not groups:
        sys.exit(f"API 没有返回任何帧组（id={identity_id}）")
    out = []
    for g in groups:
        frames = []
        for f in g.get("frames") or []:
            url = f"{api}/api/object?bundle={f['bundle']}&pid={f['pid']}"
            raw = api_bytes(url)
            im = Image.open(io.BytesIO(raw)).convert("RGBA")
            frames.append({
                "name": f["name"], "img": im,
                "w": im.width, "h": im.height,
                "mw": float(f.get("w") or im.width), "mh": float(f.get("h") or im.height),
                "px": float(f.get("px") or 0.0), "py": float(f.get("py") or 0.0),
            })
        out.append({"group": g["name"], "frames": frames})
    return out


# ---------------------------------------------------------------- 拼图集
def pack_pages(frames):
    """shelf packing：把所有帧摆进若干 PAGE_MAX 见方的页面。返回 (pages, placed)。"""
    order = sorted(frames, key=lambda f: -f["h"])
    pages, placed = [], {}
    cur = {"w": PAGE_MAX, "h": 0, "x": 0, "y": 0, "row_h": 0, "items": []}
    pages.append(cur)
    for f in order:
        w, h = f["w"] + PAD, f["h"] + PAD
        if cur["x"] + w > PAGE_MAX:                       # 换行
            cur["x"] = 0
            cur["y"] += cur["row_h"]
            cur["row_h"] = 0
        if cur["y"] + h > PAGE_MAX:                       # 换页
            cur = {"w": PAGE_MAX, "h": 0, "x": 0, "y": 0, "row_h": 0, "items": []}
            pages.append(cur)
        cur["items"].append((f, cur["x"], cur["y"]))
        placed[f["name"]] = (pages.index(cur), cur["x"], cur["y"])
        cur["x"] += w
        cur["row_h"] = max(cur["row_h"], h)
        cur["h"] = max(cur["h"], cur["y"] + h)
    for p in pages:                                       # 收窄页高
        p["h"] = max(p["h"], 1)
    return pages, placed


def write_atlas(pages, placed, base, outdir):
    """写出 <base>_N.png 与 <base>.atlas。Spine 图集的 xy 以【左上角】为原点、向下为正。"""
    lines = []
    for i, p in enumerate(pages):
        im = Image.new("RGBA", (PAGE_MAX, p["h"]), (0, 0, 0, 0))
        for f, x, y in p["items"]:
            im.paste(f["img"], (x, y))
        page_name = f"{base}_{i}.png"
        im.save(os.path.join(outdir, page_name))
        # 按页写 atlas 段 —— 逐字段对齐仓库里已知能用的方舟图集
        # （public/assets/spine/enemy/enemy_10001_trslim/*.atlas：冒号后带空格、有 format 与 pma 行）
        lines.append(f"{page_name}")
        lines.append(f"size: {PAGE_MAX},{p['h']}")
        lines.append("format: RGBA8888")
        lines.append("filter: Linear,Linear")
        lines.append("repeat: none")
        lines.append("pma: false")
        for f, x, y in p["items"]:
            lines.append(f"{f['name']}")
            lines.append("  rotate: false")
            lines.append(f"  xy: {x}, {y}")
            lines.append(f"  size: {f['w']}, {f['h']}")
            lines.append(f"  orig: {f['w']}, {f['h']}")
            lines.append("  offset: 0, 0")
            lines.append("  index: -1")
        lines.append("")
    with open(os.path.join(outdir, f"{base}.atlas"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    return [f"{base}_{i}.png" for i in range(len(pages))]


# ---------------------------------------------------------------- 动画分组
def anim_name(group):
    """帧组名 → 动画名。"""
    if group == "Poses":
        return None                                        # 姿态单独处理
    for tag, name in (("_S1", "attack1"), ("_S2", "attack2"), ("_S3", "attack3"),
                      ("_Parrying_Timeline 1", "parry2"), ("_Parrying_Timeline", "parry")):
        if group.endswith(tag):
            return name
    return "anim"


def build_spine(groups, placed, atlas_pages, base):
    """生成 Spine 3.8 JSON（region attachment + attachment timeline）。"""
    poses = next((g for g in groups if g["group"] == "Poses"), None)
    all_frames = [f for g in groups for f in g["frames"]]

    # 每帧一个 region attachment：把帧里的脚底锚点摆到骨骼原点。
    #
    # 锚点约定（实测自 LimbusArchive）：
    #   * px / py 以【底边】为原点，但参考系是 app 加了边距的画布；
    #     元数据 w/h 比实际 PNG 大 78（每边 39），所以实际 PNG 里锚点 = px-padX / py-padY。
    #   * 实测 idle：图像内容最底行距底边 11px，py-39 = 11.4 ✓
    # Spine region 的 (x, y) 是【区域中心】相对骨骼的位置，y 轴向上。
    attach = {}
    for f in all_frames:
        pad_x = (f.get("mw", f["w"]) - f["w"]) / 2.0
        pad_y = (f.get("mh", f["h"]) - f["h"]) / 2.0
        ax, ay = f["px"] - pad_x, f["py"] - pad_y          # 锚点在【实际 PNG】里、距左/距底
        attach[f["name"]] = {
            "type": "region", "path": f["name"],
            "x": round(f["w"] / 2.0 - ax, 3),
            "y": round(f["h"] / 2.0 - ay, 3),
            "width": f["w"],
            "height": f["h"],
        }

    # Spine 3.8 JSON specification requires skins to be an array of skin objects:
    skins = [{"name": "default", "attachments": {"body": attach}}]

    def pose_anim(frame_name):
        return {"slots": {"body": {"attachment": [{"time": 0, "name": frame_name}]}}}

    def frame_anim(frames):
        keys = [{"time": round(i / FPS, 4), "name": f["name"]} for i, f in enumerate(frames)]
        return {"slots": {"body": {"attachment": keys}}}

    anims = {}
    default_attach = "idle"
    if poses:
        by = {f["name"]: f["name"] for f in poses["frames"]}
        # Poses 组逐帧映射（补上 move / evade；原来漏了）
        for slot, key in (("idle", "idle"), ("move", "move"), ("hit", "dmg"),
                          ("guard", "gud"), ("evade", "miss"), ("die", "dead")):
            if key in by:
                anims[slot] = pose_anim(by[key])
        if "idle" not in anims and poses["frames"]:
            default_attach = poses["frames"][0]["name"]
            anims["idle"] = pose_anim(default_attach)

    # 攻击：skill1/2/3 的帧可能分散在多个「*_Timeline N」组里（如 S2_Timeline 1 / S2_Timeline 3、
    # S3_Timeline 1/2/3）。按【帧名前缀】归桶、再按编号拼接成 attack1/2/3，别靠组名（组名各人格不一）。
    def _frnum(n):
        m = re.findall(r"(\d+)", n)
        return int(m[-1]) if m else 0
    buckets = {"attack1": [], "attack2": [], "attack3": [], "parry": []}
    for g in groups:
        if g["group"] == "Poses":
            continue
        gl = g["group"].lower()
        for f in g["frames"]:
            nm = f["name"].lower()
            if nm.startswith("skill1"):
                buckets["attack1"].append(f)
            elif nm.startswith("skill2"):
                buckets["attack2"].append(f)
            elif nm.startswith("skill3"):
                buckets["attack3"].append(f)
            elif "parry" in nm or "parry" in gl:
                buckets["parry"].append(f)
    for an, frames in buckets.items():
        if frames:
            anims[an] = frame_anim(sorted(frames, key=lambda f: _frnum(f["name"])))
    if not anims and all_frames:
        anims["idle"] = pose_anim(all_frames[0]["name"])

    # Arknights uppercase aliases for seamless engine compatibility
    if "idle" in anims:
        anims["Idle"] = anims["idle"]
        anims["Default"] = anims["idle"]
    if "attack1" in anims:
        anims["Attack"] = anims["attack1"]
        anims["Skill"] = anims["attack1"]
    if "die" in anims:
        anims["Die"] = anims["die"]

    # 骨架画布范围：取所有帧的包围盒（按脚底对齐后）
    xs, ys = [], []
    for f in all_frames:
        cx, cy = f["w"] / 2.0 - f["px"], f["h"] / 2.0 - f["py"]
        xs += [cx - f["w"] / 2.0, cx + f["w"] / 2.0]
        ys += [cy - f["h"] / 2.0, cy + f["h"] / 2.0]

    return {
        "skeleton": {
            "hash": "", "spine": SPINE_VERSION,
            "x": round(min(xs), 2), "y": round(min(ys), 2),
            "width": round(max(xs) - min(xs), 2), "height": round(max(ys) - min(ys), 2),
            "images": ".",
        },
        "bones": [{"name": "root"}],
        "slots": [{"name": "body", "bone": "root", "attachment": default_attach}],
        "skins": skins,
        "animations": anims,
    }, anims


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="人格 ID，如 10104")
    ap.add_argument("--char", required=True, help="mod 里的 charId，如 char_limbus_yisang")
    ap.add_argument("--api", default="http://127.0.0.1:47821")
    ap.add_argument("--mod", default="mods/limbus-company")
    ap.add_argument("--base", default=None, help="导出文件名（默认取 char 的后缀）")
    a = ap.parse_args()

    base = a.base or a.char.replace("char_limbus_", "")
    outdir = os.path.join(a.mod, "assets", "spine", "op", a.char, "front")
    os.makedirs(outdir, exist_ok=True)

    print(f"[1/4] 拉取帧 … ({a.api}/api/frames?id={a.id})")
    groups = fetch_frames(a.api, a.id)
    total = sum(len(g["frames"]) for g in groups)
    for g in groups:
        print(f"      {g['group']:<44} {len(g['frames']):>3} 帧")
    print(f"      合计 {total} 帧")

    # 同名帧会在多个帧组里重复出现（如 skill1_1 同时在 S1 与 Parrying_Timeline）——
    # Spine 图集的区域名必须唯一，所以按名去重，保留第一个。
    seen = {}
    for g in groups:
        for f in g["frames"]:
            seen.setdefault(f["name"], f)
    allf = list(seen.values())
    dup = sum(len(g["frames"]) for g in groups) - len(allf)
    if dup:
        print(f"      按名去重：{sum(len(g['frames']) for g in groups)} → {len(allf)} 帧（去掉 {dup} 个重名）")
    print("[2/4] 拼图集 …")
    pages, placed = pack_pages(allf)
    pngs = write_atlas(pages, placed, base, outdir)
    print(f"      {len(pngs)} 页: {', '.join(pngs)}")

    print("[3/4] 生成 Spine JSON …")
    sp, anims = build_spine(groups, placed, pngs, base)
    json_path = os.path.join(outdir, f"{base}.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(sp, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"      {json_path}")
    print(f"      动画: {', '.join(anims.keys())}")

    print("[4/4] 自洽校验 …")
    atlas_regions = set()
    for ln in open(os.path.join(outdir, f"{base}.atlas"), encoding="utf-8"):
        if ln and not ln[0].isspace() and ln.strip() and not ln.split(":")[0].strip() in (
                "size", "format", "filter", "repeat", "pma") and not ln.strip().endswith(".png"):
            atlas_regions.add(ln.strip())
    used = set()
    default_skin = next((s for s in sp["skins"] if s["name"] == "default"), sp["skins"][0])
    for slot_atts in default_skin["attachments"].values():
        for att in slot_atts.values():
            used.add(att.get("path") or "")
    missing = used - atlas_regions
    orphan = atlas_regions - used
    print(f"      atlas 区域 {len(atlas_regions)} 个 / 骨架引用 {len(used)} 个")
    if missing:
        sys.exit(f"      ✗ 骨架引用了不存在的区域: {sorted(missing)[:5]}")
    if orphan:
        print(f"      · 未被引用的区域 {len(orphan)} 个（正常，逐帧动画只用其中一部分）")
    print("      ✓ 区域名一一对应")

    print("[5/5] data/assets.json 的 spine 条目：")
    entry = {
        "front": {
            "skel": f"/assets/spine/op/{a.char}/front/{base}.json",
            "atlas": f"/assets/spine/op/{a.char}/front/{base}.atlas",
            "textures": [f"/assets/spine/op/{a.char}/front/{p}" for p in pngs],
            "pma": False,
            "anims": {
                "idle": "idle" if "idle" in anims else None,
                "deploy": None,
                "attack": {"begin": None, "loop": "attack1" if "attack1" in anims else None, "end": None},
                "attackDown": None,
                "skill": {"begin": None, "loop": "attack1", "end": None, "via": "attack", "index": 0, "idle": None},
                "die": "die" if "die" in anims else None,
                "move": None,
                "stun": "hit" if "hit" in anims else None,
                "skills": {
                    "0": {"begin": None, "loop": "attack1", "end": None, "via": "attack", "index": 0, "idle": None},
                    "1": {"begin": None, "loop": "attack2", "end": None, "via": "attack", "index": 1, "idle": None},
                    "2": {"begin": None, "loop": "attack3", "end": None, "via": "attack", "index": 2, "idle": None},
                },
            },
        }
    }
    efile = os.path.join(outdir, "assets_entry.json")
    with open(efile, "w", encoding="utf-8") as fh:
        json.dump({a.char: {"spine": entry}}, fh, ensure_ascii=False, indent=2)
    print(f"      已写到 {efile}（内容如下）")
    print(json.dumps({a.char: {"spine": entry}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
