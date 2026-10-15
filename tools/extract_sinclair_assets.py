import os
import UnityPy
from PIL import Image

UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.12f1"

bundle_art = r"D:\die\ProjectMoon\ProjectMoon_LimbusCompany\152c6d71e03d9a62689dbf2fa3ee9681\79dd8a297f561ae48d8e710821aba90c\__data"
bundle_spine = r"D:\die\ProjectMoon\ProjectMoon_LimbusCompany\bffb31050584a47fd9e65ca4363bf8eb\1c4fc4380d424ef30983142869abddb3\__data"
output_base = r"d:\build\Stronghold-Protocol-4PR\mods\limbus-company\assets"

os.makedirs(os.path.join(output_base, "char", "avatar"), exist_ok=True)
os.makedirs(os.path.join(output_base, "char", "portrait"), exist_ok=True)
os.makedirs(os.path.join(output_base, "skill"), exist_ok=True)
spine_out = os.path.join(output_base, "spine", "op", "char_limbus_sinclair", "front")
os.makedirs(spine_out, exist_ok=True)

print("1. Extracting Sinclair 2D art (avatars, portraits, skills)...")
env_art = UnityPy.load(bundle_art)

for obj in env_art.objects:
    if obj.type.name == "Texture2D":
        d = obj.read()
        name = getattr(d, "m_Name", "")
        img = d.image
        if not img:
            continue

        if name == "11005_normal_profile":
            out_p = os.path.join(output_base, "char", "avatar", "char_limbus_sinclair.png")
            img.save(out_p)
            print(f"Saved {out_p} ({img.size})")
        elif name == "11005_gacksung_profile":
            out_p = os.path.join(output_base, "char", "avatar", "char_limbus_sinclair_2.png")
            img.save(out_p)
            print(f"Saved {out_p} ({img.size})")
        elif name == "11005_normal" and img.size == (1920, 1080):
            out_p = os.path.join(output_base, "char", "portrait", "char_limbus_sinclair_1.png")
            img.save(out_p)
            print(f"Saved {out_p} ({img.size})")
        elif name == "11005_gacksung" and img.size == (1920, 1080):
            out_p = os.path.join(output_base, "char", "portrait", "char_limbus_sinclair_2.png")
            img.save(out_p)
            print(f"Saved {out_p} ({img.size})")
        elif name == "1100501":
            out_p = os.path.join(output_base, "skill", "skchr_sinclair_1.png")
            img.save(out_p)
            print(f"Saved {out_p} ({img.size})")
        elif name == "1100502":
            out_p = os.path.join(output_base, "skill", "skchr_sinclair_2.png")
            img.save(out_p)
            print(f"Saved {out_p} ({img.size})")
        elif name == "1100503":
            out_p = os.path.join(output_base, "skill", "skchr_sinclair_3.png")
            img.save(out_p)
            print(f"Saved {out_p} ({img.size})")

print("2. Extracting Sinclair Spine battle chibi...")
env_spine = UnityPy.load(bundle_spine)

raw_atlas = None
raw_skel = None
raw_texture = None

for obj in env_spine.objects:
    d = obj.read()
    name = getattr(d, "m_Name", "")
    if obj.type.name == "TextAsset":
        if name == "darkkromer_sinclair.atlas":
            raw_atlas = getattr(d, "text", "") or getattr(d, "m_Script", "")
            print(f"Found atlas: {name} (len {len(raw_atlas)})")
        elif name == "darkkromer_sinclair":
            raw_skel = getattr(d, "bytes", None) or getattr(d, "m_Script", None)
            if isinstance(raw_skel, str):
                raw_skel = raw_skel.encode("utf-8")
            print(f"Found skeleton asset: {name} (bytes {len(raw_skel) if raw_skel else 0})")
    elif obj.type.name == "Texture2D":
        if name == "darkkromer_sinclair":
            raw_texture = d.image
            print(f"Found texture: {name} ({raw_texture.size})")

if raw_atlas and raw_texture:
    # Save texture
    tex_path = os.path.join(spine_out, "char_limbus_sinclair.png")
    raw_texture.save(tex_path)
    print(f"Saved Spine Texture: {tex_path}")

    # Standardize Atlas format for Spine 3.8 Pixi-Spine parser
    lines = raw_atlas.strip().splitlines()
    converted_lines = ["char_limbus_sinclair.png", f"size: {raw_texture.width},{raw_texture.height}", "format: RGBA8888", "filter: Linear,Linear", "repeat: none"]
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line or line.endswith(".png") or line.startswith("size:") or line.startswith("format:") or line.startswith("filter:") or line.startswith("repeat:"):
            continue
        
        # Region name
        region_name = line
        converted_lines.append(region_name)
        
        props = {}
        while i < len(lines):
            subline = lines[i].strip()
            if not subline or ":" not in subline:
                break
            k, v = subline.split(":", 1)
            props[k.strip()] = v.strip()
            i += 1
            
        rotate = props.get("rotate", "false")
        converted_lines.append(f"  rotate: {rotate}")
        
        if "bounds" in props:
            bx, by, bw, bh = [p.strip() for p in props["bounds"].split(",")]
            converted_lines.append(f"  xy: {bx}, {by}")
            converted_lines.append(f"  size: {bw}, {bh}")
            if "offsets" in props:
                ox, oy, ow, oh = [p.strip() for p in props["offsets"].split(",")]
                converted_lines.append(f"  orig: {ow}, {oh}")
                converted_lines.append(f"  offset: {ox}, {oy}")
            else:
                converted_lines.append(f"  orig: {bw}, {bh}")
                converted_lines.append(f"  offset: 0, 0")
        else:
            if "xy" in props: converted_lines.append(f"  xy: {props['xy']}")
            if "size" in props: converted_lines.append(f"  size: {props['size']}")
            if "orig" in props: converted_lines.append(f"  orig: {props['orig']}")
            if "offset" in props: converted_lines.append(f"  offset: {props['offset']}")
        converted_lines.append(f"  index: {props.get('index', '-1')}")

    atlas_path = os.path.join(spine_out, "char_limbus_sinclair.atlas")
    with open(atlas_path, "w", encoding="utf-8") as f:
        f.write("\n".join(converted_lines) + "\n")
    print(f"Saved Spine Atlas: {atlas_path}")

    # Skeleton skel/json
    if raw_skel:
        skel_is_json = raw_skel.strip().startswith(b"{")
        ext = ".json" if skel_is_json else ".skel"
        skel_path = os.path.join(spine_out, f"char_limbus_sinclair{ext}")
        with open(skel_path, "wb") as f:
            f.write(raw_skel)
        print(f"Saved Spine Skeleton: {skel_path} (is_json={skel_is_json})")

print("Sinclair assets extraction completed!")
