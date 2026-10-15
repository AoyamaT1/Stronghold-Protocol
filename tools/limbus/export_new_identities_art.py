# tools/limbus/export_new_identities_art.py
import os
from PIL import Image

THUMBS = "D:/build/limbus-archive/LimbusArchive/data/thumbs"
MOD_DIR = "mods/limbus-company/assets"
AVATAR_DIR = os.path.join(MOD_DIR, "char", "avatar")
PORTRAIT_DIR = os.path.join(MOD_DIR, "char", "portrait")
SKILL_DIR = os.path.join(MOD_DIR, "skill")

os.makedirs(AVATAR_DIR, exist_ok=True)
os.makedirs(PORTRAIT_DIR, exist_ok=True)
os.makedirs(SKILL_DIR, exist_ok=True)


def get_image(h):
    p = os.path.join(THUMBS, h[:2], h + ".webp")
    if os.path.exists(p):
        return Image.open(p).convert("RGBA")
    raise FileNotFoundError(f"Missing hash in thumbs: {h} ({p})")


MAPPINGS = {
    "ryoshu": {
        "p1": "8ffc5e516610fc2f632eda9c30e1cfd588a51bcc",
        "p2": "c7f303c59a63c29f22c16d04d6dc0188e2cb90ff",
        "av1": "f28f6b341a8b5f00d4da2da323c795fc4f88d248",
        "av2": "d3b51a64c824b024f0a4d3fd38e4be01c67a07b0",
        "s1": "19cc8f661320f5073864164e666c49eb8fcbd5f5",
        "s2": "47b0e4e0db01abb8556e795726b71254f9e34c3e",
        "s3": "92ae547d527d79d5c4b4c1f9aeff88b695f63dd0",
    },
    "gregor": {
        "p1": "2a876577f8bca9a278475802190d7e3ec41ac238",
        "p2": "bfdf111cc3ab85d6c989bca02e8aea3c1a0b759a",
        "av1": "3865d16a0e963396d52e76561e424615639fec2a",
        "av2": "65feb55048862d2e2dcc2453583fdf5425581f75",
        "s1": "068734824958b771958d821d13da81a2b8c1df5f",
        "s2": "ce53a35ab8e4312df43790a734d2c14477090e60",
        "s3": "c2c8338fb851651e6452f6490d3da3f7c9127c5a",
    },
    "faust": {
        "p1": "6929ada8b729e014657ae453dd28f32168296030",
        "p2": "459af93b5911c3817cfeaef27cd292c6ae5f0cf8",
        "av1": "ac9ef6d6acc1ee93c7841e087e136a2701f93b0b",
        "av2": "5cf3a93ba430610fb9669465876ac13afc3c2a78",
        "s1": "d53c8b2614bff2e7e4b99ad057db4d669f8644ba",
        "s2": "65482aa38829204d1bc62c9a1c60bbd4e4483951",
        "s3": "929b188a639634ded79c53706dd9222aad754a6e",
    },
    "rodion": {
        "p1": "c9429fd94ad4c0ddec1f17e5b6acbbeef16b73d3",
        "p2": "3b39a7f7b845e6bf48290571153dbcf5e88fc54b",
        "av1": "91592dd255394eb8fb9b241110999be01e19512c",
        "av2": "409fe879fdc21fd036b50b5f61a3bb2bf3837d9a",
        "s1": "11ba6096deb95f3ac4b463a21a19ece2d2df2da6",
        "s2": "af566bacf63c639658b0000d84334523166836b9",
        "s3": "49e40c681cedda60ba850cad22ce7940e23235e3",
    },
}

for sinner, m in MAPPINGS.items():
    print(f"Exporting assets for {sinner}...")
    char_id = f"char_limbus_{sinner}"

    # Portraits
    p1 = get_image(m["p1"])
    p1.save(os.path.join(PORTRAIT_DIR, f"{char_id}_1.png"), "PNG")
    p2 = get_image(m["p2"])
    p2.save(os.path.join(PORTRAIT_DIR, f"{char_id}_2.png"), "PNG")

    # Avatars (resize profile to standard 180x180)
    av1 = get_image(m["av1"]).resize((180, 180), Image.Resampling.LANCZOS)
    av1.save(os.path.join(AVATAR_DIR, f"{char_id}.png"), "PNG")
    av2 = get_image(m["av2"]).resize((180, 180), Image.Resampling.LANCZOS)
    av2.save(os.path.join(AVATAR_DIR, f"{char_id}_2.png"), "PNG")

    # Skills (resize to standard 128x128)
    for s_idx in range(1, 4):
        s_img = get_image(m[f"s{s_idx}"]).resize(
            (128, 128), Image.Resampling.LANCZOS
        )
        s_img.save(
            os.path.join(SKILL_DIR, f"skchr_{sinner}_{s_idx}.png"), "PNG"
        )

print("Export complete for all 4 updated identities!")
