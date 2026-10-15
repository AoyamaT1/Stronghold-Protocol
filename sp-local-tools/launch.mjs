#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { startServer } from '../server/index.js';
import { attachLocalTools } from './local-tools.mjs';
import { openBrowser } from '../scripts/open-browser.mjs';
import { scheduleRaiseConsole } from '../scripts/raise-console.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const portIdx = argv.indexOf('--port');
const PORT = portIdx >= 0 && argv[portIdx + 1] ? Number(argv[portIdx + 1]) : (Number(process.env.PORT) || 3000);
const NO_OPEN = argv.includes('--no-open') || process.env.SP_NO_BROWSER === '1';
const NO_FOCUS = argv.includes('--no-focus') || /^(1|true|yes)$/i.test(process.env.SP_NO_FOCUS || '');

async function main() {
  console.log('');
  console.log('='.repeat(66));
  console.log('  卫戍协议：盟约 · 本地测试台 (Stronghold Protocol Trainer)');
  console.log('='.repeat(66));
  
  let srv;
  try {
    srv = await startServer({ host: '::', port: PORT, quiet: false });
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[错误] 端口 ${PORT} 已被占用，请先关闭其他已运行的服务器或传入 --port 换端口。`);
      process.exit(1);
    }
    throw err;
  }

  attachLocalTools(srv);

  const localUrl = `http://localhost:${srv.port}`;
  console.log('');
  console.log(`  本地游戏地址 : ${localUrl}`);
  console.log('  测试台说明   :');
  console.log('    1. 进入游戏对局后，点击右上角【修改器】或按快捷键 [Ctrl+Shift+M]');
  console.log('    2. 支持实时调整金币（0-99999）、盟约层数（0-999）');
  console.log('    3. 支持免费发放任意装备/道具、任意未被 ban 干员');
  console.log('    4. 可切换测试自己或 AI 队友');
  console.log('='.repeat(66));
  console.log('\n正在监听中，按 Ctrl+C 可停止服务器...\n');

  if (!NO_OPEN) {
    openBrowser(localUrl);
    // 浏览器打开后会盖住这个控制台；稍等它出现，再把测试台窗口重新置前（仅 Windows，--no-focus / SP_NO_FOCUS=1 关闭）。
    scheduleRaiseConsole({ enabled: !NO_FOCUS });
  }

  process.on('uncaughtException', (err) => {
    console.error('\n[server error uncaughtException]', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('\n[server error unhandledRejection]', reason);
  });

  const shutdown = async () => {
    console.log('\n正在停止测试台服务器...');
    try { await srv.close(); } finally { process.exit(0); }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('\n启动失败:', err);
  process.exit(1);
});
