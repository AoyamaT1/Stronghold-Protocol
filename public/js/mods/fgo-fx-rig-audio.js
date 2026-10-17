// public/js/mods/fgo-fx-rig-audio.js — FGO 圆桌模组的演出与混音层（宝具横幅 / 释放点燃 / 连环枪影 / 痛哭幻奏 / 十三拘束 / BGM Ducking）
//
// 定位：
//   1. 屏幕空间叙事性演出：宝具真名解放横幅、圆桌议决的十三拘束法阵、宝具期间的 BGM 压低（Audio Ducking）。
//   2. 单位燃点特效（Noble Phantasm Ignition）：宝具发动瞬间在释放干员身上加持极为华丽的燃点光柱、烈焰升腾粒子流与地面圣法阵，明确传达宝具解放感。
//   3. 专属武器编舞：
//      - 珀西瓦尔 S3「光耀的命运之枪」：密集穿刺的连环枪影（Multi-thrust Spear Shadows）与圣枪贯穿光暴。
//      - 崔斯坦 S3「痛哭幻奏」：弹拨音波震荡、7 连发超音速真空风刃疾射、在目标身上交错斩击与终结 X 裂痕。
//      - 高文/兰斯洛特/莫德雷德/妖崔/阿尔托莉雅/美露莘等干员专属宝具视效强化。
//
// 零外部图片依赖：全部采用 Canvas FX 图集程序化纹理与 PIXI.Graphics 动态绘制，零外部素材加载。

/** 15 名干员的宝具（S3）→ 横幅文案与主题色彩。 */
const NP_BANNER = Object.freeze({
  garethS3: { op: '加雷斯', np: '狂暴少女狼', color: 0xff5a4a },
  bedivereS3: { op: '贝德维尔', np: '紧握其剑，银之臂', color: 0x80ffdb },
  tristanS3: { op: '崔斯坦', np: '痛哭幻奏', color: 0xd2fbf0 },
  percivalS3: { op: '珀西瓦尔', np: '光耀的命运之枪', color: 0x74b9ff },
  baobhanS3: { op: '妖精骑士崔斯坦', np: '痛幻哭奏', color: 0xb53471 },
  gawainS3: { op: '高文', np: '轮转胜利之剑', color: 0xffb142 },
  barghestS3: { op: '妖精骑士高文', np: '捕食日轮之角', color: 0xff5252 },
  mashS3Form1: { op: '玛修·基列莱特', np: '如今仍是遥远的理想之城', color: 0xf8efba },
  mashS3Form2: { op: '玛修·基列莱特', np: '印证希望的人理之剑', color: 0x74b9ff },
  lancelotS3: { op: '兰斯洛特', np: '缚锁全断·过重湖光', color: 0x2e86de },
  mordredS3: { op: '莫德雷德', np: '对吾华丽父王的叛逆', color: 0xff1e42 },
  melusineS3Beam: { op: '妖精骑士兰斯洛特', np: '无人知晓的无垢搏动', color: 0xff3f34 },
  artoriaExcalibur: { op: '阿尔托莉雅·潘德拉贡', np: '誓约胜利之剑', color: 0xffe066 },
  merlinAvalon: { op: '梅林', np: '永世隔绝的理想乡', color: 0xfda7df },
  castoriaS3: { op: '阿尔托莉雅·卡斯特', np: '真圆集结誓约之星', color: 0x74b9ff },
  morganS3: { op: '摩根', np: '业已无法抵达的理想乡', color: 0x341f97 }
});

/**
 * 横幅字面用的中文字体栈 —— 与 `public/css/theme.css` 的 `--cjk-faces` 同源（思源黑体优先，系统黑体兜底）。
 * 原来写死 `'sans-serif'`，等于把项目的中文字体约定丢了，出来的是浏览器默认的细体，撑不起宝具字幕的分量。
 * 走 Pixi 的 canvas 字体栈，所以直接写成 CSS font-family 的字符串。
 *
 * 注：FGO 原版的宝具名是**预渲染的字幕图**（每个宝具一张，风格各异），拿不到可用的字体文件；
 * UI 字体 FOT-Rodin Pro 是 Fontworks 的商业字体，不能随本仓分发。思源黑体 900 是能自由使用的、
 * 视觉上最接近那一档粗黑体的选择。
 */
const CJK_FACE = "'Noto Sans SC', 'Microsoft YaHei', 'Source Han Sans SC', 'PingFang SC', sans-serif";

/** 会额外触发全屏圣光环的盟约事件。 */
const BURST_KINDS = new Set(['skySupportBurst']);
/** 圆桌议决 → 十三拘束法阵。 */
const DECISION_KIND = 'roundTableDecision';

const BANNER_DUR = 0.9;      // 宝具解放横幅 0.9 秒
const RESTRAINT_DUR = 3.2;   // 法阵停留时间
const DUCK_MULT = 0.60;      // 宝具期间 BGM 压到 60%
const DUCK_SEC = 3.5;

/**
 * @param {{ P: any, layer: any, screenSize: () => {width:number,height:number},
 *           ticker: { add: Function, remove: Function },
 *           isPaused?: () => boolean, audio?: any,
 *           fx?: any, views?: Map<string|number, any>, cam?: () => any, layers?: any }} ctx
 */
export function installFgoFx(ctx) {
  const P = ctx?.P;
  const layer = ctx?.layer;
  if (!P || !layer) return { handle() {}, destroy() {} };

  const ticker = ctx.ticker;
  const fxSys = ctx.fx || null;
  const views = ctx.views || null;
  const camFn = typeof ctx.cam === 'function' ? ctx.cam : () => null;
  const layers = ctx.layers || null;

  const paused = () => (typeof ctx.isPaused === 'function' ? !!ctx.isPaused() : false);
  const size = () => (typeof ctx.screenSize === 'function' ? ctx.screenSize() : { width: 800, height: 600 });

  const activeCleanups = new Set();

  /** 挂到 ticker 的一次性动画；暂停时不推进，返回的 stop 可主动注销 */
  function animate(step) {
    const fn = () => {
      if (paused()) return;
      step();
    };
    ticker?.add?.(fn);
    const stop = () => {
      ticker?.remove?.(fn);
      activeCleanups.delete(stop);
    };
    activeCleanups.add(stop);
    return stop;
  }

  function makeText(str, style) {
    if (typeof P.Text !== 'function') return null;
    try {
      const t = new P.Text(str, style);
      t.anchor?.set?.(0, 0.5);
      return t;
    } catch {
      return null;
    }
  }

  // ---- 宝具解放横幅 ---------------------------------------------------------------------------------------
  let banner = null;

  function showBanner(op, np) {
    if (banner) return;
    const { width } = size();
    const h = 84;
    const y = Math.round(size().height * 0.24);

    const box = new P.Container();
    box.position.set(-width, y);

    // 背景保持透明：横幅横贯整个屏幕，实心底（曾经是 0x111116 @0.88）会把战场盖掉大半
    // （用户 2026-10-16「播报太挡视野」）。只描金色外框，文字靠自己的描边/光晕在战场上保持可读。
    const bg = new P.Graphics();
    bg.lineStyle(3, 0xd4af37, 1);
    bg.drawPolygon([-60, -h / 2, width + 60, -h / 2, width + 20, h / 2, -100, h / 2]);
    const bar = new P.Graphics();
    bar.beginFill(0xffd700, 0.7);
    bar.drawPolygon([-80, h / 2 - 6, width + 40, h / 2 - 6, width + 30, h / 2 - 2, -90, h / 2 - 2]);
    bar.endFill();
    box.addChild(bg, bar);

    const opText = makeText(op, {
      fontFamily: CJK_FACE, fontSize: 18, fontWeight: '900', fill: 0xd4af37, letterSpacing: 3,
      stroke: 0x1a1a24, strokeThickness: 4,
    });
    if (opText) { opText.position.set(46, -h / 2 + 16); box.addChild(opText); }

    // 宝具名画两层：底下那层是同色的粗描边，压成半透明当作光晕（FGO 字幕的发光感），
    // 上面才是正字。顺序不能反 —— 光晕必须垫在正字下面才不糊字形。
    const npGlow = makeText(np, {
      fontFamily: CJK_FACE, fontSize: 27, fontWeight: '900', fill: 0xffd700,
      stroke: 0xffd700, strokeThickness: 13, letterSpacing: 4,
    });
    if (npGlow) { npGlow.position.set(46, 10); npGlow.alpha = 0.34; box.addChild(npGlow); }

    const npText = makeText(np, {
      fontFamily: CJK_FACE, fontSize: 27, fontWeight: '900', fill: 0xfff4c0,
      stroke: 0x141a22, strokeThickness: 5, letterSpacing: 4,
    });
    if (npText) { npText.position.set(46, 10); box.addChild(npText); }

    layer.addChild(box);
    banner = box;

    duckBgm();

    const t0 = performance.now();
    const stop = animate(() => {
      const el = (performance.now() - t0) / 1000;
      if (el < 0.2) { box.position.x = -width * (1 - el / 0.2); box.alpha = 1; }
      else if (el < BANNER_DUR - 0.2) { box.position.x = 0; box.alpha = 1; }
      else if (el < BANNER_DUR) { const t = (el - (BANNER_DUR - 0.2)) / 0.2; box.alpha = 1 - t; box.position.x = 80 * t; }
      else { stop(); box.parent?.removeChild(box); box.destroy({ children: true }); banner = null; }
    });
  }

  // ---- 十三拘束法阵 ---------------------------------------------------------------------------------------
  let sealCircle = null;

  function drawRestraints() {
    if (sealCircle) { sealCircle.destroy({ children: true }); sealCircle = null; }
    const { width, height } = size();
    const cx = width / 2, cy = height * 0.55, R = Math.max(90, Math.min(width, height) * 0.24);

    const box = new P.Container();
    box.position.set(cx, cy);
    box.alpha = 0;

    const g = new P.Graphics();
    g.lineStyle(2, 0xffd700, 0.45);
    g.drawCircle(0, 0, R);
    g.drawCircle(0, 0, R - 16);
    g.drawCircle(0, 0, R * 0.45);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * (R - 8), y = Math.sin(a) * (R - 8);
      g.beginFill(0xffdf00, 0.85);
      g.lineStyle(2, 0xffffff, 1);
      g.drawCircle(x, y, 7);
      g.endFill();
    }
    box.addChild(g);
    layer.addChild(box);
    sealCircle = box;

    const t0 = performance.now();
    const stop = animate(() => {
      const el = (performance.now() - t0) / 1000;
      if (el >= RESTRAINT_DUR) { stop(); box.parent?.removeChild(box); box.destroy({ children: true }); sealCircle = null; return; }
      box.alpha = el < 0.25 ? el / 0.25 : (el > RESTRAINT_DUR - 0.6 ? (RESTRAINT_DUR - el) / 0.6 : 1);
      box.rotation += 0.006;
    });
  }

  // ---- 圣光爆发环 -----------------------------------------------------------------------------------------
  function holyBurst(x, y, color = 0xffd700, radius = 90, count = 12) {
    const box = new P.Container();
    box.position.set(x, y);
    const ring = new P.Graphics();
    ring.lineStyle(3, color, 0.85);
    ring.drawCircle(0, 0, radius * 0.4);
    box.addChild(ring);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const ray = new P.Graphics();
      ray.lineStyle(2, 0xffffff, 0.9);
      ray.moveTo(Math.cos(a) * radius * 0.2, Math.sin(a) * radius * 0.2);
      ray.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      box.addChild(ray);
    }
    layer.addChild(box);
    const t0 = performance.now();
    const stop = animate(() => {
      const t = (performance.now() - t0) / 1000 / 0.35;
      if (t >= 1) { stop(); box.parent?.removeChild(box); box.destroy({ children: true }); return; }
      box.scale.set(1 + t * 0.6);
      box.alpha = 1 - t;
    });
  }

  // ---- BGM Ducking ----------------------------------------------------------------------------------------
  let ducking = false;

  function duckBgm() {
    const am = ctx.audio;
    const gain = am?.bgmGain?.gain || am?.channels?.bgm?.gain;
    const actx = am?.ctx;
    if (ducking || !gain || !actx || typeof gain.linearRampToValueAtTime !== 'function') return;
    ducking = true;
    const now = actx.currentTime;
    const orig = gain.value;
    try {
      gain.cancelScheduledValues(now);
      gain.linearRampToValueAtTime(orig * DUCK_MULT, now + 0.3);
      gain.setValueAtTime(orig * DUCK_MULT, now + DUCK_SEC - 0.5);
      gain.linearRampToValueAtTime(orig, now + DUCK_SEC);
    } catch { /* 音频节点状态异常：忽略 */ }
    setTimeout(() => { ducking = false; }, DUCK_SEC * 1000);
  }

  // ---- 单位释放宝具燃点特效 (Noble Phantasm Ignition) --------------------------------------------------------
  function igniteNoblePhantasm(unitId, x, y, tint = 0xffd700) {
    if (!fxSys) return;
    const view = views?.get?.(unitId) || null;
    const gx = view ? view.x : (Number(x) || 0);
    const gy = view ? view.y : (Number(y) || 0);
    const gz = view ? (view.z || 0) : 0;

    const camera = camFn();
    const pFeet = camera?.project ? camera.project(gx, gy, gz) : { x: 400, y: 300, s: 64 };
    const pChest = camera?.project ? camera.project(gx, gy, gz + 0.5) : { x: pFeet.x, y: pFeet.y - 30, s: pFeet.s };
    const s = Math.max(24, Math.min(120, pFeet.s || 64));

    // 1. 地面双重圣辉金波 / 角色色彩震波
    try {
      fxSys.ring?.(gx, gy, gz, 0.35, 2.4, 0xffd700, 0.85);
      fxSys.ring?.(gx, gy, gz, 0.15, 1.8, tint, 0.65);
    } catch {}

    // 2. 地面旋转圣法阵
    const groundLayer = layers?.groundFx || layers?.fxAdd;
    if (groundLayer && typeof P.Graphics === 'function') {
      try {
        const circleBox = new P.Container();
        const pGround = camera?.project ? camera.project(gx, gy, gz) : pFeet;
        circleBox.position.set(pGround.x, pGround.y);
        const g = new P.Graphics();
        const rad = s * 0.9;
        g.lineStyle(2, 0xffd700, 0.85);
        g.drawCircle(0, 0, rad);
        g.lineStyle(1.5, tint, 0.7);
        g.drawCircle(0, 0, rad * 0.65);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.moveTo(Math.cos(a) * rad * 0.4, Math.sin(a) * rad * 0.4);
          g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        circleBox.addChild(g);
        groundLayer.addChild(circleBox);

        const t0 = performance.now();
        const stopRune = animate(() => {
          const el = (performance.now() - t0) / 1000;
          if (el >= 0.9) {
            stopRune();
            circleBox.parent?.removeChild(circleBox);
            circleBox.destroy({ children: true });
            return;
          }
          circleBox.alpha = Math.max(0, 1 - el / 0.9);
          circleBox.rotation += 0.04;
          circleBox.scale.set(0.8 + el * 0.5);
        });
      } catch {}
    }

    // 3. 冲天光柱（双层：外层角色主题色光柱 + 内层白热纯炽光柱）
    try {
      if (typeof fxSys.particle === 'function') {
        fxSys.particle('pillar', pFeet.x, pFeet.y, {
          tint,
          life: 0.85,
          s0: (s / 64) * 1.6,
          s1: (s / 64) * 0.3,
          a0: 1.0,
          a1: 0,
          ay: 1.0,
          vx: 0,
          vy: -45 * (s / 64)
        });
        fxSys.particle('pillar', pFeet.x, pFeet.y, {
          tint: 0xffffff,
          life: 0.65,
          s0: (s / 64) * 0.9,
          s1: (s / 64) * 0.15,
          a0: 1.0,
          a1: 0,
          ay: 1.0,
          vx: 0,
          vy: -60 * (s / 64)
        });
      }
    } catch {}

    // 4. 烈焰升腾升华粒子流（持续分段迸发，金火/烈焰/纯白光辉呼啸而上）
    const spawnEmber = (col, vyScale = 1.0) => {
      if (typeof fxSys.particle !== 'function') return;
      const ox = (Math.random() - 0.5) * s * 0.8;
      const oy = (Math.random() - 0.2) * s * 0.3;
      const tex = Math.random() < 0.4 ? 'flare' : (Math.random() < 0.7 ? 'spark' : 'glow');
      fxSys.particle(tex, pFeet.x + ox, pFeet.y + oy, {
        tint: col,
        life: 0.45 + Math.random() * 0.35,
        s0: (s / 64) * (0.6 + Math.random() * 0.8),
        s1: 0,
        a0: 1.0,
        a1: 0,
        vx: (Math.random() - 0.5) * 60 * (s / 64),
        vy: -(160 + Math.random() * 220) * (s / 64) * vyScale,
        rot: Math.random() * Math.PI * 2
      });
    };

    const colors = [0xffd700, 0xff7a22, 0xffffff, tint];
    for (let i = 0; i < 14; i++) {
      spawnEmber(colors[i % colors.length]);
    }

    const t0 = performance.now();
    let wave = 0;
    const stopEmbers = animate(() => {
      const el = (performance.now() - t0) / 1000;
      if (el >= 0.55 || wave >= 2) {
        stopEmbers();
        return;
      }
      if (el >= 0.18 * (wave + 1)) {
        wave++;
        for (let i = 0; i < 10; i++) {
          spawnEmber(colors[(i + wave) % colors.length], 1.1);
        }
      }
    });

    // 5. 胸口核心星芒炸裂与扩散光环
    try {
      if (typeof fxSys.particle === 'function') {
        fxSys.particle('flare', pChest.x, pChest.y, {
          tint: 0xffffff,
          life: 0.45,
          s0: (s / 128) * 2.2,
          s1: (s / 128) * 0.2,
          a0: 1.0,
          a1: 0,
          rot: Math.PI / 4
        });
        fxSys.particle('flare', pChest.x, pChest.y, {
          tint,
          life: 0.6,
          s0: (s / 128) * 1.8,
          s1: (s / 128) * 0.3,
          a0: 1.0,
          a1: 0,
          rot: 0
        });
        fxSys.particle('glow', pChest.x, pChest.y, {
          tint: 0xffe066,
          life: 0.65,
          s0: (s / 128) * 1.0,
          s1: (s / 128) * 3.0,
          a0: 0.9,
          a1: 0
        });
        fxSys.particle('shock', pChest.x, pChest.y, {
          tint,
          life: 0.4,
          s0: (s / 128) * 0.5,
          s1: (s / 128) * 2.6,
          a0: 1.0,
          a1: 0
        });
      }
      if (typeof fxSys.burst === 'function') {
        fxSys.burst(pChest.x, pChest.y, s, 8, tint, { speed: 2.8, life: 0.45 });
      }
    } catch {}

    // 6. 单位自身顿挫回弹与能量充盈抖动
    if (view?.body?.position) {
      const origY = view.body.position.y;
      const tHop = performance.now();
      const stopHop = animate(() => {
        const el = (performance.now() - tHop) / 1000;
        if (el >= 0.35) {
          stopHop();
          view.body.position.y = origY;
          return;
        }
        const off = Math.sin((el / 0.35) * Math.PI) * (-10);
        view.body.position.y = origY + off;
      });
    }
  }

  // ---- 崔斯坦 S3「痛哭幻奏」专属演出：音波震荡 + 7 段真空风刃交错斩击 ----------------------------------------
  function playTristanFailnaught(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    // 目标定位
    const tgtView = views?.get?.(extra?.target) || null;
    const tx = tgtView ? tgtView.x : (Number(extra?.tx) || (sx + 2));
    const ty = tgtView ? tgtView.y : (Number(extra?.ty) || sy);
    const tz = tgtView ? (tgtView.z || 0) : 0;
    const pTgt = camera?.project ? camera.project(tx, ty, tz + 0.5) : { x: pSrc.x + 200, y: pSrc.y, s };

    // 1. 拨弦音波扩散环
    try {
      fxSys.particle?.('shock', pSrc.x, pSrc.y, { tint: 0xd2fbf0, life: 0.35, s0: 0.3, s1: 2.0, a0: 1, a1: 0 });
      fxSys.particle?.('glow', pSrc.x, pSrc.y, { tint: 0x80ffdb, life: 0.45, s0: 0.6, s1: 2.5, a0: 0.9, a1: 0 });
      fxSys.ring?.(sx, sy, sz, 0.2, 1.6, 0x80ffdb, 0.4);
    } catch {}

    // 2. 7 段高速真空弦刃交错斩击
    const angles = [-42, 38, -68, 52, -18, 72, -45];
    const dx = pTgt.x - pSrc.x, dy = pTgt.y - pSrc.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirAngle = Math.atan2(dy, dx);

    const t0 = performance.now();
    let hitCount = 0;
    const pendingHits = [];

    const stopBarrage = animate(() => {
      const el = (performance.now() - t0) / 1000;
      if (hitCount < 7 && el >= hitCount * 0.05) {
        const i = hitCount++;
        // 飞行真空刃
        try {
          fxSys.particle?.('streak', pSrc.x, pSrc.y, {
            tint: 0xd2fbf0,
            rot: dirAngle,
            life: 0.16,
            s0: (s / 64) * 1.5,
            s1: (s / 64) * 0.8,
            a0: 1.0,
            a1: 0,
            vx: (dx / dist) * 1200,
            vy: (dy / dist) * 1200
          });
          fxSys.particle?.('tracer', pSrc.x, pSrc.y, {
            tint: 0xffffff,
            rot: dirAngle,
            life: 0.14,
            s0: (s / 64) * 1.0,
            s1: (s / 64) * 0.4,
            a0: 1.0,
            a1: 0,
            vx: (dx / dist) * 1250,
            vy: (dy / dist) * 1250
          });
        } catch {}

        pendingHits.push({ i, hitTime: el + 0.04 });
      }

      for (let j = pendingHits.length - 1; j >= 0; j--) {
        const h = pendingHits[j];
        if (el >= h.hitTime) {
          pendingHits.splice(j, 1);
          const i = h.i;
          try {
            const cutRot = (angles[i] * Math.PI) / 180;
            fxSys.particle?.('slash', pTgt.x, pTgt.y, {
              tint: 0x80ffdb,
              rot: cutRot,
              life: 0.32,
              s0: (s / 64) * 1.4,
              s1: (s / 64) * 1.8,
              a0: 1.0,
              a1: 0
            });
            fxSys.particle?.('slash', pTgt.x, pTgt.y, {
              tint: 0xffffff,
              rot: cutRot,
              life: 0.18,
              s0: (s / 64) * 0.9,
              s1: (s / 64) * 1.1,
              a0: 1.0,
              a1: 0
            });
            fxSys.burst?.(pTgt.x, pTgt.y, s, 6, 0xd2fbf0, { speed: 3.2, life: 0.3 });
            fxSys.particle?.('shock', pTgt.x, pTgt.y, {
              tint: 0x80ffdb,
              life: 0.22,
              s0: (s / 128) * 0.3,
              s1: (s / 128) * 1.6,
              a0: 0.9,
              a1: 0
            });

            // 第 7 段终结暴风斩击
            if (i === 6) {
              fxSys.particle?.('slash', pTgt.x, pTgt.y, {
                tint: 0xd2fbf0,
                rot: (45 * Math.PI) / 180,
                life: 0.4,
                s0: (s / 64) * 2.2,
                s1: (s / 64) * 2.6,
                a0: 1.0,
                a1: 0
              });
              fxSys.particle?.('slash', pTgt.x, pTgt.y, {
                tint: 0xffffff,
                rot: (-45 * Math.PI) / 180,
                life: 0.4,
                s0: (s / 64) * 2.2,
                s1: (s / 64) * 2.6,
                a0: 1.0,
                a1: 0
              });
              fxSys.particle?.('shock', pTgt.x, pTgt.y, {
                tint: 0xffffff,
                life: 0.45,
                s0: (s / 128) * 0.5,
                s1: (s / 128) * 3.5,
                a0: 1.0,
                a1: 0
              });
              fxSys.ring?.(tx, ty, tz, 0.3, 2.2, 0x80ffdb, 0.55);
            }
          } catch {}
        }
      }

      if (hitCount >= 7 && pendingHits.length === 0 && el >= 0.5) {
        stopBarrage();
      }
    });
  }

  // ---- 珀西瓦尔 S3「光耀的命运之枪」专属演出：连环枪影 + 圣枪贯穿光暴 --------------------------------------
  function playPercivalSpearFlurry(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    // 计算枪尖突刺的主朝向
    let baseAngle = (srcView?.facing || 1) >= 0 ? 0 : Math.PI;
    const tgtView = views?.get?.(extra?.target) || null;
    if (tgtView) {
      baseAngle = Math.atan2(tgtView.y - sy, tgtView.x - sx);
    } else if (extra?.tx !== undefined && extra?.ty !== undefined) {
      baseAngle = Math.atan2(Number(extra.ty) - sy, Number(extra.tx) - sx);
    }

    // 1. 圣枪蓄力光晕
    try {
      fxSys.particle?.('flare', pSrc.x, pSrc.y, { tint: 0xfff9c4, life: 0.4, s0: 0.8, s1: 2.2, a0: 1, a1: 0 });
      fxSys.particle?.('glow', pSrc.x, pSrc.y, { tint: 0x74b9ff, life: 0.5, s0: 1.0, s1: 2.6, a0: 0.9, a1: 0 });
    } catch {}

    // 2. 密集穿刺的连环枪影（Multi-thrust Spear Shadows, 12 段连刺）
    const t0 = performance.now();
    let thrustCount = 0;
    let burstTriggered = false;

    const stopSpears = animate(() => {
      const el = (performance.now() - t0) / 1000;
      if (thrustCount < 12 && el >= thrustCount * 0.03) {
        thrustCount++;
        const angleJitter = baseAngle + (Math.random() - 0.5) * 0.42;
        const speed = 950 + Math.random() * 250;
        const vx = Math.cos(angleJitter) * speed;
        const vy = Math.sin(angleJitter) * speed;
        const reach = (s * 1.8) + Math.random() * (s * 1.2);

        try {
          // 锐利枪影光轨
          fxSys.particle?.('streak', pSrc.x, pSrc.y, {
            tint: Math.random() < 0.5 ? 0x74b9ff : 0xfff9c4,
            rot: angleJitter,
            life: 0.22,
            s0: (s / 64) * 1.8,
            s1: (s / 64) * 0.4,
            a0: 1.0,
            a1: 0,
            vx,
            vy,
            drag: 2.5
          });
          fxSys.particle?.('tracer', pSrc.x, pSrc.y, {
            tint: 0xffffff,
            rot: angleJitter,
            life: 0.16,
            s0: (s / 64) * 1.2,
            s1: (s / 64) * 0.3,
            a0: 1.0,
            a1: 0,
            vx: vx * 1.1,
            vy: vy * 1.1
          });
          // 枪尖破空星芒
          fxSys.particle?.('spark', pSrc.x + Math.cos(angleJitter) * reach, pSrc.y + Math.sin(angleJitter) * reach, {
            tint: 0xffffff,
            life: 0.2,
            s0: (s / 64) * 0.9,
            s1: 0,
            a0: 1.0,
            a1: 0
          });
        } catch {}
      }

      // 3. 终结圣枪贯穿光暴
      if (!burstTriggered && el >= 0.35) {
        burstTriggered = true;
        try {
          const impactX = sx + Math.cos(baseAngle) * 1.5;
          const impactY = sy + Math.sin(baseAngle) * 1.5;
          const pImpact = camera?.project ? camera.project(impactX, impactY, sz + 0.5) : { x: pSrc.x + 100, y: pSrc.y, s };

          fxSys.particle?.('pillar', pImpact.x, pImpact.y, {
            tint: 0x74b9ff,
            life: 0.55,
            s0: (s / 64) * 2.4,
            s1: (s / 64) * 0.3,
            a0: 1.0,
            a1: 0,
            ay: 0.5,
            rot: baseAngle + Math.PI / 2
          });
          fxSys.ring?.(sx, sy, sz, 0.4, 2.5, 0xffd700, 0.75);
          fxSys.ring?.(impactX, impactY, sz, 0.4, 2.8, 0x74b9ff, 0.85);
          fxSys.burst?.(pImpact.x, pImpact.y, s, 16, 0x74b9ff, { speed: 3.4, life: 0.45 });
        } catch {}
      }

      if (thrustCount >= 12 && burstTriggered && el >= 0.55) {
        stopSpears();
      }
    });
  }

  // ---- 高文 S3「轮转胜利之剑」：日轮烈焰爆发 -----------------------------------------------------------------
  function playGawainGalatine(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('flare', pSrc.x, pSrc.y, { tint: 0xffb142, life: 0.65, s0: 0.5, s1: 3.8, a0: 1, a1: 0 });
      fxSys.ring?.(sx, sy, sz, 0.5, 3.6, 0xffb142, 0.9);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 18, 0xff5252, { speed: 3.6, life: 0.55 });
    } catch {}
  }

  // ---- 兰斯洛特 S3「缚锁全断·过重湖光」：湖光三重重斩 -------------------------------------------------------
  function playLancelotOverload(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const tgtView = views?.get?.(extra?.target) || null;
    const tx = tgtView ? tgtView.x : (Number(extra?.tx) || Number(x) || 0);
    const ty = tgtView ? tgtView.y : (Number(extra?.ty) || Number(y) || 0);
    const tz = tgtView ? (tgtView.z || 0) : 0;
    const pTgt = camera?.project ? camera.project(tx, ty, tz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pTgt.s || 64));

    try {
      fxSys.particle?.('slash', pTgt.x, pTgt.y, { tint: 0x2e86de, rot: -0.6, life: 0.35, s0: (s / 64) * 2.0, s1: (s / 64) * 2.4, a0: 1, a1: 0 });
      fxSys.particle?.('slash', pTgt.x, pTgt.y, { tint: 0x80ffdb, rot: 0.7, life: 0.45, s0: (s / 64) * 2.0, s1: (s / 64) * 2.4, a0: 1, a1: 0 });
      fxSys.ring?.(tx, ty, tz, 0.3, 2.2, 0x2e86de, 0.6);
      fxSys.burst?.(pTgt.x, pTgt.y, s, 10, 0x80ffdb, { speed: 2.8, life: 0.4 });
    } catch {}
  }

  // ---- 莫德雷德 S3「对吾华丽父王的叛逆」：赤雷奔腾 ---------------------------------------------------------
  function playMordredClarent(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        fxSys.particle?.('bolt', pSrc.x, pSrc.y, {
          tint: 0xff1e42,
          rot: a,
          life: 0.3,
          s0: (s / 64) * 1.5,
          s1: (s / 64) * 0.5,
          a0: 1,
          a1: 0,
          vx: Math.cos(a) * 400,
          vy: Math.sin(a) * 400
        });
      }
      fxSys.ring?.(sx, sy, sz, 0.4, 3.0, 0xff1e42, 0.85);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 14, 0xff1e42, { speed: 3.2, life: 0.5 });
    } catch {}
  }

  // ---- 阿尔托莉雅「誓约胜利之剑」：黄金光柱与光辉扫荡 -----------------------------------------------------
  function playArtoriaExcalibur(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('pillar', pSrc.x, pSrc.y, { tint: 0xffe066, life: 0.9, s0: (s / 64) * 2.8, s1: (s / 64) * 0.5, a0: 1, a1: 0, ay: 1.0 });
      fxSys.ring?.(sx, sy, sz, 0.6, 4.2, 0xffe066, 1.0);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 20, 0xfff9c4, { speed: 4.0, life: 0.6 });
    } catch {}
  }

  // ---- 美露莘 S3「无人知晓的无垢搏动」：红龙吐息光束 -------------------------------------------------------
  function playMelusineBeam(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('shock', pSrc.x, pSrc.y, { tint: 0xff3f34, life: 0.45, s0: 0.4, s1: 3.0, a0: 1, a1: 0 });
      fxSys.ring?.(sx, sy, sz, 0.5, 3.2, 0xff3f34, 0.85);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 16, 0xff7a5a, { speed: 3.5, life: 0.5 });
    } catch {}
  }

  // ---- 妖崔 S3「痛幻哭奏」：血色诅咒魔针 -------------------------------------------------------------------
  // ---- 妖崔 S3「痛幻哭奏 / 绝叫之血池」：血色诅咒魔针 + 诅咒血池 ------------------------------------------
  function playBaobhanBloodPool(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    const tgtView = views?.get?.(extra?.target) || null;
    const tx = tgtView ? tgtView.x : (Number(extra?.tx) || Number(x) || 0);
    const ty = tgtView ? tgtView.y : (Number(extra?.ty) || Number(y) || 0);
    const tz = tgtView ? (tgtView.z || 0) : 0;
    const pTgt = camera?.project ? camera.project(tx, ty, tz + 0.5) : { x: 400, y: 300, s };

    try {
      // 1. 冲击环与粒子爆发
      fxSys.ring?.(sx, sy, sz, 0.4, 2.5, 0xb53471, 0.85);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 12, 0xb53471, { speed: 3.0, life: 0.45 });

      // 2. 刺向目标的血色魔针
      for (let i = 0; i < 8; i++) {
        const offX = (Math.random() - 0.5) * 40;
        const offY = -80 - Math.random() * 40;
        fxSys.particle?.('tracer', pTgt.x + offX, pTgt.y + offY, {
          tint: 0xb53471,
          rot: Math.PI / 2,
          life: 0.25,
          s0: (s / 64) * 1.5,
          s1: (s / 64) * 0.4,
          a0: 1,
          a1: 0,
          vy: 600
        });
      }
      fxSys.particle?.('slash', pTgt.x, pTgt.y, { tint: 0xb53471, rot: 0.5, life: 0.35, s0: (s / 64) * 1.8, s1: (s / 64) * 2.2, a0: 1, a1: 0 });

      // 3. 地面诅咒血池法阵与坏死毒雾
      const groundLayer = layers?.groundFx || layers?.fxAdd;
      if (groundLayer && typeof P.Graphics === 'function') {
        const circleBox = new P.Container();
        const pGround = camera?.project ? camera.project(sx, sy, sz) : pSrc;
        circleBox.position.set(pGround.x, pGround.y);
        const g = new P.Graphics();
        const rad = s * 1.8;
        g.beginFill(0x5a0c28, 0.45);
        g.drawCircle(0, 0, rad);
        g.endFill();
        g.lineStyle(2, 0xb53471, 0.75);
        g.drawCircle(0, 0, rad);
        g.drawCircle(0, 0, rad * 0.65);
        circleBox.addChild(g);
        groundLayer.addChild(circleBox);

        const t0 = performance.now();
        const stopBlood = animate(() => {
          const el = (performance.now() - t0) / 1000;
          if (el >= 1.5) {
            stopBlood();
            circleBox.parent?.removeChild(circleBox);
            circleBox.destroy({ children: true });
            return;
          }
          circleBox.alpha = Math.max(0, 1 - el / 1.5);
          circleBox.rotation += 0.015;
        });
      }
    } catch {}
  }

  // ---- 巴格斯特 S3「黑犬暴食」：狂猎黑犬咆哮与暗炎爆发 ----------------------------------------------------
  function playBarghestBlackDog(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('shock', pSrc.x, pSrc.y, { tint: 0xff5252, life: 0.4, s0: 0.5, s1: 3.2, a0: 1, a1: 0 });
      fxSys.particle?.('flare', pSrc.x, pSrc.y, { tint: 0x1e1e24, life: 0.5, s0: 0.8, s1: 3.0, a0: 0.9, a1: 0 });
      fxSys.ring?.(sx, sy, sz, 0.4, 2.8, 0xff5252, 0.85);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 16, 0xff5252, { speed: 3.4, life: 0.5 });
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        fxSys.particle?.('tracer', pSrc.x, pSrc.y, {
          tint: 0xff7a33,
          rot: angle,
          life: 0.35,
          s0: (s / 64) * 1.4,
          s1: (s / 64) * 0.3,
          a0: 1,
          a1: 0,
          vx: Math.cos(angle) * 350,
          vy: Math.sin(angle) * 350
        });
      }
    } catch {}
  }

  // ---- 高文 S2「日轮照耀」：日轮领域圣辉地环 -------------------------------------------------------------
  function playGawainSolarDomain(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('glow', pSrc.x, pSrc.y, { tint: 0xffb142, life: 0.6, s0: 0.8, s1: 3.5, a0: 0.9, a1: 0 });
      fxSys.ring?.(sx, sy, sz, 0.5, 3.5, 0xffb142, 0.85);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 14, 0xffd700, { speed: 3.0, life: 0.5 });
    } catch {}
  }

  // ---- 卡斯特 S3「真圆集结誓约之星」：真圆水镜与希望星环 ---------------------------------------------------
  function playCastoriaAroundCaliburn(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('shock', pSrc.x, pSrc.y, { tint: 0x74b9ff, life: 0.5, s0: 0.4, s1: 3.5, a0: 1, a1: 0 });
      fxSys.particle?.('glow', pSrc.x, pSrc.y, { tint: 0x80ffdb, life: 0.7, s0: 1.0, s1: 4.0, a0: 0.9, a1: 0 });
      fxSys.ring?.(sx, sy, sz, 0.6, 4.0, 0x74b9ff, 0.95);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 18, 0xffffff, { speed: 3.6, life: 0.55 });
      for (let i = 0; i < 10; i++) {
        const offX = (Math.random() - 0.5) * s * 1.5;
        const offY = (Math.random() - 0.5) * s * 1.5;
        fxSys.particle?.('spark', pSrc.x + offX, pSrc.y + offY, {
          tint: 0xffe066,
          life: 0.45,
          s0: (s / 64) * 1.0,
          s1: 0,
          a0: 1,
          a1: 0,
          vy: -150
        });
      }
    } catch {}
  }

  // ---- 梅林 S3「永世隔绝的理想乡」：阿瓦隆花瓣雨与治愈微光 -------------------------------------------------
  function playMerlinGarden(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('glow', pSrc.x, pSrc.y, { tint: 0xfda7df, life: 0.8, s0: 0.8, s1: 3.6, a0: 0.9, a1: 0 });
      fxSys.ring?.(sx, sy, sz, 0.5, 3.8, 0xfda7df, 0.85);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 16, 0xfda7df, { speed: 2.8, life: 0.6 });
      for (let i = 0; i < 12; i++) {
        const offX = (Math.random() - 0.5) * s * 2.0;
        const offY = -s * 1.2 + (Math.random() - 0.5) * 40;
        fxSys.particle?.('flare', pSrc.x + offX, pSrc.y + offY, {
          tint: Math.random() < 0.5 ? 0xfda7df : 0xffffff,
          life: 0.6,
          s0: (s / 64) * 0.8,
          s1: (s / 64) * 0.2,
          a0: 0.9,
          a1: 0,
          vx: (Math.random() - 0.3) * 50,
          vy: 60 + Math.random() * 40
        });
      }
    } catch {}
  }

  // ---- 摩根 S3「业已无法抵达的理想乡」：伦戈米尼亚德漆黑魔枪与祸患雷霆 -----------------------------------
  function playMorganRhongomyniad(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('pillar', pSrc.x, pSrc.y, { tint: 0x341f97, life: 0.8, s0: (s / 64) * 2.6, s1: (s / 64) * 0.4, a0: 1, a1: 0, ay: 1.0 });
      fxSys.ring?.(sx, sy, sz, 0.5, 4.0, 0x341f97, 0.95);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 18, 0x00d2d3, { speed: 3.8, life: 0.55 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        fxSys.particle?.('bolt', pSrc.x, pSrc.y, {
          tint: 0x00d2d3,
          rot: a,
          life: 0.3,
          s0: (s / 64) * 1.6,
          s1: (s / 64) * 0.4,
          a0: 1,
          a1: 0,
          vx: Math.cos(a) * 450,
          vy: Math.sin(a) * 450
        });
      }
    } catch {}
  }

  // ---- 贝德维尔 S3「紧握其剑，银之臂」：银腕炽光重斩 -------------------------------------------------------
  function playBedivereAirgetlam(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const tgtView = views?.get?.(extra?.target) || null;
    const tx = tgtView ? tgtView.x : (Number(extra?.tx) || Number(x) || 0);
    const ty = tgtView ? tgtView.y : (Number(extra?.ty) || Number(y) || 0);
    const tz = tgtView ? (tgtView.z || 0) : 0;
    const pTgt = camera?.project ? camera.project(tx, ty, tz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pTgt.s || 64));

    try {
      fxSys.particle?.('flare', pTgt.x, pTgt.y, { tint: 0x80ffdb, life: 0.4, s0: 0.6, s1: 2.8, a0: 1, a1: 0 });
      fxSys.particle?.('slash', pTgt.x, pTgt.y, { tint: 0xffffff, rot: 0.65, life: 0.4, s0: (s / 64) * 2.2, s1: (s / 64) * 2.6, a0: 1, a1: 0 });
      fxSys.ring?.(tx, ty, tz, 0.4, 2.6, 0x80ffdb, 0.85);
      fxSys.burst?.(pTgt.x, pTgt.y, s, 14, 0x80ffdb, { speed: 3.2, life: 0.45 });
    } catch {}
  }

  // ---- 加雷斯 S3「狂暴少女狼」：狂狼怒意枪刺 ---------------------------------------------------------------
  function playGarethWolfSpear(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const tgtView = views?.get?.(extra?.target) || null;
    const tx = tgtView ? tgtView.x : (Number(extra?.tx) || Number(x) || 0);
    const ty = tgtView ? tgtView.y : (Number(extra?.ty) || Number(y) || 0);
    const tz = tgtView ? (tgtView.z || 0) : 0;
    const pTgt = camera?.project ? camera.project(tx, ty, tz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pTgt.s || 64));

    try {
      fxSys.particle?.('shock', pTgt.x, pTgt.y, { tint: 0xff5a4a, life: 0.35, s0: 0.4, s1: 2.4, a0: 1, a1: 0 });
      fxSys.particle?.('slash', pTgt.x, pTgt.y, { tint: 0xffd9a0, rot: -0.5, life: 0.35, s0: (s / 64) * 2.0, s1: (s / 64) * 2.4, a0: 1, a1: 0 });
      fxSys.ring?.(tx, ty, tz, 0.35, 2.4, 0xff5a4a, 0.8);
      fxSys.burst?.(pTgt.x, pTgt.y, s, 12, 0xff5a4a, { speed: 3.0, life: 0.4 });
    } catch {}
  }

  // ---- 玛修 S3「如今仍是遥远的理想之城 / 印证希望的人理之剑」----------------------------------------------
  function playMashCastle(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('shield', pSrc.x, pSrc.y, { tint: 0xf8efba, life: 0.7, s0: 1.0, s1: 3.8, a0: 1, a1: 0 });
      fxSys.ring?.(sx, sy, sz, 0.5, 3.8, 0xf8efba, 0.9);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 16, 0xf8efba, { speed: 3.2, life: 0.5 });
    } catch {}
  }

  function playMashTrueSword(extra, x, y) {
    if (!fxSys) return;
    const camera = camFn();
    const srcView = views?.get?.(extra?.id) || null;
    const sx = srcView ? srcView.x : (Number(x) || 0);
    const sy = srcView ? srcView.y : (Number(y) || 0);
    const sz = srcView ? (srcView.z || 0) : 0;
    const pSrc = camera?.project ? camera.project(sx, sy, sz + 0.5) : { x: 400, y: 300, s: 64 };
    const s = Math.max(24, Math.min(120, pSrc.s || 64));

    try {
      fxSys.particle?.('pillar', pSrc.x, pSrc.y, { tint: 0x74b9ff, life: 0.8, s0: (s / 64) * 2.5, s1: (s / 64) * 0.4, a0: 1, a1: 0, ay: 1.0 });
      fxSys.ring?.(sx, sy, sz, 0.5, 3.8, 0x74b9ff, 0.9);
      fxSys.burst?.(pSrc.x, pSrc.y, s, 18, 0xffffff, { speed: 3.6, life: 0.55 });
    } catch {}
  }

  // ---- 事件分流 -------------------------------------------------------------------------------------------
  /** @param {string} kind @param {number} x @param {number} y @param {object} extra */
  function handle(kind, x, y, extra) {
    if (typeof kind !== 'string' || (extra && extra.late > 0)) return;   // 追帧补发的事件不再补演

    const np = NP_BANNER[kind];
    if (np) {
      showBanner(np.op, np.np);
      igniteNoblePhantasm(extra?.id, x, y, np.color || 0xffd700);

      // 分流触发各干员专属武器特效
      if (kind === 'tristanS3') playTristanFailnaught(extra, x, y);
      else if (kind === 'percivalS3') playPercivalSpearFlurry(extra, x, y);
      else if (kind === 'gawainS3') playGawainGalatine(extra, x, y);
      else if (kind === 'lancelotS3') playLancelotOverload(extra, x, y);
      else if (kind === 'mordredS3') playMordredClarent(extra, x, y);
      else if (kind === 'artoriaExcalibur') playArtoriaExcalibur(extra, x, y);
      else if (kind === 'melusineS3Beam') playMelusineBeam(extra, x, y);
      else if (kind === 'baobhanS3') playBaobhanBloodPool(extra, x, y);
      else if (kind === 'barghestS3') playBarghestBlackDog(extra, x, y);
      else if (kind === 'bedivereS3') playBedivereAirgetlam(extra, x, y);
      else if (kind === 'garethS3') playGarethWolfSpear(extra, x, y);
      else if (kind === 'merlinAvalon') playMerlinGarden(extra, x, y);
      else if (kind === 'castoriaS3') playCastoriaAroundCaliburn(extra, x, y);
      else if (kind === 'morganS3') playMorganRhongomyniad(extra, x, y);
      else if (kind === 'mashS3Form1') playMashCastle(extra, x, y);
      else if (kind === 'mashS3Form2') playMashTrueSword(extra, x, y);
      return;
    }

    if (kind === 'gawainS2') { playGawainSolarDomain(extra, x, y); return; }
    if (kind === DECISION_KIND) { drawRestraints(); return; }
    if (BURST_KINDS.has(kind)) { holyBurst(x, y, 0xfff0a8, 120, 14); }
  }

  function destroy() {
    for (const stop of activeCleanups) {
      try { stop(); } catch {}
    }
    activeCleanups.clear();
    banner?.destroy?.({ children: true }); banner = null;
    sealCircle?.destroy?.({ children: true }); sealCircle = null;
  }

  return {
    handle,
    destroy,
    showBanner,
    drawRestraints,
    holyBurst,
    duckBgm,
    igniteNoblePhantasm,
    playTristanFailnaught,
    playPercivalSpearFlurry,
    playGawainGalatine,
    playGawainSolarDomain,
    playLancelotOverload,
    playMordredClarent,
    playArtoriaExcalibur,
    playMelusineBeam,
    playBaobhanBloodPool,
    playBaobhanNeedles: playBaobhanBloodPool,
    playBarghestBlackDog,
    playBedivereAirgetlam,
    playGarethWolfSpear,
    playMerlinGarden,
    playCastoriaAroundCaliburn,
    playMorganRhongomyniad,
    playMashCastle,
    playMashTrueSword
  };
}
