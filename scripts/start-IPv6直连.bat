@echo off
chcp 65001 >nul
set "HOST=::"
call "%~dp0start-windows.bat" %*
