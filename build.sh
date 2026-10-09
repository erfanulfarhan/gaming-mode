#!/bin/bash
# Builds "Gaming Mode.app" from gaming-mode.js and installs it in ~/Applications.
#
#   ./build.sh            build, install and add it to the Dock
#   ./build.sh --no-dock  build and install without touching the Dock
#   ./build.sh --zip      also write dist/Gaming-Mode.zip for a GitHub release
set -euo pipefail
cd "$(dirname "$0")"
APP="$HOME/Applications/Gaming Mode.app"
DOCK=1; ZIP=0
for arg in "$@"; do
  case "$arg" in
    --no-dock) DOCK=0 ;;
    --zip) ZIP=1 ;;
    *) echo "unknown option: $arg" >&2; exit 1 ;;
  esac
done

mkdir -p "$HOME/Applications"
rm -rf "$APP"
osacompile -l JavaScript -o "$APP" gaming-mode.js
cp icon/GamingMode.icns "$APP/Contents/Resources/applet.icns"
# Newer applets carry a default icon in Assets.car that wins over applet.icns; drop it.
rm -f "$APP/Contents/Resources/Assets.car"
plist="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Delete :CFBundleIdentifier" "$plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string io.github.erfanulfarhan.gamingmode" "$plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Gaming Mode" "$plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Delete :CFBundleShortVersionString" "$plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string 1.0.0" "$plist"
codesign --force --sign - "$APP" 2>/dev/null
touch "$APP"
echo "Installed $APP"

if [ "$ZIP" = 1 ]; then
  mkdir -p dist
  rm -f dist/Gaming-Mode.zip
  ditto -c -k --keepParent "$APP" dist/Gaming-Mode.zip
  echo "Wrote dist/Gaming-Mode.zip"
fi

# Add to the Dock once; drag it out of the Dock to remove it.
if [ "$DOCK" = 1 ] && ! defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "Gaming%20Mode.app"; then
  defaults write com.apple.dock persistent-apps -array-add \
    "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://$HOME/Applications/Gaming%20Mode.app/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
  killall Dock
  echo "Added Gaming Mode to the Dock"
fi
