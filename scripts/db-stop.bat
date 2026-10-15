@echo off
REM ============================================================
REM  停止开发数据库
REM
REM  用法：
REM    scripts\db-stop.bat            停止容器（保留数据）
REM    scripts\db-stop.bat --clean    停止并删除数据卷
REM ============================================================
setlocal enabledelayedexpansion
chcp 65001 >nul

cd /d "%~dp0.."
cd backend

set CLEAN=0
if /i "%~1"=="--clean" set CLEAN=1
if /i "%~1"=="-c" set CLEAN=1
if /i "%~1"=="--help" goto :help
if /i "%~1"=="-h" goto :help
if not "%~1"=="" if %CLEAN%==0 (
  echo 未知参数: %~1（可用：--clean）>&2
  exit /b 1
)

where docker >nul 2>&1
if errorlevel 1 (
  echo [X] 未找到 docker 命令
  exit /b 1
)

set COMPOSE=docker compose
docker compose version >nul 2>&1
if errorlevel 1 (
  where docker-compose >nul 2>&1
  if errorlevel 1 (
    echo [X] 未找到 docker compose 命令
    exit /b 1
  )
  set COMPOSE=docker-compose
)

if "%CLEAN%"=="1" (
  echo [!] 将同时删除数据卷，所有数据不可恢复。
  set /p ANSWER=    确认请输入 yes:
  if /i not "!ANSWER!"=="yes" (
    echo 已取消。
    exit /b 0
  )
  %COMPOSE% down -v
  if errorlevel 1 exit /b 1
  echo [OK] 容器已停止，数据卷已删除
  echo      下次 scripts\db-start.bat 会得到全新数据库
) else (
  %COMPOSE% down
  if errorlevel 1 exit /b 1
  echo [OK] 容器已停止（数据保留在 docker 卷中）
  echo      重新启动：scripts\db-start.bat
)
exit /b 0

:help
echo 停止开发数据库
echo.
echo   scripts\db-stop.bat            停止容器（保留数据）
echo   scripts\db-stop.bat --clean    停止并删除数据卷
exit /b 0
