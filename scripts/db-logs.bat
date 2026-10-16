@echo off
REM ============================================================
REM  查看数据库日志
REM
REM  用法：
REM    scripts\db-logs.bat          查看最近 100 行
REM    scripts\db-logs.bat -f       持续跟踪输出（Ctrl+C 退出）
REM    scripts\db-logs.bat 500      查看最近 500 行
REM ============================================================
setlocal enabledelayedexpansion
chcp 65001 >nul

cd /d "%~dp0.."
cd backend

set FOLLOW=0
set TAIL=100

if /i "%~1"=="--help" goto :help
if /i "%~1"=="-h"     goto :help
if /i "%~1"=="-f"     set FOLLOW=1
if /i "%~1"=="--follow" set FOLLOW=1

REM 若参数是纯数字，作为行数
if not "%~1"=="" (
  echo %~1| findstr /r "^[0-9][0-9]*$" >nul && set TAIL=%~1
)

REM 参数非空、且既不是 -f 也不是数字，视为非法
if not "%~1"=="" if not "%FOLLOW%"=="1" (
  echo %~1| findstr /r "^[0-9][0-9]*$" >nul
  if errorlevel 1 (
    echo 未知参数: %~1>&2
    exit /b 1
  )
)

docker inspect little-town-mysql >nul 2>&1
if errorlevel 1 (
  echo [X] 数据库容器不存在，执行 scripts\db-start.bat 启动
  exit /b 1
)

if "%FOLLOW%"=="1" (
  docker logs -f --tail %TAIL% little-town-mysql
) else (
  docker logs --tail %TAIL% little-town-mysql
)
exit /b 0

:help
echo 查看数据库日志
echo.
echo   scripts\db-logs.bat          查看最近 100 行
echo   scripts\db-logs.bat -f       持续跟踪输出
echo   scripts\db-logs.bat 500      查看最近 500 行
exit /b 0
