#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""make_unit_clips.py — 用 LimbusArchive 的「战斗 clip」接口生成 Spine 骨架。

为什么比 make_unit.py（走 /api/frames）好：
  * clip 带**显式语义**：kind=pose/skill、label=Default/Move/Guard/Evade/Damaged/Dead/Skill N
  * **合成逻辑统一** —— 「一帧由多层部件叠成」和普通单图走同一条路
    （ops 里每个部件带 x/y/flip/alpha/sx/sy，照 app.js paintClip 的公式合成）
  * 每个 clip 自带 fps 与逐帧时长 d，动画节奏是真实的

流水线：
    GET /api/owner_clips?id=<人格ID>       → clip 列表（name/kind/label/n）
    GET /api/clip?bundle=&clip=&go=&all=0  → {fps, frames:[{d, ops:[[key,x,y,flip,a,sx,sy]]}], sprites}
    GET /api/object?bundle=&pid=           → 部件 PNG
    → 逐帧合成（每帧按自己的包围盒渲染）→ 拼图集 → 写 Spine JSON

用法：
    python tools/limbus/make_unit_clips.py --id 11216 --char char_limbus_gregor \
        --api http://127.0.0.1:47821 --mod mods/limbus-company
"""
import argparse, io, json, os, re, sys, urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from PIL import Image
from idle_breathing import breathing_bones  # 待机呼吸轨合成（同目录）

PAGE_MAX = 4096
PAD = 2
FPAD = 3          # 每帧图四周留白
SPINE_VERSION = "3.8.99"

POSE_MAP = {"default": "idle", "move": "move", "guard": "guard", "evade": "evade",
            "damaged": "hit", "hit": "hit", "dead": "die", "die": "die"}


# ---------------------------------------------------------------- 动画命名
def global_label(c):
    """clip → 目标动画名。同名前缀会归到一起（Skill 3.1 + 3.2 → attack3）。"""
    lab = (c.get("label") or "").strip()
    low = lab.lower()
    if low.endswith(" off") or low in ("add", "off"):
        return None                                    # 未装备/附属变体，跳过
    if c.get("kind") == "pose":
        if low.startswith("dead"):
            return "die"
        return POSE_MAP.get(low) or f"pose{c.get('n')}"
    if low.startswith("parrying"):
        return "parry"
    if low.startswith("reload"):
        return "reload"
    if low.startswith("start"):
        return "deploy"
    m = re.match(r"^skill\s*([0-9]+)", low)
    if m:
        return f"attack{m.group(1)}"
    m = re.match(r"^defen[cs]e\s*([0-9]+)", low)
    if m:
        return f"defense{m.group(1)}"
    if low.startswith("defen"):
        return "defense1"                              # "Defense · …" 无编号
    return f"clip{c.get('n')}"


# ---------------------------------------------------------------- 取 clip
def api_json(url):
    with urllib.request.urlopen(url, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def api_bytes(url):
    with urllib.request.urlopen(url, timeout=180) as r:
        return r.read()


def fetch_clips(api, identity_id):
    clips = [c for c in api_json(f"{api}/api/owner_clips?id={identity_id}") if c.get("own")]
    if not clips:
        sys.exit(f"该人格没有自己的 clip（id={identity_id}）")
    # 同一 label 常有「步行 / 骑乘」两套同名 clip（希斯克利夫 WHunt_S1 与 WHunt_Ride_S1，label 相同）。
    # 以前「只留第一套」会把骑乘(杜拉罕)版当成攻击动作；在步行战斗模型里这是错的 —— 改成**优先步行版**
    # （name 不含 Ride / Summon 的）。按首次出现的 label 顺序，保证动画命名稳定。
    order, by_label = [], {}
    for c in clips:
        if global_label(c) is None:                    # 未装备/附属变体，跳过
            continue
        lab = (c.get("label") or "").strip()
        if lab not in by_label:
            order.append(lab); by_label[lab] = []
        by_label[lab].append(c)

    def rank(c):
        nm = (c.get("name") or "").lower()
        return (("ride" in nm), ("summon" in nm))      # 非骑乘、非召唤排在前

    out = []
    for lab in order:
        c = sorted(by_label[lab], key=rank)[0]
        r = api_json(f"{api}/api/clip?bundle={c['bundle']}&clip={c['clip']}"
                     f"&go={c['animator_go']}&all=0")
        out.append({"name": c.get("name"), "kind": c.get("kind"), "n": c.get("n"),
                    "label": c.get("label"), "bundle": c["bundle"],
                    "fps": float(r.get("fps") or 60.0),
                    "frames": r.get("frames") or [], "sprites": r.get("sprites") or {}})
    return out


def sprite_img(api, cache, bundle, pid):
    k = f"{bundle}|{pid}"
    if k not in cache:
        cache[k] = Image.open(io.BytesIO(
            api_bytes(f"{api}/api/object?bundle={bundle}&pid={pid}"))).convert("RGBA")
    return cache[k]


LIMIT = 8192            # 坐标合理性上限：引擎用 ±64000 之类的哨兵值来隐藏部件


def op_rect(op, sp):
    """复刻 app.js paintClip: translate(x,y) → scale(±sx,sy) → drawImage(im,-px,-py)。
    返回 (left, top, right, bottom)（画布坐标，y 向下）；哨兵/离屏部件返回 None。"""
    key, x, y, flip, alpha, sx, sy = op
    if not sx or not sy or abs(x) > LIMIT or abs(y) > LIMIT:
        return None
    w, h = sp["w"] * sx, sp["h"] * sy
    px, py = sp["px"] * sx, sp["py"] * sy
    if w > LIMIT or h > LIMIT:
        return None
    left = x + px - w if flip else x - px
    top = y - py
    return left, top, left + w, top + h


def frame_bounds(ops, sprites):
    l = t = float("inf"); r = b = float("-inf")
    for op in ops:
        sp = sprites.get(op[0])
        if not sp:
            continue
        rect = op_rect(op, sp)
        if rect is None:
            continue
        a, c, d, e = rect
        l, t, r, b = min(l, a), min(t, c), max(r, d), max(b, e)
    return (l, t, r, b) if l < float("inf") else None


def render_frame(api, cache, bundle, sprites, ops, bounds):
    """每帧只按自己的包围盒渲染 —— 避免大挥砍把共用画布撑爆（donquixote 的 MemoryError）。"""
    l, t, r, b = bounds
    W = max(1, int(r - l) + 2 * FPAD)
    H = max(1, int(b - t) + 2 * FPAD)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for op in ops:
        sp = sprites.get(op[0])
        if not sp:
            continue
        rect = op_rect(op, sp)
        if rect is None:                     # 哨兵/离屏部件，跳过
            continue
        key, x, y, flip, alpha, sx, sy = op
        im = sprite_img(api, cache, sp.get("bundle", bundle), sp["pid"])
        im = im.resize((max(1, round(sp["w"] * sx)), max(1, round(sp["h"] * sy))), Image.LANCZOS)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if alpha < 1.0:
            im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
        ol, ot, _, _ = rect
        canvas.alpha_composite(im, (int(round(ol - l)) + FPAD, int(round(ot - t)) + FPAD))
    return canvas


# ---------------------------------------------------------------- 图集
def pack(frames):
    order = sorted(frames, key=lambda f: -f["h"])
    pages, cur = [], {"x": 0, "y": 0, "row_h": 0, "h": 0, "items": []}
    pages.append(cur)
    for f in order:
        w, h = f["w"] + PAD, f["h"] + PAD
        if cur["x"] + w > PAGE_MAX:
            cur["x"], cur["y"], cur["row_h"] = 0, cur["y"] + cur["row_h"], 0
        if cur["y"] + h > PAGE_MAX:
            cur = {"x": 0, "y": 0, "row_h": 0, "h": 0, "items": []}
            pages.append(cur)
        cur["items"].append((f, cur["x"], cur["y"]))
        cur["x"] += w
        cur["row_h"] = max(cur["row_h"], h)
        cur["h"] = max(cur["h"], cur["y"] + h)
    return pages


def write_atlas(pages, base, outdir):
    lines = []
    for i, p in enumerate(pages):
        im = Image.new("RGBA", (PAGE_MAX, max(1, p["h"])), (0, 0, 0, 0))
        for f, x, y in p["items"]:
            im.paste(f["img"], (x, y))
        page = f"{base}_{i}.png"
        im.save(os.path.join(outdir, page))
        lines += [page, f"size: {PAGE_MAX},{max(1, p['h'])}", "format: RGBA8888",
                  "filter: Linear,Linear", "repeat: none", "pma: false"]
        for f, x, y in p["items"]:
            lines += [f["name"], "  rotate: false", f"  xy: {x}, {y}",
                      f"  size: {f['w']}, {f['h']}", f"  orig: {f['w']}, {f['h']}",
                      "  offset: 0, 0", "  index: -1"]
        lines.append("")
    with open(os.path.join(outdir, f"{base}.atlas"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    return [f"{base}_{i}.png" for i in range(len(pages))]


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--char", required=True)
    ap.add_argument("--api", default="http://127.0.0.1:47821")
    ap.add_argument("--mod", default="mods/limbus-company")
    ap.add_argument("--base", default=None)
    a = ap.parse_args()
    base = a.base or a.char.replace("char_limbus_", "")
    outdir = os.path.join(a.mod, "assets", "spine", "op", a.char, "front")
    os.makedirs(outdir, exist_ok=True)

    print(f"[1/5] 拉取 clip … (id={a.id})")
    clips = fetch_clips(a.api, a.id)
    cache = {}
    groups = {}
    for c in clips:
        groups.setdefault(global_label(c), {"clips": [], "fps": c["fps"]})["clips"].append(c)
    print(f"      {len(clips)} 个 clip → {len(groups)} 个动画: {', '.join(groups)}")

    # ---- 锚点：用 Default 姿态那一帧的底边作地面、水平中心作 x=0
    ground = None, None
    ref = groups.get("idle", {}).get("clips") or clips
    c0 = ref[0]
    b0 = frame_bounds(c0["frames"][0].get("ops", []), c0["sprites"]) if c0["frames"] else None
    if b0:
        ground = b0[3]                      # 底边 y（向下为正）
        anchor_x = (b0[0] + b0[2]) / 2.0
    else:
        ground, anchor_x = 0.0, 0.0
    print(f"[2/5] 地面线 y={ground:.1f}  x0={anchor_x:.1f}")

    frames, anims, timing = [], {}, {}
    for an, g in groups.items():
        keys, t, seq = [], 0.0, 0
        for c in g["clips"]:
            for fr in c["frames"]:
                ops = fr.get("ops", [])
                bd = frame_bounds(ops, c["sprites"])
                if not bd:
                    continue
                img = render_frame(a.api, cache, c["bundle"], c["sprites"], ops, bd)
                nm = f"{an}_{seq}"; seq += 1
                # 附件偏移：锚点（anchor_x, ground）落在骨骼原点
                e = anchor_x - (bd[0] - FPAD)          # 锚点距图左边
                d = ground - (bd[1] - FPAD)            # 锚点距图顶边
                frames.append({"name": nm, "img": img, "w": img.width, "h": img.height,
                               "ax": round(img.width / 2.0 - e, 3),
                               "ay": round(d - img.height / 2.0, 3)})
                keys.append({"time": round(t, 4), "name": nm})
                t += max(1, int(fr.get("d") or 1)) / c["fps"]
        if len(keys) == 1:                              # 单帧姿态：直接用动画名做附件名
            frames[-1]["name"] = an
            keys[0]["name"] = an
        anims[an] = {"slots": {"body": {"attachment": keys}}}
        timing[an] = round(g["fps"], 2)

    # 待机呼吸：帧管线的 idle 只有一帧附件 ⇒ 模型僵死。给 root 骨合成一条轻微的
    # 纵向缩放呼吸轨（见 idle_breathing.py），让部署后的干员"活"起来。
    if "idle" in anims:
        anims["idle"]["bones"] = breathing_bones()

    print(f"[3/5] 拼图集 …（{len(frames)} 帧）")
    pages = pack(frames)
    pngs = write_atlas(pages, base, outdir)

    print(f"[4/5] 生成 Spine JSON …")
    # 模型高度归一：以姿态 idle（没有就用第一帧）的高度为基准，缩放到 TARGET_UNITS
    TARGET_UNITS = 510.0                       # ≈1.6 格，对齐方舟干员
    ref = next((f for f in frames if f["name"] == "idle"), frames[0])
    _rig_scale = round(TARGET_UNITS / max(1.0, float(ref["h"])), 4)
    attach = {f["name"]: {"type": "region", "path": f["name"], "x": f["ax"], "y": f["ay"],
                          "width": f["w"], "height": f["h"]} for f in frames}
    xs = [v["x"] - v["width"] / 2 for v in attach.values()] + \
         [v["x"] + v["width"] / 2 for v in attach.values()]
    ys = [v["y"] - v["height"] / 2 for v in attach.values()] + \
         [v["y"] + v["height"] / 2 for v in attach.values()]
    sp = {"skeleton": {"hash": "", "spine": SPINE_VERSION,
                       "x": round(min(xs), 2), "y": round(min(ys), 2),
                       "width": round(max(xs) - min(xs), 2),
                       "height": round(max(ys) - min(ys), 2), "images": "."},
          # ⚠️ 根骨骼缩放：渲染器的 UNIT.modelScale = 1/320 是按【方舟骨架的建模尺寸】定的。
          #    方舟干员骨架自带缩放（PM 的立绘骨架也有 scaleX/scaleY 0.3333）。不加的话
          #    模型只有正常大小的一半（实测 0.87 格 vs 方舟 1.62 格）。
          "bones": [{"name": "root", "scaleX": _rig_scale, "scaleY": _rig_scale}],
          "slots": [{"name": "body", "bone": "root",
                     "attachment": "idle" if "idle" in attach else next(iter(attach))}],
          # ⚠️ skins 必须是【数组】（Spine 4.0 风格）。用对象式的话，pixi-spine 的 4.0 读取器
          #    会按 `.length` 遍历（对象没有 length）→ 一次都不跑 → 皮肤/附件全丢 → 模型隐形。
          "skins": [{"name": "default", "attachments": {"body": attach}}],
          "animations": anims}
    with open(os.path.join(outdir, f"{base}.json"), "w", encoding="utf-8") as fh:
        json.dump(sp, fh, ensure_ascii=False, separators=(",", ":"))

    regs = set()
    for ln in open(os.path.join(outdir, f"{base}.atlas"), encoding="utf-8"):
        s = ln.rstrip("\n")
        if s and not s[0].isspace() and ":" not in s and not s.endswith(".png"):
            regs.add(s)
    miss = set(attach) - regs
    print(f"[5/5] 校验：区域 {len(regs)} / 引用 {len(attach)}"
          f"{'  ✗ 缺 ' + str(sorted(miss)[:4]) if miss else '  ✓ 一一对应'}")
    print(f"      动画: {', '.join(anims)}")
    entry = {"front": {
        "skel": f"/assets/spine/op/{a.char}/front/{base}.json",
        "atlas": f"/assets/spine/op/{a.char}/front/{base}.atlas",
        "textures": [f"/assets/spine/op/{a.char}/front/{p}" for p in pngs],
        "pma": False,
        "anims": {"idle": "idle" if "idle" in anims else None,
                  "deploy": "deploy" if "deploy" in anims else None,
                  "attack": {"begin": None, "loop": "attack1" if "attack1" in anims else None, "end": None},
                  "attackDown": None,
                  "skill": {"begin": None, "loop": "attack1", "end": None, "via": "attack", "index": 0, "idle": None},
                  "die": "die" if "die" in anims else None,
                  "move": "move" if "move" in anims else None,
                  "stun": "hit" if "hit" in anims else None,
                  "skills": {str(i): {"begin": None, "loop": f"attack{i+1}", "end": None,
                                      "via": "attack", "index": i, "idle": None}
                             for i in range(3) if f"attack{i+1}" in anims}}}}
    with open(os.path.join(outdir, "assets_entry.json"), "w", encoding="utf-8") as fh:
        json.dump({a.char: {"spine": entry}}, fh, ensure_ascii=False, indent=2)
    print(f"      条目 → assets_entry.json")


if __name__ == "__main__":
    main()
