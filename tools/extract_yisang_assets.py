import os
import UnityPy
from PIL import Image

UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.12f1"

bundle_path = r"D:\die\ProjectMoon\ProjectMoon_LimbusCompany\2db4b2b3d700381ac964fe5fb4310cf4\74c3d392e271e2b989847a04b8633140\__data"
output_base = r"d:\build\Stronghold-Protocol-4PR\mods\limbus-company\assets"

os.makedirs(os.path.join(output_base, "char", "avatar"), exist_ok=True)
os.makedirs(os.path.join(output_base, "char", "portrait"), exist_ok=True)
os.makedirs(os.path.join(output_base, "skill"), exist_ok=True)
os.makedirs(os.path.join(output_base, "spine", "op", "char_limbus_yisang", "front"), exist_ok=True)

print("Loading bundle...")
env = UnityPy.load(bundle_path)

extracted = []

for obj in env.objects:
    c = getattr(obj, "container", "")
    if obj.type.name == "Texture2D":
        d = obj.read()
        name = getattr(d, "m_Name", "")
        img = d.image
        if not img:
            continue

        # Avatars
        if "10104_normal_profile.png" in c or name == "10104_normal_profile":
            out_path = os.path.join(output_base, "char", "avatar", "char_limbus_yisang.png")
            img.save(out_path)
            extracted.append(("Avatar Normal", out_path, img.size))
        elif "10104_gacksung_profile.png" in c or name == "10104_gacksung_profile":
            out_path = os.path.join(output_base, "char", "avatar", "char_limbus_yisang_2.png")
            img.save(out_path)
            extracted.append(("Avatar Golden/E2", out_path, img.size))

        # Portraits
        elif "10104_normal.png" in c or (name == "10104_normal" and img.size == (1920, 1080)):
            out_path = os.path.join(output_base, "char", "portrait", "char_limbus_yisang_1.png")
            img.save(out_path)
            extracted.append(("Portrait Normal", out_path, img.size))
        elif "10104_gacksung.png" in c or (name == "10104_gacksung" and img.size == (1920, 1080)):
            out_path = os.path.join(output_base, "char", "portrait", "char_limbus_yisang_2.png")
            img.save(out_path)
            extracted.append(("Portrait Golden/E2", out_path, img.size))

        # Skill Icons
        elif "1010401.png" in c or name == "1010401":
            out_path = os.path.join(output_base, "skill", "skchr_yisang_1.png")
            img.save(out_path)
            extracted.append(("Skill 1 Icon", out_path, img.size))
        elif "1010402.png" in c or name == "1010402":
            out_path = os.path.join(output_base, "skill", "skchr_yisang_2.png")
            img.save(out_path)
            extracted.append(("Skill 2 Icon", out_path, img.size))
        elif "1010403.png" in c or name == "1010403":
            out_path = os.path.join(output_base, "skill", "skchr_yisang_3.png")
            img.save(out_path)
            extracted.append(("Skill 3 Icon", out_path, img.size))

        # SD Spine Texture
        elif "SD/Personality" in c and name == "dongbek_yisang":
            out_path = os.path.join(output_base, "spine", "op", "char_limbus_yisang", "front", "char_limbus_yisang.png")
            img.save(out_path)
            extracted.append(("Spine SD Texture", out_path, img.size))

    elif obj.type.name == "TextAsset":
        d = obj.read()
        name = getattr(d, "m_Name", "")
        c = getattr(obj, "container", "")
        script = getattr(d, "m_Script", "")

        if "SD/Personality" in c:
            if name.endswith(".atlas"):
                out_path = os.path.join(output_base, "spine", "op", "char_limbus_yisang", "front", "char_limbus_yisang.atlas")
                # Ensure the texture filename referenced inside the atlas matches char_limbus_yisang.png
                atlas_content = script.replace("dongbek_yisang.png", "char_limbus_yisang.png")
                with open(out_path, "w", encoding="utf-8") as f:
                    f.write(atlas_content)
                extracted.append(("Spine SD Atlas", out_path, len(atlas_content)))
            else:
                out_path = os.path.join(output_base, "spine", "op", "char_limbus_yisang", "front", "char_limbus_yisang.json")
                with open(out_path, "w", encoding="utf-8") as f:
                    f.write(script)
                extracted.append(("Spine SD Skeleton JSON", out_path, len(script)))

print(f"\nExtracted {len(extracted)} assets:")
for item in extracted:
    print(f"  {item[0]}: {item[1]} ({item[2]})")
