# tools/update-0.2.2.ps1 — Stronghold-Protocol baseline 0.1.0 -> 0.2.2 (keeps all Ave Mujica mod content)
# Run from a system PowerShell (Trae ToolHost is broken):
#   powershell -ExecutionPolicy Bypass -File tools\update-0.2.2.ps1            (full update)
#   powershell -ExecutionPolicy Bypass -File tools\update-0.2.2.ps1 -TestsOnly (just run the mod tests)
param([switch]$TestsOnly)
$ErrorActionPreference = 'Stop'

$root = 'd:\xwechat_files\wxid_ythr17wk8f8e22_2293\wemp'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bak = "$env:TEMP\sp-backup-$stamp"
$zip = "$env:TEMP\sp-0222.zip"
$ext = "$env:TEMP\sp-0222-src"

if ($TestsOnly) {
  Set-Location $root
  node --test test/mods/aveMujica.test.js
  exit $LASTEXITCODE
}

Write-Host "== 1/7 backup local content -> $bak"
New-Item -ItemType Directory -Force -Path $bak | Out-Null
$keepFiles = @('tools\mod.mjs','tools\build-mujica-chess.mjs','tools\format-mujica-chess.mjs',
  'scripts\fetch-mujica-spine.mjs','server\skinInstall.js','data\mods-installed.json',
  'package.json')
foreach ($f in $keepFiles) {
  $src = Join-Path $root $f
  if (Test-Path $src) {
    $dir = Split-Path (Join-Path $bak $f)
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item $src (Join-Path $bak $f) -Force
  }
}
foreach ($d in @('mods','test\mods','public\assets','.vscode','data')) {
  $src = Join-Path $root $d
  if (Test-Path $src) { Copy-Item $src (Join-Path $bak $d) -Recurse -Force }
}

Write-Host "== 2/7 download v0.2.2 source zip"
Invoke-WebRequest 'https://codeload.github.com/sganggs/Stronghold-Protocol/zip/refs/tags/v0.2.2' -OutFile $zip
if (Test-Path $ext) { Remove-Item $ext -Recurse -Force }
Expand-Archive $zip $ext -Force
$up = (Get-ChildItem $ext | Select-Object -First 1).FullName
Write-Host "   upstream folder: $up"

Write-Host "== 3/7 remove upstream-replaced areas (local keeps untouched)"
Set-Location $root
foreach ($d in @('server','shared','docs','scripts')) {
  if (Test-Path $d) { Remove-Item $d -Recurse -Force }
}
if (Test-Path 'public\js')         { Remove-Item 'public\js' -Recurse -Force }
if (Test-Path 'public\index.html') { Remove-Item 'public\index.html' -Force }
if (Test-Path 'test')              { Move-Item 'test' "$bak\test-old" }
if (Test-Path 'tools')             { Move-Item 'tools' "$bak\tools-old" }
foreach ($f in @('package.json','README.md','NOTICE.md','AGENTS.md')) {
  if (Test-Path $f) { Remove-Item $f -Force }
}

Write-Host "== 4/7 copy upstream 0.2.2 in"
Copy-Item (Join-Path $up 'server') 'server' -Recurse
Copy-Item (Join-Path $up 'shared') 'shared' -Recurse
Copy-Item (Join-Path $up 'docs')   'docs'   -Recurse
if (Test-Path (Join-Path $up 'scripts')) { Copy-Item (Join-Path $up 'scripts') 'scripts' -Recurse }
if (Test-Path (Join-Path $up 'tools'))   { Copy-Item (Join-Path $up 'tools')   'tools'   -Recurse }
New-Item -ItemType Directory -Force -Path 'public' | Out-Null
Copy-Item (Join-Path $up 'public\js')         'public\js'         -Recurse
Copy-Item (Join-Path $up 'public\index.html') 'public\index.html' -Force
Copy-Item (Join-Path $up 'test') 'test' -Recurse
foreach ($f in @('package.json','README.md','NOTICE.md','AGENTS.md')) {
  $src = Join-Path $up $f
  if (Test-Path $src) { Copy-Item $src $f -Force }
}

Write-Host "== 5/7 restore local-only content"
if (Test-Path "$bak\test-old\mods") { Copy-Item "$bak\test-old\mods" 'test\mods' -Recurse -Force }
foreach ($f in @('tools\mod.mjs','tools\build-mujica-chess.mjs','tools\format-mujica-chess.mjs',
                 'scripts\fetch-mujica-spine.mjs','server\skinInstall.js','data\mods-installed.json')) {
  $src = Join-Path $bak $f
  if (Test-Path $src) {
    $dir = Split-Path (Join-Path $root $f)
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item $src (Join-Path $root $f) -Force
  }
}
Write-Host "   (mods/, public/assets/, .vscode/ never touched)"

Write-Host "== 6/7 npm install + remount mod data"
Set-Location $root
npm install
if ($LASTEXITCODE -ne 0) { Write-Error 'npm install failed' }
node tools\mod.mjs install ave-mujica
if ($LASTEXITCODE -ne 0) { Write-Error 'mod install failed' }

Write-Host "== 7/7 run Ave Mujica mod tests"
node --test test/mods/aveMujica.test.js
Write-Host "== DONE (backup at $bak). NOTE: engine mount patches are applied by the agent next."
