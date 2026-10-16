@echo off
REM ============================================================
REM  把新的小程序 AppID 同步到所有需要它的地方
REM
REM  用法：
REM    scripts\set-appid.bat wx1234567890abcdef
REM ============================================================
setlocal enabledelayedexpansion
chcp 65001 >nul

cd /d "%~dp0.."

set APPID=%~1

if "%APPID%"=="" (
  echo 用法: scripts\set-appid.bat ^<AppID^>
  echo 例如: scripts\set-appid.bat wx1234567890abcdef
  exit /b 1
)

REM 微信 AppID 格式校验：wx + 16 位十六进制
echo %APPID%| findstr /r "^wx[0-9a-fA-F][0-9a-fA-F]*$" >nul
if errorlevel 1 (
  echo [X] AppID 格式不对: %APPID%
  echo     正确格式是 wx 开头加 16 位十六进制字符
  exit /b 1
)
set LOCALID=%APPID:wx=%
if not "%LOCALID%"=="" (
  call :strlen "%LOCALID%" LEN
  if not "!LEN!"=="16" (
    echo [X] AppID 长度不对: %APPID%（应为 wx + 16 位）
    exit /b 1
  )
)

set UPDATED=0

echo.
echo 更新小程序工程配置...
for %%F in (miniapp\project.config.json miniapp\project.private.config.json) do (
  if exist "%%F" (
    powershell -NoProfile -Command ^
      "$p='%%F'; $c=Get-Content -Raw -Encoding UTF8 $p; $new=$c -replace '\"appid\"\s*:\s*\"[^\"]*\"', '\"appid\": \"%APPID%\"'; if ($c -ne $new) { Set-Content -Path $p -Value $new -Encoding UTF8 -NoNewline; Write-Host '  [OK] %%F' } else { Write-Host '  [--] %%F (已是该 AppID)' }"
  )
)

echo.
echo 更新后端配置...
for %%F in (backend\.env backend\.env.example) do (
  if exist "%%F" (
    powershell -NoProfile -Command ^
      "$p='%%F'; $c=Get-Content $p -Encoding UTF8; $new=$c -replace '^WECHAT_APPID=.*', 'WECHAT_APPID=%APPID%'; if (Compare-Object $c $new) { Set-Content -Path $p -Value $new -Encoding UTF8; Write-Host '  [OK] %%F' } else { Write-Host '  [--] %%F (已是该 AppID)' }"
  )
)

echo.
echo 当前 AppID 分布：
findstr /s /c:"%APPID%" miniapp\project.config.json miniapp\project.private.config.json backend\.env backend\.env.example
echo.
echo 接下来：
echo   1. 开发者工具里重新导入项目（或 详情 -^> 修改 AppID）
echo   2. 重启后端，日志应显示「微信登录：已配置」
echo   3. 上线前在公众平台配置 request 合法域名
exit /b 0

:strlen
REM 计算字符串长度：%1 字符串，%2 存放结果的变量名
set "s=%~1"
set "len=0"
:strlen_loop
if defined s (
  set "s=!s:~1!"
  set /a len+=1
  goto :strlen_loop
)
set "%~2=%len%"
exit /b 0
