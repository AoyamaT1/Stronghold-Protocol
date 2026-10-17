#!/usr/bin/env python3
# tools/ingest_fgo_raw_assets.py — Ingest user raw assets from 测试/assets/fgo_raw
#
# Processes:
# 1. 15 characters (standees / figures) -> public/assets/char/standee/ and mods/fgo-round-table/assets/standees/
# 2. Mash Phase 2 / Paladin -> char_fgo_mash_2.png
# 3. 45 Skill icons -> public/assets/skills/, public/assets/skill/, and mods/fgo-round-table/assets/skills/
# 4. Avatars and Portraits cropped from standees -> public/assets/char/avatar/ and portrait/
# 5. Updates mods/fgo-round-table/data/assets.json and data/assets.json

import os
import shutil
import json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "测试", "assets", "fgo_raw")
MOD_DIR = os.path.join(ROOT, "mods", "fgo-round-table")
PUBLIC_ASSETS = os.path.join(ROOT, "public", "assets")

MAPPING = {
    "char_fgo_artoria": "char_fgo_artoria",
    "char_fgo_baobhan_sith": "char_fgo_baobhan",
    "char_fgo_barghest": "char_fgo_barghest",
    "char_fgo_bedivere": "char_fgo_bedivere",
    "char_fgo_castoria": "char_fgo_castoria",
    "char_fgo_gareth": "char_fgo_gareth",
    "char_fgo_gawain": "char_fgo_gawain",
    "char_fgo_lancelot": "char_fgo_lancelot",
    "char_fgo_mash": "char_fgo_mash",
    "char_fgo_melusine": "char_fgo_melusine",
    "char_fgo_merlin": "char_fgo_merlin",
    "char_fgo_mordred": "char_fgo_mordred",
    "char_fgo_morgan": "char_fgo_morgan",
    "char_fgo_percival": "char_fgo_percival",
    "char_fgo_tristan": "char_fgo_tristan",
}

# 原图朝左、需要水平翻转的从者（见 process_standee 的注释）。游戏里干员默认朝右，立绘武器/爪子在
# 画面**左侧**的照搬进去就是反的。判据是「武器或主手所在的半边」，逐张对着原图核过：
#
#   需翻转（武器/爪在左）：
#     gareth    长枪指向左下        mordred   大剑横在画面左侧
#     mash      盾牌在左，视线也朝左  percival  长枪竖立在左侧
#     castoria  权杖垂在左侧        morgan    权杖竖在左侧
#     barghest  前爪（带火）探在左侧
#   保持不翻（武器/手臂在右）：bedivere、tristan、gawain、lancelot、merlin、artoria（剑在右下）
#   无方向性（对称/趴姿，翻不翻都一样）：baobhan_sith、melusine
MIRROR = {
    "char_fgo_gareth", "char_fgo_mordred",
    "char_fgo_mash", "char_fgo_percival", "char_fgo_castoria",
    "char_fgo_morgan", "char_fgo_barghest",
}

def ensure_dirs():
    for d in [
        os.path.join(PUBLIC_ASSETS, "char", "standee"),
        os.path.join(PUBLIC_ASSETS, "char", "avatar"),
        os.path.join(PUBLIC_ASSETS, "char", "portrait"),
        os.path.join(PUBLIC_ASSETS, "skills"),
        os.path.join(PUBLIC_ASSETS, "skill"),
        os.path.join(MOD_DIR, "assets", "standees"),
        os.path.join(MOD_DIR, "assets", "avatar"),
        os.path.join(MOD_DIR, "assets", "portrait"),
        os.path.join(MOD_DIR, "assets", "skills"),
    ]:
        os.makedirs(d, exist_ok=True)

def process_standee(src_path, dest_base_list, mirror=False):
    im = Image.open(src_path).convert("RGBA")
    # 游戏里干员默认朝右（部署 RIGHT 时不镜像），所以立绘原图必须"朝右"。riyo 愚人节卡面里有几张是
    # 武器/身体朝左画的（加雷斯的长枪指向左下），照搬进游戏就成了反的 —— MIRROR 列出的从者在这里翻一次，
    # 头像/半身像都从这同一个 im 裁切，所以三套图自动保持一致。
    if mirror:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    bbox = im.getbbox()
    if not bbox:
        bbox = (0, 0, im.width, im.height)

    # Crop to bounding box with 10px margin on top/sides, 0 at bottom
    pad = 12
    x1 = max(0, bbox[0] - pad)
    y1 = max(0, bbox[1] - pad)
    x2 = min(im.width, bbox[2] + pad)
    y2 = bbox[3] # keep bottom intact for exact ground anchoring
    
    cropped = im.crop((x1, y1, x2, y2))
    
    for dest in dest_base_list:
        cropped.save(dest, "PNG")
    
    return im, bbox

def process_avatar_portrait(im, bbox, dest_avatar_list, dest_portrait_list):
    # Calculate face / head region
    cx = (bbox[0] + bbox[2]) // 2
    fw = bbox[2] - bbox[0]
    fh = bbox[3] - bbox[1]
    
    # Face center is around 25-30% from the top of bounding box
    head_y = bbox[1] + int(fh * 0.28)
    
    # Avatar square crop (180x180)
    av_size = max(160, int(fh * 0.58))
    av_x1 = max(0, cx - av_size // 2)
    av_y1 = max(0, head_y - av_size // 2)
    av_x2 = min(im.width, av_x1 + av_size)
    av_y2 = min(im.height, av_y1 + av_size)
    
    avatar_crop = im.crop((av_x1, av_y1, av_x2, av_y2)).resize((180, 180), Image.LANCZOS)
    for p in dest_avatar_list:
        avatar_crop.save(p, "PNG")
        
    # Portrait bust crop —— 必须保持切出来的那个区域自己的宽高比。
    # 这里原来是 .resize((300, 420)) 硬缩放到固定尺寸，等于为了让图去填 UI 的框而把人物拉变形：
    # 实测 15 张里 14 张的裁切区比例落在 0.88~1.58，压进 300:420 (=0.714) 后横向被压 22%~56%
    # （barghest 最夸张，+121%），用户 2026-10-16 报的就是这个「立绘被拉伸」。改成按宽度等比缩放，
    # 高度随比例走，剩下的交给 UI 的 object-fit 去裁 —— 原比例，不变形。
    port_w = max(240, int(fw * 1.05))
    port_h = max(340, int(fh * 0.90))
    port_x1 = max(0, cx - port_w // 2)
    port_y1 = max(0, bbox[1] - 10)
    port_x2 = min(im.width, port_x1 + port_w)
    port_y2 = min(im.height, port_y1 + port_h)

    portrait_crop = im.crop((port_x1, port_y1, port_x2, port_y2))
    pw, ph = portrait_crop.size
    portrait_crop = portrait_crop.resize((300, max(1, round(ph * 300 / pw))), Image.LANCZOS)
    for p in dest_portrait_list:
        portrait_crop.save(p, "PNG")

def process_skills(raw_char_dir, char_id):
    skill_entries = {}
    for idx in range(1, 4):
        src_skill = os.path.join(raw_char_dir, f"skill_icon_{idx}.png")
        if not os.path.exists(src_skill):
            # Fallback to first available
            src_skill = os.path.join(raw_char_dir, "skill_icon_1.png")
            
        skill_id = f"skchr_fgo_{char_id.replace('char_fgo_', '')}_{idx}"
        icon_filename_1 = f"skill_icon_{skill_id}.png"
        icon_filename_2 = f"{skill_id}.png"
        
        targets = [
            os.path.join(PUBLIC_ASSETS, "skills", icon_filename_1),
            os.path.join(PUBLIC_ASSETS, "skills", icon_filename_2),
            os.path.join(PUBLIC_ASSETS, "skill", icon_filename_2),
            os.path.join(MOD_DIR, "assets", "skills", icon_filename_1),
            os.path.join(MOD_DIR, "assets", "skills", icon_filename_2),
        ]
        
        if os.path.exists(src_skill):
            im = Image.open(src_skill).convert("RGBA")
            im = im.resize((128, 128), Image.LANCZOS)
            for t in targets:
                im.save(t, "PNG")
                
        skill_entries[skill_id] = f"/assets/skills/{icon_filename_1}"
    return skill_entries

def main():
    print("[fgo-ingest] Ingesting raw assets from:", RAW_DIR)
    ensure_dirs()
    
    char_assets_map = {}
    all_skill_entries = {}
    
    for raw_name, char_id in MAPPING.items():
        raw_char_path = os.path.join(RAW_DIR, raw_name)
        if not os.path.exists(raw_char_path):
            print(f"  Warning: Raw directory {raw_char_path} missing, skipping.")
            continue
            
        print(f"  Processing {raw_name} -> {char_id}...")

        # 立绘原图朝左的从者要水平翻转（MIRROR 集合）。standee / 头像 / 半身像 / mash 的帕拉丁形态
        # 共用这一个开关，所以提到循环开头 —— 原来它只定义在 `if 原图存在` 分支里，帕拉丁那段够不着。
        mir = char_id in MIRROR

        # 1. Standee
        fig_src = os.path.join(raw_char_path, "riyo_chara_figure_transparent.png")
        if os.path.exists(fig_src):
            dest_standees = [
                os.path.join(PUBLIC_ASSETS, "char", "standee", f"{char_id}.png"),
                os.path.join(MOD_DIR, "assets", "standees", f"{char_id}.png"),
            ]
            im, bbox = process_standee(fig_src, dest_standees, mirror=mir)
            
            # Avatar & Portrait
            dest_avatars = [
                os.path.join(PUBLIC_ASSETS, "char", "avatar", f"{char_id}.png"),
                os.path.join(MOD_DIR, "assets", "avatar", f"{char_id}.png"),
            ]
            dest_portraits = [
                os.path.join(PUBLIC_ASSETS, "char", "portrait", f"{char_id}.png"),
                os.path.join(MOD_DIR, "assets", "portrait", f"{char_id}.png"),
            ]
            process_avatar_portrait(im, bbox, dest_avatars, dest_portraits)
            
            # Also E2 copy for base
            dest_avatars_e2 = [
                os.path.join(PUBLIC_ASSETS, "char", "avatar", f"{char_id}_2.png"),
                os.path.join(MOD_DIR, "assets", "avatar", f"{char_id}_2.png"),
            ]
            dest_portraits_e2 = [
                os.path.join(PUBLIC_ASSETS, "char", "portrait", f"{char_id}_2.png"),
                os.path.join(MOD_DIR, "assets", "portrait", f"{char_id}_2.png"),
            ]
            dest_standees_e2 = [
                os.path.join(PUBLIC_ASSETS, "char", "standee", f"{char_id}_2.png"),
                os.path.join(MOD_DIR, "assets", "standees", f"{char_id}_2.png"),
            ]
            process_avatar_portrait(im, bbox, dest_avatars_e2, dest_portraits_e2)
            process_standee(fig_src, dest_standees_e2, mirror=mir)
            
        # Special case: Mash Paladin figure for E2
        if char_id == "char_fgo_mash":
            paladin_src = os.path.join(raw_char_path, "riyo_chara_figure_paladin_transparent.png")
            if os.path.exists(paladin_src):
                dest_paladin = [
                    os.path.join(PUBLIC_ASSETS, "char", "standee", "char_fgo_mash_2.png"),
                    os.path.join(MOD_DIR, "assets", "standees", "char_fgo_mash_2.png"),
                ]
                im_pal, bbox_pal = process_standee(paladin_src, dest_paladin, mirror=mir)
                dest_av_pal = [
                    os.path.join(PUBLIC_ASSETS, "char", "avatar", "char_fgo_mash_2.png"),
                    os.path.join(MOD_DIR, "assets", "avatar", "char_fgo_mash_2.png"),
                ]
                dest_pt_pal = [
                    os.path.join(PUBLIC_ASSETS, "char", "portrait", "char_fgo_mash_2.png"),
                    os.path.join(MOD_DIR, "assets", "portrait", "char_fgo_mash_2.png"),
                ]
                process_avatar_portrait(im_pal, bbox_pal, dest_av_pal, dest_pt_pal)
                print("    Processed Mash Paladin standee for E2.")
                
        # 2. Skills
        skill_map = process_skills(raw_char_path, char_id)
        all_skill_entries.update(skill_map)
        
        # 3. Char Assets Map
        char_assets_map[char_id] = {
            "avatar": f"/assets/char/avatar/{char_id}.png",
            "avatarE2": f"/assets/char/avatar/{char_id}_2.png",
            "portrait": f"/assets/char/portrait/{char_id}.png",
            "portraitE2": f"/assets/char/portrait/{char_id}_2.png",
            "standee": f"/assets/char/standee/{char_id}.png",
            "standeeE2": f"/assets/char/standee/{char_id}_2.png",
        }

    # 4. Update mods/fgo-round-table/data/assets.json
    mod_assets_file = os.path.join(MOD_DIR, "data", "assets.json")
    mod_assets = {}
    if os.path.exists(mod_assets_file):
        with open(mod_assets_file, "r", encoding="utf-8") as f:
            mod_assets = json.load(f)
            
    mod_assets["chars"] = mod_assets.get("chars", {})
    mod_assets["chars"].update(char_assets_map)
    
    mod_assets["skills"] = mod_assets.get("skills", {})
    for s_id, path_str in all_skill_entries.items():
        mod_assets["skills"][s_id] = { "icon": path_str }
        
    with open(mod_assets_file, "w", encoding="utf-8") as f:
        json.dump(mod_assets, f, indent=2, ensure_ascii=False)
    print(f"[fgo-ingest] Updated {mod_assets_file}")
    
    # 5. Also update data/assets.json
    base_assets_file = os.path.join(ROOT, "data", "assets.json")
    if os.path.exists(base_assets_file):
        with open(base_assets_file, "r", encoding="utf-8") as f:
            base_assets = json.load(f)
        base_assets.setdefault("chars", {}).update(char_assets_map)
        base_assets.setdefault("skills", {})
        for s_id, path_str in all_skill_entries.items():
            base_assets["skills"][s_id] = path_str
            
        with open(base_assets_file, "w", encoding="utf-8") as f:
            json.dump(base_assets, f, indent=2, ensure_ascii=False)
        print(f"[fgo-ingest] Updated {base_assets_file}")
        
    print("[fgo-ingest] Completed ingestion of 15 servant standees and 45 skill icons!")

if __name__ == "__main__":
    main()
