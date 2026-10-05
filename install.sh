#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v g++ >/dev/null 2>&1; then
  echo '需要 C++17 编译器。Ubuntu 可运行：sudo apt install g++' >&2
  exit 1
fi
echo '编译本地 C++ 服务…'
g++ -O2 -std=c++17 -Wall -Wextra -Wpedantic server.cpp -o tidal-front-server
port="${TIDAL_PORT:-8787}"
if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 )); then
  echo 'TIDAL_PORT 必须在 1024–65535 之间' >&2
  exit 1
fi
# Stop an older Tidal Front process owned by this user on the same port. Otherwise
# the browser can keep showing files from the old extracted directory.
old_pids=()
if command -v fuser >/dev/null 2>&1; then
  read -r -a old_pids <<< "$(fuser -n tcp "$port" 2>/dev/null || true)"
else
  mapfile -t old_pids < <(pgrep -u "$UID" -f '[/]tidal-front-server' 2>/dev/null || true)
fi
for old_pid in "${old_pids[@]}"; do
  [[ -r "/proc/$old_pid/exe" ]] || continue
  old_exe="$(readlink -f "/proc/$old_pid/exe" 2>/dev/null || true)"
  if [[ "${old_exe##*/}" == tidal-front-server* ]]; then
    echo "停止 $port 端口上的旧版潮汐前线服务（PID $old_pid）…"
    kill "$old_pid" 2>/dev/null || true
    sleep 0.15
    if kill -0 "$old_pid" 2>/dev/null; then kill -KILL "$old_pid" 2>/dev/null || true; fi
  fi
done
for _ in {1..20}; do
  if command -v fuser >/dev/null 2>&1 && [[ -z "$(fuser -n tcp "$port" 2>/dev/null || true)" ]]; then break; fi
  sleep 0.1
done
if command -v fuser >/dev/null 2>&1 && [[ -n "$(fuser -n tcp "$port" 2>/dev/null || true)" ]]; then
  echo "$port 端口仍被其他程序占用。关闭旧终端中的游戏，或运行：TIDAL_PORT=8788 ./install.sh" >&2
  exit 1
fi
url="http://127.0.0.1:$port/?v=0.6.8.5"
echo "启动游戏 v0.6.8.5：$url"
echo "资源目录：$PWD"
./tidal-front-server "$PWD" "$port" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT INT TERM
sleep 0.4
if ! kill -0 "$server_pid" 2>/dev/null; then wait "$server_pid"; exit 1; fi
if command -v xdg-open >/dev/null 2>&1 && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  xdg-open "$url" >/dev/null 2>&1 || true
else
  echo "在浏览器打开 $url"
fi
wait "$server_pid"
