@echo off
rem Stronghold Protocol Trainer - 测试台启动器
chcp 65001 >nul
cd /d "%~dp0"
node sp-local-tools\launch.mjs %*
if errorlevel 1 pause
