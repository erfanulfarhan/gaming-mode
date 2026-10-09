#!/bin/bash
# Builds "Gaming Mode.app" into ~/Applications from gaming-mode.js and adds it to the Dock.
# Run it again after editing the app list in gaming-mode.js.
set -euo pipefail
cd "$(dirname "$0")"
APP="$HOME/Applications/Gaming Mode.app"

mkdir -p "$HOME/Applications"
rm -rf "$APP"
osacompile -l JavaScript -o "$APP" gaming-mode.js
cp icon/GamingMode.icns "$APP/Contents/Resources/applet.icns"
# Newer applets carry a default icon in Assets.car that wins over applet.icns; drop it.
rm -f "$APP/Contents/Resources/Assets.car"
plist="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIdentifier" "$plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.erfanul.gamingmode" "$plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Gaming Mode" "$plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$plist" 2>/dev/null || true
codesign --force --sign - "$APP"
touch "$APP"
echo "built $APP"

# Add to the Dock once; drag it out of the Dock to remove it.
if ! defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "Gaming%20Mode.app"; then
  defaults write com.apple.dock persistent-apps -array-add \
    "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://$HOME/Applications/Gaming%20Mode.app/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
  killall Dock
  echo "added to the Dock"
fi
