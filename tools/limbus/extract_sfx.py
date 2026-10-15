"""
Extract authentic combat SFX for the 12 Limbus operators from the local Limbus
Company FMOD SFX banks and lay them out for the engine's `audio.sfx.units`:

    mods/limbus-company/assets/audio/sfx/<charId>/attack.ogg   # per-hit swing/shot
    mods/limbus-company/assets/audio/sfx/<charId>/skill.ogg    # the identity's EGO cut-in

- `attack`: a short weapon-class swing/stab/blunt/gunshot from the shared SFX bank
  (SFX_1), chosen per operator's weapon. Plays on every basic attack.
- `skill`: the identity's own EGO cut-in (SFX_N bank, sample named by identity ID),
  the signature sound; falls back to a heavier weapon hit when an identity has none.

The SFX samples are Vorbis; fsb5 rebuilds a real .ogg using libvorbis (installed via
conda: `conda install -c conda-forge libvorbis libogg`). The engine serves .ogg
through /media (shared/media.js AUDIO_EXTS) and decodes it with Web Audio.

Run:  python tools/limbus/extract_sfx.py
Then the audio.sfx.units block is printed for data/assets.json (already wired there).
"""
import os, sys, glob, json

# libvorbis/libogg from conda — fsb5.rebuild_sample needs them to emit real Ogg.
_LIBBIN = r"C:\Users\64541\miniconda3\Library\bin"
if os.path.isdir(_LIBBIN):
    os.environ["PATH"] = _LIBBIN + os.pathsep + os.environ.get("PATH", "")
    try: os.add_dll_directory(_LIBBIN)
    except Exception: pass

import fsb5
from enum import IntEnum

class ExtendedSoundFormat(IntEnum):
    NONE=0; PCM8=1; PCM16=2; PCM24=3; PCM32=4; PCMFLOAT=5; GCADPCM=6; IMAADPCM=7
    VAG=8; HEVAG=9; XMA=10; MPEG=11; CELT=12; AT9=13; XWMA=14; VORBIS=15; FADPCM=16
    @property
    def file_extension(self): return "ogg" if self == 15 else "bin"
    @property
    def is_pcm(self): return False
fsb5.SoundFormat = ExtendedSoundFormat

BANK_DIR = r"D:\app1\game\steamapps\common\Limbus Company\LimbusCompany_Data\StreamingAssets\Assets\Sound\FMODBuilds\Desktop"
OUT_ROOT = r"d:\build\Stronghold-Protocol-4PR\mods\limbus-company\assets\audio\sfx"
URL_ROOT = "/assets/audio/sfx"

# charId -> (identity ID for the EGO cut-in, weapon class for the basic-attack SFX)
OPS = {
    "char_limbus_yisang":     ("10104", "slash"),  # 山茶花 · 剑
    "char_limbus_faust":      ("10212", "slash"),  # 黑兽卯 · 爪刃
    "char_limbus_donquixote": ("10310", "pierce"), # 拉曼却 · 骑枪
    "char_limbus_ryoshu":     ("10415", "slash"),  # 蜘蛛巢之刃 · 刀
    "char_limbus_meursault":  ("10512", "blunt"),  # 拇指指挥官 · 巨锤
    "char_limbus_honglu":     ("10613", "pierce"), # 鸿园君主 · 枪
    "char_limbus_heathcliff": ("10710", "blunt"),  # 狂猎 · 战锤
    "char_limbus_ishmael":    ("10808", "blunt"),  # 船长 · 锚
    "char_limbus_rodion":     ("10913", "slash"),  # 泪锋之剑 · 剑
    "char_limbus_sinclair":   ("11005", "pierce"), # 准执柄者 · 骑枪
    "char_limbus_outis":      ("11107", "gun"),    # 魔弹 · 枪
    "char_limbus_gregor":     ("11216", "slash"),  # 黎明代表 · 臂刃
}

# shared short combat SFX (all in SFX_1), by weapon class
ATTACK_SFX   = {"slash": "Sword_Hori",  "pierce": "Sword_Stab", "blunt": "Roland_Mace",  "gun": "PistolShot"}
SKILL_BACKUP = {"slash": "Purple_Slash_VertDown", "pierce": "Mass_Stab", "blunt": "SFX_Iron_Hit", "gun": "PistolShot"}


def build_index():
    """name -> (bank_sample) across every SFX bank; first occurrence wins."""
    index = {}
    for path in sorted(glob.glob(os.path.join(BANK_DIR, "SFX_*.assets.bank"))):
        data = open(path, "rb").read()
        start = 0
        while True:
            idx = data.find(b"FSB5", start)
            if idx < 0: break
            try:
                fsb = fsb5.FSB5(data[idx:])
                for s in fsb.samples:
                    index.setdefault(s.name, (fsb, s))
            except Exception:
                pass
            start = idx + 4
    return index


def write_ogg(fsb, sample, out_path):
    ogg = bytes(fsb.rebuild_sample(sample))      # bytes() detaches the memoryview before BytesIO is freed
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as fh:
        fh.write(ogg)
    return len(ogg)


def main():
    index = build_index()
    print(f"indexed {len(index)} SFX samples\n")
    units = {}
    for char, (ident, weapon) in OPS.items():
        out_dir = os.path.join(OUT_ROOT, char)
        unit = {}

        # basic attack — weapon-class swing/stab/blunt/gunshot
        aname = ATTACK_SFX[weapon]
        if aname in index:
            write_ogg(*index[aname], os.path.join(out_dir, "attack.ogg"))
            unit["attack"] = f"{URL_ROOT}/{char}/attack.ogg"

        # NOTE: the per-identity EGO cut-in (SFX_N, 8s stereo) was intentionally DROPPED
        # as a `skill` SFX — it is a long, loud musical sting and was overwhelming in combat
        # (user feedback 2026-10-10). Basic-attack SFX only.

        units[char] = unit
        print(f"{char:26} attack={aname}")

    print("\n--- audio.sfx.units (merge into mods/limbus-company/data/assets.json) ---")
    print(json.dumps({"audio": {"sfx": {"units": units}}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
