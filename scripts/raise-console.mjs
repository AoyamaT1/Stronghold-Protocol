// scripts/raise-console.mjs — keep the launcher window visible on Windows.
//
// Opening the game page hands the browser the foreground, and it opens on top of the console that started the server —
// so the window with the addresses to share, the logs and the Ctrl+C hint ends up buried and looks like it vanished.
// After the browser has had a moment to appear we raise our own console back to the front.
//
// Best-effort and silent. A short PowerShell child **inherits this console** (so GetConsoleWindow() returns our
// window): it restores the window if it was minimised, flips it topmost-then-normal to jump above the browser, and
// reasserts the foreground. Nothing here is load-bearing — a buried window is cosmetic, so every failure is swallowed.
// Callers gate it on their own --no-focus / SP_NO_FOCUS switch.
import { spawn } from 'node:child_process';

const IS_WIN = process.platform === 'win32';

// -EncodedCommand takes a UTF-16LE base64 blob, which sidesteps every quoting pitfall of passing the script inline.
const PS_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  "Add-Type -Namespace SPNative -Name Win -MemberDefinition @'",
  '[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();',
  '[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);',
  '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);',
  '[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr a, int x, int y, int cx, int cy, uint f);',
  "'@",
  '$h = [SPNative.Win]::GetConsoleWindow()',
  'if ($h -ne [System.IntPtr]::Zero) {',
  '  [void][SPNative.Win]::ShowWindow($h, 9)',               // SW_RESTORE: undo a minimise, keep the size
  '  $f = 0x0040 -bor 0x0002 -bor 0x0001',                   // SWP_SHOWWINDOW | SWP_NOMOVE | SWP_NOSIZE
  '  $tp = New-Object System.IntPtr -ArgumentList (-1)',     // HWND_TOPMOST — above the browser for an instant
  '  $ntp = New-Object System.IntPtr -ArgumentList (-2)',    // HWND_NOTOPMOST — then drop back to a normal window
  '  [void][SPNative.Win]::SetWindowPos($h, $tp, 0,0,0,0, $f)',
  '  [void][SPNative.Win]::SetWindowPos($h, $ntp, 0,0,0,0, $f)',
  '  [void][SPNative.Win]::SetForegroundWindow($h)',
  '}',
].join('\n');

/** Raise this process's console window to the foreground (Windows only; a no-op everywhere else). */
export function raiseConsoleWindow() {
  if (!IS_WIN) return;
  try {
    const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
    // Not detached and no windowsHide: the child must inherit this console, or GetConsoleWindow() returns 0.
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { stdio: 'ignore' });
    child.on?.('error', () => {});
    child.unref?.();
  } catch { /* a buried window is cosmetic — never fail the launch over it */ }
}

/**
 * Schedule {@link raiseConsoleWindow} once the browser has had time to open and grab the foreground.
 *
 * Fires at a couple of delays, not once: on some setups the window is minimised (or drops off the taskbar entirely)
 * a moment *after* the browser appears, so a single early raise can be undone. The timers are unref'd — the running
 * server, not these cosmetic timers, is what keeps the process alive.
 * @param {{ enabled?: boolean, delaysMs?: number[] }} [o]
 */
export function scheduleRaiseConsole({ enabled = true, delaysMs = [1500, 3500] } = {}) {
  if (!enabled || !IS_WIN) return;
  for (const delay of delaysMs) {
    const t = setTimeout(raiseConsoleWindow, delay);
    t.unref?.();
  }
}
