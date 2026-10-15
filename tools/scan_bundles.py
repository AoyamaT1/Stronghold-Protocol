import os, sys, time
from concurrent.futures import ProcessPoolExecutor
import UnityPy

UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.12f1"

def scan_bundle(path):
    try:
        env = UnityPy.load(path)
        hits = []
        for obj in env.objects:
            c = getattr(obj, "container", None)
            if c and ("10104" in c or "spicebush" in c.lower()):
                hits.append((obj.type.name, c))
            elif obj.type.name in ["TextAsset", "Texture2D", "Sprite", "GameObject", "MonoBehaviour"]:
                try:
                    d = obj.read()
                    n = getattr(d, "name", "")
                    if n and ("10104" in n or "spicebush" in n.lower()):
                        hits.append((obj.type.name, n))
                except:
                    pass
        if hits:
            return (path, hits)
    except:
        pass
    return None

def main():
    root = r"D:\die\ProjectMoon\ProjectMoon_LimbusCompany"
    data_files = []
    for p in os.listdir(root):
        full = os.path.join(root, p)
        if os.path.isdir(full):
            for sub in os.listdir(full):
                df = os.path.join(full, sub, "__data")
                if os.path.isfile(df):
                    data_files.append(df)

    t0 = time.time()
    print(f"Scanning {len(data_files)} bundles with 10 workers...", flush=True)
    results = []
    with ProcessPoolExecutor(max_workers=10) as executor:
        for res in executor.map(scan_bundle, data_files, chunksize=5):
            if res:
                print("MATCH FOUND IN:", res[0], flush=True)
                for h in res[1][:10]:
                    print("  ", h, flush=True)
                results.append(res)
    t1 = time.time()
    print(f"Done in {t1 - t0:.2f}s! Found {len(results)} bundles with matches.", flush=True)

if __name__ == "__main__":
    main()
