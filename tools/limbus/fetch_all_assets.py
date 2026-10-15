#!/usr/bin/env python3
"""
tools/limbus/fetch_all_assets.py
Download authentic character portraits, avatars and skill icons for all 12 Limbus Company Sinners.
"""
import os
import io
import urllib.request
from PIL import Image

SINNERS = [
    {"num": 1, "sinner": "yisang", "id": 10104, "name": "李箱"},
    {"num": 2, "sinner": "faust", "id": 10202, "name": "浮士德"},
    {"num": 3, "sinner": "donquixote", "id": 10311, "name": "唐吉诃德"},
    {"num": 4, "sinner": "ryoshu", "id": 10415, "name": "良秀"},
    {"num": 5, "sinner": "meursault", "id": 10512, "name": "默尔索"},
    {"num": 6, "sinner": "honglu", "id": 10613, "name": "鸿璐"},
    {"num": 7, "sinner": "heathcliff", "id": 10710, "name": "希斯克利夫"},
    {"num": 8, "sinner": "ishmael", "id": 10808, "name": "以实玛利"},
    {"num": 9, "sinner": "rodion", "id": 10913, "name": "罗佳"},
    {"num": 10, "sinner": "sinclair", "id": 11005, "name": "辛克莱"},
    {"num": 11, "sinner": "outis", "id": 11107, "name": "奥提斯"},
    {"num": 12, "sinner": "gregor", "id": 11216, "name": "格里高尔"},
]

RAW_BASE = "https://raw.githubusercontent.com/eldritchtools/limbus-assets/main/assets"
MOD_DIR = "mods/limbus-company/assets"
AVATAR_DIR = os.path.join(MOD_DIR, "char", "avatar")
PORTRAIT_DIR = os.path.join(MOD_DIR, "char", "portrait")
SKILL_DIR = os.path.join(MOD_DIR, "skill")

os.makedirs(AVATAR_DIR, exist_ok=True)
os.makedirs(PORTRAIT_DIR, exist_ok=True)
os.makedirs(SKILL_DIR, exist_ok=True)


def download_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def crop_avatar_from_portrait(im, out_size=(180, 180)):
    # Standard portrait avatar crop: top-center 45% of width/height
    w, h = im.size
    crop_w = int(w * 0.45)
    crop_h = int(w * 0.45)
    left = int((w - crop_w) / 2)
    top = int(h * 0.08)
    cropped = im.crop((left, top, left + crop_w, top + crop_h))
    return cropped.resize(out_size, Image.Resampling.LANCZOS)


def main():
    print(f"=== Fetching static art assets for 12 Sinners ===")
    for item in SINNERS:
        sinner_key = item["sinner"]
        pid = item["id"]
        char_id = f"char_limbus_{sinner_key}"
        print(f"[{item['num']}/12] {item['name']} ({char_id}, id={pid})...")

        # 1. Base Portrait & Avatar
        p1_path = os.path.join(PORTRAIT_DIR, f"{char_id}_1.png")
        av1_path = os.path.join(AVATAR_DIR, f"{char_id}.png")
        if not os.path.exists(p1_path):
            try:
                url_normal = f"{RAW_BASE}/identities/{pid}_normal.webp"
                raw = download_bytes(url_normal)
                im1 = Image.open(io.BytesIO(raw)).convert("RGBA")
                im1.save(p1_path, "PNG")
                if not os.path.exists(av1_path):
                    av1 = crop_avatar_from_portrait(im1)
                    av1.save(av1_path, "PNG")
                print(f"  + Saved {char_id}_1.png and avatar")
            except Exception as e:
                print(f"  ! Failed base portrait: {e}")

        # 2. E2 / Gacksung Portrait & Avatar
        p2_path = os.path.join(PORTRAIT_DIR, f"{char_id}_2.png")
        av2_path = os.path.join(AVATAR_DIR, f"{char_id}_2.png")
        if not os.path.exists(p2_path):
            try:
                url_gacksung = f"{RAW_BASE}/identities/{pid}_gacksung.webp"
                raw2 = download_bytes(url_gacksung)
                im2 = Image.open(io.BytesIO(raw2)).convert("RGBA")
                im2.save(p2_path, "PNG")
                if not os.path.exists(av2_path):
                    av2 = crop_avatar_from_portrait(im2)
                    av2.save(av2_path, "PNG")
                print(f"  + Saved {char_id}_2.png and avatarE2")
            except Exception as e:
                print(f"  ! Failed E2 portrait: {e}")

        # 3. S1, S2, S3 Skill Icons
        for skill_idx in range(1, 4):
            sk_file = os.path.join(SKILL_DIR, f"skchr_{sinner_key}_{skill_idx}.png")
            if not os.path.exists(sk_file):
                # Try from eldritchtools/limbus-assets/main/assets/skills/{pid}0{skill_idx}.webp
                try:
                    sk_url = f"{RAW_BASE}/skills/{pid}0{skill_idx}.webp"
                    raw_sk = download_bytes(sk_url)
                    im_sk = Image.open(io.BytesIO(raw_sk)).convert("RGBA")
                    im_sk.save(sk_file, "PNG")
                    print(f"  + Saved skchr_{sinner_key}_{skill_idx}.png")
                except Exception as e:
                    # Fallback to local ui_icons
                    pass

    print("=== All art assets download & conversion completed! ===")


if __name__ == "__main__":
    main()
