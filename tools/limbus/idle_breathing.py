"""
Give the frame-built Limbus spines a living idle.

The frame->spine pipeline makes every animation a pure attachment swap on a
single `root` bone; the "idle" clip is ONE attachment keyframe, so a deployed
operator stands perfectly frozen ("特别死板"). Arknights operators breathe.

Since the skeleton is one bone + one image, we synthesize breathing by keying a
gentle vertical scale on `root` (the bone origin sits at the feet, so the body
rises/settles from a planted base) with a tiny opposing horizontal squash so it
reads as volume, not zoom. Linear interpolation over many samples of a raised-
cosine so we never depend on a particular curve-encoding of the vendored
pixi-spine reader.

Used by make_unit_clips.py at generation time, and runnable standalone to patch
the 12 spines already on disk:

    python tools/limbus/idle_breathing.py            # patch all under the mod
    python tools/limbus/idle_breathing.py a.json b.json
"""
import os, sys, json, math, glob

PERIOD = 2.8      # seconds per breath (calm resting rate)
AMP_Y  = 0.020    # +2.0% peak height
AMP_X  = 0.006    # -0.6% peak width (opposing squash)
SAMPLES = 14      # linear samples of the cosine per cycle


def breathing_bones(period=PERIOD, amp_y=AMP_Y, amp_x=AMP_X, samples=SAMPLES):
    """Spine bone timeline for `root`: a raised-cosine breath, start==end so it loops seamlessly."""
    scale = []
    for i in range(samples + 1):
        t = period * i / samples
        env = (1 - math.cos(2 * math.pi * i / samples)) / 2   # 0 -> 1 -> 0
        key = {"time": round(t, 4),
               "x": round(1 - amp_x * env, 5),
               "y": round(1 + amp_y * env, 5)}
        scale.append(key)
    return {"root": {"scale": scale}}


def patch_spine(path):
    """Inject (or refresh) the breathing timeline into a spine json's idle animation."""
    with open(path, "r", encoding="utf-8") as fh:
        sp = json.load(fh)
    anims = sp.get("animations") or {}
    idle = anims.get("idle")
    if idle is None:
        return False
    idle["bones"] = breathing_bones()
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(sp, fh, ensure_ascii=False, separators=(",", ":"))
    return True


def _default_targets():
    root = os.path.join(os.path.dirname(__file__), "..", "..",
                        "mods", "limbus-company", "assets", "spine", "op")
    return sorted(glob.glob(os.path.join(root, "char_limbus_*", "front", "*.json")))


if __name__ == "__main__":
    targets = sys.argv[1:] or _default_targets()
    done = 0
    for p in targets:
        if os.path.basename(p) == "assets_entry.json":
            continue
        if patch_spine(p):
            done += 1
            print("breathing:", os.path.relpath(p))
        else:
            print("no idle anim, skipped:", os.path.relpath(p))
    print(f"\npatched {done} spine(s)")
