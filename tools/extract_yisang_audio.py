import os, struct, wave
from enum import IntEnum
import fsb5

class ExtendedSoundFormat(IntEnum):
    NONE = 0
    PCM8 = 1
    PCM16 = 2
    PCM24 = 3
    PCM32 = 4
    PCMFLOAT = 5
    GCADPCM = 6
    IMAADPCM = 7
    VAG = 8
    HEVAG = 9
    XMA = 10
    MPEG = 11
    CELT = 12
    AT9 = 13
    XWMA = 14
    VORBIS = 15
    FADPCM = 16
    @property
    def file_extension(self): return "ogg" if self == 15 else "bin"
    @property
    def is_pcm(self): return False

fsb5.SoundFormat = ExtendedSoundFormat

fadpcm_coefs = [
    (0, 0),
    (60, 0),
    (122, 60),
    (115, 52),
    (98, 55),
    (0, 0),
    (0, 0),
]

def clamp16(val):
    if val > 32767: return 32767
    if val < -32768: return -32768
    return val

def decode_fadpcm(raw_data):
    out_pcm = []
    bytes_per_frame = 0x8c
    total_frames = len(raw_data) // bytes_per_frame

    for frame_idx in range(total_frames):
        frame = raw_data[frame_idx * bytes_per_frame : (frame_idx + 1) * bytes_per_frame]
        coefs, shifts, hist1, hist2 = struct.unpack("<IIhh", frame[:0xc])

        for i in range(8):
            index = ((coefs >> (i * 4)) & 0xf) % 7
            shift = (shifts >> (i * 4)) & 0xf
            coef1, coef2 = fadpcm_coefs[index]
            shift = 22 - shift

            for j in range(4):
                nibbles = struct.unpack("<I", frame[0xc + i * 16 + j * 4 : 0xc + i * 16 + (j + 1) * 4])[0]
                for k in range(8):
                    nib = (nibbles >> (k * 4)) & 0xf
                    if nib >= 8: nib -= 16
                    s = (nib << 28) >> 28
                    scaled = (s << 28) >> shift
                    samp = (scaled - hist2 * coef2 + hist1 * coef1) >> 6
                    samp = clamp16(samp)
                    out_pcm.append(samp)
                    hist2 = hist1
                    hist1 = samp
    return struct.pack(f"<{len(out_pcm)}h", *out_pcm)

def save_wav(out_path, pcm_bytes, freq, channels=1):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with wave.open(out_path, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(freq)
        wf.writeframes(pcm_bytes)

def extract_voices():
    bank_path = r"D:\app1\game\steamapps\common\Limbus Company\LimbusCompany_Data\StreamingAssets\Assets\Sound\FMODBuilds\Desktop\Voice_Default_S2_3.assets.bank"
    out_dir = r"d:\build\Stronghold-Protocol-4PR\mods\limbus-company\assets\audio\voice\cn\char_limbus_yisang"
    os.makedirs(out_dir, exist_ok=True)

    with open(bank_path, "rb") as f:
        data = f.read()

    idx = data.find(b"FSB5")
    fsb = fsb5.FSB5(data[idx:])

    # Map Limbus voice IDs to Arknights voice slot names
    mapping = {
        "formation_10104_1": "start.wav",
        "battle_endcommand_10104_1": "faceEnemy.wav",
        "battleentry_10104_1": "place.wav",
        "battle_select_10104_1": "select.wav",
        "battle_s2_10104_1_1": "skill1.wav",
        "battle_s2_10104_1_4": "skill2.wav",
        "battle_s3_10104_1_1": "skill3.wav",
        "battle_dead_10104_1": "die.wav",
        "battle_clear_10104_1": "resultThree.wav",
        "battle_clear_ex_10104_1": "resultFour.wav",
        "battle_defeat_10104_1": "resultLose.wav",
    }

    sample_dict = {s.name: s for s in fsb.samples}

    for limbus_name, slot_file in mapping.items():
        if limbus_name in sample_dict:
            s = sample_dict[limbus_name]
            pcm = decode_fadpcm(s.data)
            target = os.path.join(out_dir, slot_file)
            save_wav(target, pcm, s.frequency, s.channels)
            print(f"Exported voice: {slot_file} from {limbus_name} ({len(pcm)} bytes, {s.frequency}Hz)")

def extract_sfx():
    bank_path = r"D:\app1\game\steamapps\common\Limbus Company\LimbusCompany_Data\StreamingAssets\Assets\Sound\FMODBuilds\Desktop\SFX_3.assets.bank"
    out_dir = r"d:\build\Stronghold-Protocol-4PR\mods\limbus-company\assets\audio\sfx\char_limbus_yisang"
    os.makedirs(out_dir, exist_ok=True)

    with open(bank_path, "rb") as f:
        data = f.read()

    idx = data.find(b"FSB5")
    fsb = fsb5.FSB5(data[idx:])
    sample_dict = {s.name: s for s in fsb.samples}

    if "10104" in sample_dict:
        s = sample_dict["10104"]
        # Vorbis sample
        ogg_bytes = fsb.rebuild_sample(s)
        target = os.path.join(out_dir, "skill_3.ogg")
        with open(target, "wb") as of:
            of.write(ogg_bytes)
        print(f"Exported SFX: {target} ({len(ogg_bytes)} bytes)")

if __name__ == "__main__":
    extract_voices()
    extract_sfx()
