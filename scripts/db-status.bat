@echo off
REM ============================================================
REM  查看开发数据库状态
REM
REM  用法：scripts\db-status.bat
REM ============================================================
setlocal enabledelayedexpansion
chcp 65001 >nul

cd /d "%~dp0.."
cd backend

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

echo === 容器状态 ===
%COMPOSE% ps

echo.
echo === 连通性 ===
for /f "tokens=*" %%s in ('docker inspect --format="{{.State.Health.Status}}" little-town-db 2^>nul') do set STATUS=%%s

if not defined STATUS (
  echo [X] 数据库容器不存在，执行 scripts\db-start.bat 启动
  exit /b 0
)

if "!STATUS!"=="healthy"   echo [OK] 数据库已就绪，可以连接
if "!STATUS!"=="starting"  echo ... 数据库正在启动，稍等几秒
if "!STATUS!"=="unhealthy" echo [X] 数据库不健康，执行 scripts\db-logs.bat 查看日志

echo.
echo === 数据表 ===
docker exec little-town-db psql -U postgres -d littletown_db -c "\dt" 2>nul
if errorlevel 1 echo   （数据库未运行，或后端尚未首次启动建表）

echo.
echo === 数据量 ===
docker exec little-town-db psql -U postgres -d littletown_db -tAc "SELECT 'users: ' || count(*) FROM users" 2>nul
docker exec little-town-db psql -U postgres -d littletown_db -tAc "SELECT 'words: ' || count(*) FROM words" 2>nul
docker exec little-town-db psql -U postgres -d littletown_db -tAc "SELECT 'buildings: ' || count(*) FROM buildings" 2>nul
exit /b 0
