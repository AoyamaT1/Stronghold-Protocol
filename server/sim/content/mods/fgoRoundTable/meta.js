// mods/fgo-round-table/sim/meta.js — Prep & metadata registration for FGO Round Table Mod
import { registerMeta as registerBondMeta } from './bonds.js';

export function registerMeta(registry) {
  // Register bond meta
  registerBondMeta(registry);

  // Register garrison handlers
  registry.garrison?.('SERVER_ADD_BOND_METHOD', {
    run(ctx) {
      const { bb, bbStr } = ctx.source || {};
      const bond = bbStr?.bond || 'roundTable';
      const count = Number(bb?.multi || bb?.count || 2);
      ctx.addLayers?.(bond, count, { requireActive: true });
    }
  });
}
