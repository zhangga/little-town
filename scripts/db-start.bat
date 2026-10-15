@echo off
REM ============================================================
REM  启动开发数据库（PostgreSQL + Adminer）
REM
REM  用法：
REM    scripts\db-start.bat            启动数据库
REM    scripts\db-start.bat --reset    清空数据后重新启动
REM ============================================================
setlocal enabledelayedexpansion
chcp 65001 >nul

REM 切到仓库根目录，保证从任意位置调用都能工作
cd /d "%~dp0.."
cd backend

set RESET=0
if /i "%~1"=="--reset" set RESET=1
if /i "%~1"=="-r" set RESET=1
if /i "%~1"=="--help" goto :help
if /i "%~1"=="-h" goto :help
if not "%~1"=="" if %RESET%==0 (
  echo 未知参数: %~1（可用：--reset）>&2
  exit /b 1
)

REM --- 依赖检查 ---
where docker >nul 2>&1
if errorlevel 1 (
  echo [X] 未找到 docker 命令
  echo     请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop
  exit /b 1
)

REM 优先用 v2 插件，回落到 v1 独立程序
set COMPOSE=docker compose
docker compose version >nul 2>&1
if errorlevel 1 (
  where docker-compose >nul 2>&1
  if errorlevel 1 (
    echo [X] 未找到 docker compose 命令
    echo     请升级 Docker Desktop，或单独安装 docker-compose
    exit /b 1
  )
  set COMPOSE=docker-compose
)

REM --- 守护进程是否在跑 ---
docker info >nul 2>&1
if errorlevel 1 (
  echo [X] Docker 守护进程未运行
  echo     请先启动 Docker Desktop
  exit /b 1
)

if "%RESET%"=="1" (
  echo [!] 即将清空数据库卷，所有用户、单词、建筑数据都会被删除。
  set /p ANSWER=    确认请输入 yes:
  if /i not "!ANSWER!"=="yes" (
    echo 已取消。
    exit /b 0
  )
  echo -^> 停止容器并删除数据卷...
  %COMPOSE% down -v
  if errorlevel 1 exit /b 1
  echo -^> 数据卷已删除，将重新初始化
)

echo -^> 启动数据库容器...
%COMPOSE% up -d
if errorlevel 1 (
  echo [X] 启动失败，请检查 Docker Desktop 是否正常运行
  exit /b 1
)

REM --- 等待数据库就绪 ---
REM 容器起来 ≠ 数据库可连接，这里必须等 healthcheck 通过，
REM 否则紧接着启动后端会报 connection refused
echo -n -^> 等待数据库就绪
set READY=0
for /l %%i in (1,1,40) do (
  if !READY!==0 (
    for /f "tokens=*" %%s in ('docker inspect --format="{{.State.Health.Status}}" little-town-db 2^>nul') do set STATUS=%%s
    for /f "tokens=*" %%r in ('docker inspect --format="{{.State.Running}}" little-town-db 2^>nul') do set RUNNING=%%r

    if "!RUNNING!"=="false" (
      echo.
      echo [X] 容器已退出，日志如下：
      docker logs --tail 30 little-town-db
      exit /b 1
    )
    if "!STATUS!"=="healthy" (
      set READY=1
    ) else (
      echo -n .
      timeout /t 1 /nobreak >nul
    )
  )
)
echo.

if not "%READY%"=="1" (
  echo [X] 等待超时（40 秒）。检查日志：%COMPOSE% logs postgres
  exit /b 1
)

echo [OK] 数据库已就绪
echo.
echo   PostgreSQL  127.0.0.1:5432   库 littletown_db   用户 postgres
echo   Adminer     http://localhost:8081
echo.
echo   下一步：
echo     启动后端    cd backend ^&^& go run cmd/server/main.go
echo     导入数据    cd backend ^&^& go run cmd/import/main.go
echo     停止数据库  scripts\db-stop.bat
exit /b 0

:help
echo 启动开发数据库（PostgreSQL + Adminer）
echo.
echo   scripts\db-start.bat            启动数据库
echo   scripts\db-start.bat --reset    清空数据后重新启动
exit /b 0
