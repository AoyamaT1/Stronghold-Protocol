// validate_spine.mjs — 无头加载生成的 Spine 骨架，检查结构与脚底锚点。
// 用法: node tools/limbus/validate_spine.mjs <spineDir> <baseName>
import fs from 'node:fs';
import path from 'node:path';
const [dir, base] = process.argv.slice(2);
const base_rt = await import('@pixi-spine/base');
const rt = await import('@pixi-spine/runtime-3.8');
const atlasText = fs.readFileSync(path.join(dir, base + '.atlas'), 'utf8');
const jsonObj = JSON.parse(fs.readFileSync(path.join(dir, base + '.json'), 'utf8'));
const atlas = new base_rt.TextureAtlas(atlasText, () => ({}));
console.log(`atlas regions = ${atlas.regions.length}`);
const loader = new rt.AtlasAttachmentLoader(atlas);
const data = new rt.SkeletonJson(loader).readSkeletonData(jsonObj);
console.log(`skeleton ok: bones=${data.bones.length} slots=${data.slots.length}`);
console.log(`anims: ${data.animations.map(a => a.name).join(' / ')}`);
const sk = new rt.Skeleton(data);
sk.setToSetupPose(); sk.updateWorldTransform();
const slot = sk.slots[0];
for (const nm of ['idle', 'dmg', 'gud', 'dead', 'skill1_1', 'skill3_20']) {
  const a = data.defaultSkin?.getAttachment?.(slot.data.index, nm);
  if (!a) { console.log(`  ${nm.padEnd(10)} —`); continue; }
  const v = new Float32Array(8);
  try { a.computeWorldVertices(slot, v, 0, 2); } catch (e) { console.log(`  ${nm.padEnd(10)} compute 失败: ${e.message}`); continue; }
  const xs = [v[0], v[2], v[4], v[6]], ys = [v[1], v[3], v[5], v[7]];
  console.log(`  ${nm.padEnd(10)} x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}   y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}`);
}
