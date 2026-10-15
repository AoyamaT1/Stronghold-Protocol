"""
Extract per-identity 中文 battle voices for all 12 Limbus sinners from the local
Limbus Company FMOD voice banks, into the Arknights voice-slot layout the engine
expects:  mods/limbus-company/assets/audio/voice/cn/<charId>/<slot>.wav

Why this exists: 10 of 12 operators were shipping byte-identical COPIES of Yi
Sang's voice (only yisang + sinclair had been extracted). This script replaces
them all with each sinner's own lines, keyed by the design identity ID.

Source: Voice_Default_*.assets.bank (FSB5 / FADPCM). The design identities live
across the season banks (yisang=S2, donq=S5, ...), so we scan every Voice_Default
bank and pick the clips by name.

Run:  python tools/limbus/extract_voices.py            # all 12
      python tools/limbus/extract_voices.py yisang faust   # a subset
"""
import os, sys, glob, struct, wave
from enum import IntEnum
import fsb5

BANK_DIR = r"D:\app1\game\steamapps\common\Limbus Company\LimbusCompany_Data\StreamingAssets\Assets\Sound\FMODBuilds\Desktop"
OUT_ROOT = r"d:\build\Stronghold-Protocol-4PR\mods\limbus-company\assets\audio\voice\cn"

# charId  ->  design identity ID (see GUIDE-帧转Spine流水线.md §0 / HANDOFF 阶位表)
IDENTITY = {
    "char_limbus_yisang":     "10104",  # 山茶花        S2
    "char_limbus_faust":      "10212",  # 黑兽·卯魁首   S6
    "char_limbus_donquixote": "10310",  # 拉曼却领总督  S5
    "char_limbus_ryoshu":     "10415",  # 蜘蛛巢之刃    S7
    "char_limbus_meursault":  "10512",  # 拇指东部指挥官 S6
    "char_limbus_honglu":     "10613",  # 鸿园的君主    S6
    "char_limbus_heathcliff": "10710",  # 狂猎          S4
    "char_limbus_ishmael":    "10808",  # 裴廓德号船长  S3
    "char_limbus_rodion":     "10913",  # 泪锋之剑      S6
    "char_limbus_sinclair":   "11005",  # 准执柄者      Default
    "char_limbus_outis":      "11107",  # 魔弹          S3
    "char_limbus_gregor":     "11216",  # 黎明事务所代表 S7
}

# ---- FSB5 FADPCM decode (proven path from extract_sinclair_audio.py) ----------
class ExtendedSoundFormat(IntEnum):
    NONE=0; PCM8=1; PCM16=2; PCM24=3; PCM32=4; PCMFLOAT=5; GCADPCM=6; IMAADPCM=7
    VAG=8; HEVAG=9; XMA=10; MPEG=11; CELT=12; AT9=13; XWMA=14; VORBIS=15; FADPCM=16
    @property
    def file_extension(self): return "ogg" if self == 15 else "bin"
    @property
    def is_pcm(self): return False

fsb5.SoundFormat = ExtendedSoundFormat

_FADPCM_COEFS = [(0,0),(60,0),(122,60),(115,52),(98,55),(0,0),(0,0)]

def _clamp16(v): return 32767 if v > 32767 else (-32768 if v < -32768 else v)

def decode_fadpcm(raw):
    out = []
    bpf = 0x8c
    for fi in range(len(raw) // bpf):
        frame = raw[fi*bpf:(fi+1)*bpf]
        coefs, shifts, hist1, hist2 = struct.unpack("<IIhh", frame[:0xc])
        for i in range(8):
            index = ((coefs >> (i*4)) & 0xf) % 7
            shift = 22 - ((shifts >> (i*4)) & 0xf)
            c1, c2 = _FADPCM_COEFS[index]
            for j in range(4):
                nibbles = struct.unpack("<I", frame[0xc+i*16+j*4:0xc+i*16+(j+1)*4])[0]
                for k in range(8):
                    nib = (nibbles >> (k*4)) & 0xf
                    if nib >= 8: nib -= 16
                    s = (nib << 28) >> 28
                    scaled = (s << 28) >> shift
                    samp = _clamp16((scaled - hist2*c2 + hist1*c1) >> 6)
                    out.append(samp); hist2 = hist1; hist1 = samp
    return struct.pack(f"<{len(out)}h", *out)

def save_wav(path, pcm, freq, channels=1):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(channels); wf.setsampwidth(2); wf.setframerate(freq)
        wf.writeframes(pcm)

# ---- bank index: name -> sample, scanned once across all voice banks ----------
def build_sample_index():
    index = {}
    for path in sorted(glob.glob(os.path.join(BANK_DIR, "Voice_Default_*.assets.bank"))):
        data = open(path, "rb").read()
        start = 0
        while True:
            idx = data.find(b"FSB5", start)
            if idx < 0: break
            try:
                for s in fsb5.FSB5(data[idx:]).samples:
                    index.setdefault(s.name, s)  # first bank wins; names are unique per id
            except Exception:
                pass
            start = idx + 4
    return index

def first(index, *names):
    for n in names:
        if n in index: return n
    return None

def _skill_takes(idx, cid, s):
    """Primary skill-voice takes for `battle_s<2|3>_<id>_...`, both naming styles
    (`..._1_1` cut into parts, or `..._1` flat). Drop `-NN` continuation sub-takes."""
    pre = f"battle_s{s}_{cid}_"
    return sorted(n for n in idx if n.startswith(pre) and "-" not in n[len(pre):])

def slot_map(idx, cid):
    """Clip name per Arknights slot for identity `cid`, skipping absent ones."""
    s2 = _skill_takes(idx, cid, 2)
    s3 = _skill_takes(idx, cid, 3)
    return {
        "start.wav":       first(idx, f"formation_{cid}_1"),
        "faceEnemy.wav":   first(idx, f"battle_endcommand_{cid}_1"),
        "place.wav":       first(idx, f"battleentry_{cid}_1"),
        "select.wav":      first(idx, f"battle_select_{cid}_1"),
        "skill1.wav":      (s2[0] if s2 else (s3[0] if s3 else None)),
        "skill2.wav":      (s2[-1] if len(s2) > 1 else (s3[0] if s3 else (s2[0] if s2 else None))),
        "skill3.wav":      (s3[-1] if s3 else (s2[-1] if s2 else None)),
        "die.wav":         first(idx, f"battle_dead_{cid}_1"),
        "resultThree.wav": first(idx, f"battle_clear_{cid}_1"),
        "resultFour.wav":  first(idx, f"battle_clear_ex_{cid}_1", f"battle_clear_{cid}_1"),
        "resultLose.wav":  first(idx, f"battle_defeat_{cid}_1"),
    }

def main(argv):
    want = argv[1:]
    chars = [c for c in IDENTITY if (not want or c.replace("char_limbus_", "") in want or c in want)]
    index = build_sample_index()
    print(f"indexed {len(index)} voice samples across banks\n")
    for cid_char in chars:
        cid = IDENTITY[cid_char]
        out_dir = os.path.join(OUT_ROOT, cid_char)
        mapping = slot_map(index, cid)
        got = miss = 0
        for slot_file, clip in mapping.items():
            if clip and clip in index:
                s = index[clip]
                save_wav(os.path.join(out_dir, slot_file), decode_fadpcm(s.data), s.frequency, s.channels)
                got += 1
            else:
                miss += 1
                print(f"  [{cid_char}] MISSING {slot_file} (looked for id {cid})")
        print(f"{cid_char:26} id={cid}  {got}/{got+miss} slots")

if __name__ == "__main__":
    main(sys.argv)
