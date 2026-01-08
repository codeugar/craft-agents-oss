#!/bin/bash
# Interactive Electron dev launcher
# Provides a menu to optionally start React DevTools and log viewer before launching the app

set -e
cd "$(dirname "$0")/.."

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# State (default both off)
START_DEVTOOLS=false
START_LOGS=false

# Draw the menu
draw_menu() {
  clear
  echo ""
  echo -e "${CYAN}${BOLD}  Craft Agent - Dev Launcher${NC}"
  echo -e "${GRAY}  ─────────────────────────────${NC}"
  echo ""
  echo -e "  ${BOLD}Options:${NC}"
  echo ""

  if $START_DEVTOOLS; then
    echo -e "  ${GREEN}[1]${NC} React DevTools    ${GREEN}✓${NC}"
  else
    echo -e "  ${GRAY}[1]${NC} React DevTools    ${GRAY}○${NC}"
  fi

  if $START_LOGS; then
    echo -e "  ${GREEN}[2]${NC} Log Viewer        ${GREEN}✓${NC}"
  else
    echo -e "  ${GRAY}[2]${NC} Log Viewer        ${GRAY}○${NC}"
  fi

  echo ""
  echo -e "  ${YELLOW}[Enter]${NC} Start app"
  echo -e "  ${GRAY}[q]${NC} Quit"
  echo ""
}

# Main loop
while true; do
  draw_menu

  # Read single character without requiring Enter
  read -rsn1 key

  case $key in
    1)
      if $START_DEVTOOLS; then
        START_DEVTOOLS=false
      else
        START_DEVTOOLS=true
      fi
      ;;
    2)
      if $START_LOGS; then
        START_LOGS=false
      else
        START_LOGS=true
      fi
      ;;
    q|Q)
      clear
      echo -e "  ${GRAY}Cancelled${NC}"
      echo ""
      exit 0
      ;;
    "")
      # Enter pressed - start the app
      break
      ;;
  esac
done

# Clear and show what we're starting
clear
echo ""
echo -e "${CYAN}${BOLD}  Craft Agent - Starting...${NC}"
echo -e "${GRAY}  ─────────────────────────────${NC}"
echo ""

# Start React DevTools if selected
if $START_DEVTOOLS; then
  echo -e "  ${GREEN}▸${NC} Starting React DevTools..."
  # Start in background, suppress output
  npx react-devtools &>/dev/null &
  sleep 1
fi

# Start log viewer if selected
if $START_LOGS; then
  echo -e "  ${GREEN}▸${NC} Opening log viewer..."
  # Use osascript to open in new Terminal window (macOS)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    osascript -e "tell application \"Terminal\" to do script \"cd '$PWD' && ./scripts/tail-electron-logs.sh\""
  else
    # Linux fallback - try common terminal emulators
    if command -v gnome-terminal &> /dev/null; then
      gnome-terminal -- bash -c "./scripts/tail-electron-logs.sh; exec bash"
    elif command -v xterm &> /dev/null; then
      xterm -e "./scripts/tail-electron-logs.sh" &
    fi
  fi
fi

echo -e "  ${GREEN}▸${NC} Starting Electron app..."
echo ""

# Clean vite cache and build resources first
bun run electron:clean:vite
bun run electron:build:resources

# Run the concurrent dev processes
exec concurrently -k \
  "bun run electron:dev:vite" \
  "bun run electron:dev:main" \
  "bun run electron:dev:preload" \
  "bun run electron:dev:electron"
