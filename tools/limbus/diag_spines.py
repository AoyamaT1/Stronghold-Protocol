#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""diag_spines.py — 一次性体检 12 罪人的 Spine，并对比 mods/ 与 public/ 安装副本。"""
import json, os, sys, glob
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SINNERS = ["yisang","faust","donquixote","ryoshu","meursault","honglu",
           "heathcliff","ishmael","rodion","sinclair","outis","gregor"]

def atlas_pages(path):
    if not os.path.exists(path): return 0, []
    pages=[]
    for ln in open(path, encoding="utf-8"):
        s=ln.rstrip("\n")
        if s.endswith(".png"): pages.append(s)
    return len(pages), pages

def summarize(base_dir, name):
    d = os.path.join(base_dir, "assets","spine","op",f"char_limbus_{name}","front")
    jp = os.path.join(d, f"{name}.json")
    ap = os.path.join(d, f"{name}.atlas")
    if not os.path.exists(jp):
        return f"  [{name:<11}] MISSING json ({jp})"
    sp = json.load(open(jp, encoding="utf-8"))
    sk = sp.get("skeleton",{})
    bones = sp.get("bones",[])
    root = next((b for b in bones if b.get("name")=="root"), bones[0] if bones else {})
    skins = sp.get("skins",[])
    skin_type = "array" if isinstance(skins,list) else "OBJECT!"
    if isinstance(skins,list):
        att = (skins[0].get("attachments",{}) if skins else {}).get("body",{})
    else:
        att = skins.get("default",{}).get("attachments",{}).get("body",{})
    anims = sp.get("animations",{})
    anim_summary = ", ".join(f"{k}:{len(v.get('slots',{}).get('body',{}).get('attachment',[]))}"
                             for k,v in anims.items())
    npages, pages = atlas_pages(ap)
    # png on disk?
    missing_png = [p for p in pages if not os.path.exists(os.path.join(d,p))]
    return (f"  [{name:<11}] skel {sk.get('width')}x{sk.get('height')} "
            f"root.scale={root.get('scaleX')} skins={skin_type} att={len(att)} "
            f"anims={len(anims)} pages={npages}{' MISSINGPNG='+str(missing_png) if missing_png else ''}\n"
            f"               anims[{anim_summary}]")

for label, bd in (("MODS", os.path.join(ROOT,"mods","limbus-company")),
                  ("PUBLIC", ROOT)):
    print(f"\n===== {label}  ({bd}) =====")
    pubroot = os.path.join(ROOT,"public") if label=="PUBLIC" else bd
    use = pubroot if label=="PUBLIC" else bd
    for n in SINNERS:
        print(summarize(use, n))

# stray _1.png leftovers
print("\n===== stray *_1.png (early 2-page leftovers) =====")
for n in SINNERS:
    for base in (os.path.join(ROOT,"mods","limbus-company"), os.path.join(ROOT,"public")):
        g = glob.glob(os.path.join(base,"assets","spine","op",f"char_limbus_{n}","front","*_1.png"))
        for p in g: print("  "+os.path.relpath(p, ROOT))
