#!/usr/bin/env python3
# tools/fgo_asset_icon_audio_builder.py — Batch generator for FGO Round Table mod assets
#
# Generates: 45 PRTS-standard skill icons (128x128 RGBA PNGs) with clean silhouettes and PRTS backplates.
#
# 2026-10-16: the 8-layer rigging metadata (rigs.json) and the audio_map.json ducking/throttling profile were
# removed — the mod uses full-figure standees instead of cut-out rigs, and BGM ducking + voice throttling now live
# in public/js/mods/fgo-fx-rig-audio.js and the engine's public/js/audio.js. Neither file ever had a reader.

import os
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOD_DIR = os.path.join(ROOT, "mods", "fgo-round-table")
ASSETS_DIR = os.path.join(ROOT, "public", "assets")
SKILLS_DIR = os.path.join(ASSETS_DIR, "skills")
MOD_SKILLS_DIR = os.path.join(MOD_DIR, "assets", "skills")

OPERATORS = [
    {
        "id": "gareth",
        "name": "加雷斯",
        "skills": [
            {"id": "skchr_fgo_gareth_1", "name": "美掌加雷斯", "type": "red", "symbol": "lance"},
            {"id": "skchr_fgo_gareth_2", "name": "变身戒指", "type": "yellow", "symbol": "ring"},
            {"id": "skchr_fgo_gareth_3", "name": "狂暴少女狼", "type": "crimson", "symbol": "wolf"}
        ]
    },
    {
        "id": "bedivere",
        "name": "贝德维尔",
        "skills": [
            {"id": "skchr_fgo_bedivere_1", "name": "沉着冷静", "type": "red", "symbol": "calm"},
            {"id": "skchr_fgo_bedivere_2", "name": "守护的誓约", "type": "yellow", "symbol": "oath"},
            {"id": "skchr_fgo_bedivere_3", "name": "紧握其剑，银之臂", "type": "crimson", "symbol": "arm"}
        ]
    },
    {
        "id": "tristan",
        "name": "崔斯坦",
        "skills": [
            {"id": "skchr_fgo_tristan_1", "name": "治愈的竖琴", "type": "blue", "symbol": "harp"},
            {"id": "skchr_fgo_tristan_2", "name": "致骑士王的谏言", "type": "yellow", "symbol": "counsel"},
            {"id": "skchr_fgo_tristan_3", "name": "痛哭幻奏", "type": "crimson", "symbol": "sonata"}
        ]
    },
    {
        "id": "percival",
        "name": "珀西瓦尔",
        "skills": [
            {"id": "skchr_fgo_percival_1", "name": "圣杯的加护", "type": "blue", "symbol": "grail"},
            {"id": "skchr_fgo_percival_2", "name": "守护骑士", "type": "yellow", "symbol": "knight"},
            {"id": "skchr_fgo_percival_3", "name": "光耀的命运之枪", "type": "crimson", "symbol": "longinus"}
        ]
    },
    {
        "id": "baobhan",
        "name": "芭万·希",
        "skills": [
            {"id": "skchr_fgo_baobhan_1", "name": "妖精吸血", "type": "red", "symbol": "drain"},
            {"id": "skchr_fgo_baobhan_2", "name": "格雷玛尔金 & 继承者", "type": "yellow", "symbol": "heir"},
            {"id": "skchr_fgo_baobhan_3", "name": "痛幻哭奏", "type": "crimson", "symbol": "fetch"}
        ]
    },
    {
        "id": "gawain",
        "name": "高文",
        "skills": [
            {"id": "skchr_fgo_gawain_1", "name": "圣者的数字 EX", "type": "red", "symbol": "num"},
            {"id": "skchr_fgo_gawain_2", "name": "不夜的魅力 & 腰带", "type": "yellow", "symbol": "belt"},
            {"id": "skchr_fgo_gawain_3", "name": "轮转胜利之剑", "type": "crimson", "symbol": "galatine"}
        ]
    },
    {
        "id": "barghest",
        "name": "巴格斯特",
        "skills": [
            {"id": "skchr_fgo_barghest_1", "name": "野性法则", "type": "red", "symbol": "wild"},
            {"id": "skchr_fgo_barghest_2", "name": "福尔·韦瑟", "type": "yellow", "symbol": "weather"},
            {"id": "skchr_fgo_barghest_3", "name": "捕食日轮之角", "type": "crimson", "symbol": "horn"}
        ]
    },
    {
        "id": "mash",
        "name": "玛修",
        "skills": [
            {"id": "skchr_fgo_mash_1", "name": "雪花之壁", "type": "yellow", "symbol": "snow"},
            {"id": "skchr_fgo_mash_2", "name": "已然遥远的理想之城", "type": "yellow", "symbol": "camelot"},
            {"id": "skchr_fgo_mash_3", "name": "人理之盾·人理之剑", "type": "crimson", "symbol": "chaldea"}
        ]
    },
    {
        "id": "lancelot",
        "name": "兰斯洛特",
        "skills": [
            {"id": "skchr_fgo_lancelot_1", "name": "湖上骑士 & 武练", "type": "red", "symbol": "lake"},
            {"id": "skchr_fgo_lancelot_2", "name": "骑士不徒手而亡", "type": "yellow", "symbol": "knightarms"},
            {"id": "skchr_fgo_lancelot_3", "name": "缚锁全断·过重湖光", "type": "crimson", "symbol": "arondight"}
        ]
    },
    {
        "id": "mordred",
        "name": "莫德雷德",
        "skills": [
            {"id": "skchr_fgo_mordred_1", "name": "赤雷的骑士", "type": "red", "symbol": "thunder"},
            {"id": "skchr_fgo_mordred_2", "name": "隐藏不贞的头盔", "type": "yellow", "symbol": "helm"},
            {"id": "skchr_fgo_mordred_3", "name": "对吾华丽父王的叛逆", "type": "crimson", "symbol": "clarent"}
        ]
    },
    {
        "id": "melusine",
        "name": "梅柳齐娜",
        "skills": [
            {"id": "skchr_fgo_melusine_1", "name": "尚未知晓的无垢湖光", "type": "red", "symbol": "lance"},
            {"id": "skchr_fgo_melusine_2", "name": "龙之心 & 佩里舞者", "type": "yellow", "symbol": "dragon"},
            {"id": "skchr_fgo_melusine_3", "name": "光之地平线", "type": "crimson", "symbol": "horizon"}
        ]
    },
    {
        "id": "artoria",
        "name": "阿尔托莉雅",
        "skills": [
            {"id": "skchr_fgo_artoria_1", "name": "理想乡的骑士 EX", "type": "red", "symbol": "charisma"},
            {"id": "skchr_fgo_artoria_2", "name": "龙之炉心 & 闪耀之路", "type": "yellow", "symbol": "core"},
            {"id": "skchr_fgo_artoria_3", "name": "誓约胜利之剑", "type": "crimson", "symbol": "excalibur"}
        ]
    },
    {
        "id": "merlin",
        "name": "梅林",
        "skills": [
            {"id": "skchr_fgo_merlin_1", "name": "梦幻魅力 A", "type": "green", "symbol": "dream"},
            {"id": "skchr_fgo_merlin_2", "name": "英雄塑造 & 幻术", "type": "yellow", "symbol": "hero"},
            {"id": "skchr_fgo_merlin_3", "name": "永世隔绝的理想乡", "type": "blue", "symbol": "avalon"}
        ]
    },
    {
        "id": "castoria",
        "name": "阿尔托莉雅·卡斯特",
        "skills": [
            {"id": "skchr_fgo_castoria_1", "name": "希望的魅力 & 湖之加护", "type": "green", "symbol": "hope"},
            {"id": "skchr_fgo_castoria_2", "name": "选定之剑", "type": "yellow", "symbol": "sword"},
            {"id": "skchr_fgo_castoria_3", "name": "真圆集结誓约之星", "type": "crimson", "symbol": "star"}
        ]
    },
    {
        "id": "morgan",
        "name": "摩根",
        "skills": [
            {"id": "skchr_fgo_morgan_1", "name": "渴望的魅力 & 湖之加护", "type": "red", "symbol": "thirst"},
            {"id": "skchr_fgo_morgan_2", "name": "来自止境", "type": "yellow", "symbol": "storm"},
            {"id": "skchr_fgo_morgan_3", "name": "业已无法抵达的理想乡", "type": "crimson", "symbol": "rhongomyniad"}
        ]
    }
]

COLOR_THEMES = {
    "red": {"bg": (178, 34, 34, 255), "grad": (120, 20, 20, 255), "accent": (255, 100, 100, 255)},
    "yellow": {"bg": (218, 165, 32, 255), "grad": (160, 110, 15, 255), "accent": (255, 220, 100, 255)},
    "blue": {"bg": (30, 144, 255, 255), "grad": (15, 70, 160, 255), "accent": (130, 200, 255, 255)},
    "green": {"bg": (46, 139, 87, 255), "grad": (20, 90, 50, 255), "accent": (120, 230, 160, 255)},
    "crimson": {"bg": (148, 0, 211, 255), "grad": (75, 0, 130, 255), "accent": (255, 215, 0, 255)}
}

def generate_skill_icon(skill, out_paths):
    size = 128
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    theme = COLOR_THEMES.get(skill["type"], COLOR_THEMES["red"])
    bg_col = theme["bg"]
    grad_col = theme["grad"]
    accent_col = theme["accent"]

    # 1. Background diamond / rounded frame
    margin = 8
    draw.rounded_rectangle([margin, margin, size - margin, size - margin], radius=16, fill=grad_col, outline=accent_col, width=3)

    # 2. Central symbol drawing (clean PRTS geometric emblems)
    cx, cy = size // 2, size // 2
    sym = skill.get("symbol", "sword")

    if sym in ("sword", "excalibur", "calatine", "clarent", "arondight"):
        # Sword silhouette: blade, guard, hilt
        draw.polygon([(cx, cy - 38), (cx + 8, cy - 28), (cx + 6, cy + 12), (cx - 6, cy + 12), (cx - 8, cy - 28)], fill=(255, 255, 255, 255))
        draw.rectangle([cx - 20, cy + 12, cx + 20, cy + 18], fill=accent_col)
        draw.rectangle([cx - 4, cy + 18, cx + 4, cy + 32], fill=(220, 220, 220, 255))
        draw.ellipse([cx - 6, cy + 30, cx + 6, cy + 38], fill=accent_col)
    elif sym in ("lance", "longinus", "rhongomyniad"):
        # Spear silhouette
        draw.polygon([(cx, cy - 42), (cx + 10, cy - 20), (cx + 4, cy + 30), (cx - 4, cy + 30), (cx - 10, cy - 20)], fill=(255, 255, 255, 255))
        draw.line([(cx, cy - 40), (cx, cy + 36)], fill=accent_col, width=3)
    elif sym in ("shield", "snow", "chaldea", "camelot"):
        # Shield silhouette
        draw.polygon([(cx, cy + 36), (cx + 26, cy + 10), (cx + 24, cy - 26), (cx - 24, cy - 26), (cx - 26, cy + 10)], fill=(255, 255, 255, 255), outline=accent_col)
        draw.line([(cx, cy - 24), (cx, cy + 32)], fill=grad_col, width=3)
        draw.line([(cx - 20, cy - 6), (cx + 20, cy - 6)], fill=grad_col, width=3)
    elif sym in ("grail", "avalon", "dream", "hope"):
        # Chalice / Lotus silhouette
        draw.arc([cx - 22, cy - 20, cx + 22, cy + 16], 0, 180, fill=(255, 255, 255, 255), width=6)
        draw.rectangle([cx - 4, cy + 16, cx + 4, cy + 30], fill=(255, 255, 255, 255))
        draw.ellipse([cx - 18, cy + 28, cx + 18, cy + 36], fill=accent_col)
    else:
        # Starburst / Heraldic crest
        for i in range(8):
            angle = i * (math.pi / 4)
            r_out = 32 if i % 2 == 0 else 18
            ox = cx + int(r_out * math.cos(angle))
            oy = cy + int(r_out * math.sin(angle))
            draw.line([(cx, cy), (ox, oy)], fill=(255, 255, 255, 255), width=4)
        draw.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=accent_col)

    # 3. Inner border accent
    draw.rounded_rectangle([margin + 4, margin + 4, size - margin - 4, size - margin - 4], radius=12, outline=(255, 255, 255, 120), width=1)

    for p in out_paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        img.save(p, "PNG")

def build_all_icons():
    print("[icon-builder] Generating 45 PRTS-standard skill icons...")
    count = 0
    for op in OPERATORS:
        for sk in op["skills"]:
            p1 = os.path.join(SKILLS_DIR, f"{sk['id']}.png")
            p2 = os.path.join(MOD_SKILLS_DIR, f"{sk['id']}.png")
            generate_skill_icon(sk, [p1, p2])
            count += 1
    print(f"[icon-builder] Successfully generated {count} skill icons.")

if __name__ == "__main__":
    build_all_icons()
    print("[fgo-asset-builder] All tasks completed successfully.")
