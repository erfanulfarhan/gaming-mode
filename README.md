# Gaming Mode

One click before playing. It quits the memory-heavy apps listed in `gaming-mode.js`, then shows which apps it closed, roughly how much memory that freed, and the free memory before and after.

- Apps quit normally, so anything with unsaved work still asks you to save.
- Apps that aren't on the list stay open: Brave for the game, plus Discord, Spotify and OBS.
- Quitting VS Code also ends any Claude Code session running in it.

## Use

Click **Gaming Mode** in the Dock, or search for it in Spotlight.

## Change which apps it closes

Edit the `QUIT` list of bundle IDs in `gaming-mode.js`, then run `./build.sh`. To find an app's bundle ID:

```
osascript -e 'id of app "App Name"'
```

To see what it would close, without closing anything:

```
osascript -l JavaScript gaming-mode.js --dry-run
```

## Notes

- macOS manages memory itself, so freeing memory only helps when apps are actually using it. The biggest win is usually fewer open browser tabs. Brave's Memory Saver (Settings, then System) puts tabs you aren't using to sleep.
- `icon/make-icon.swift` draws the icon. `build.sh` copies `icon/GamingMode.icns` into the app.
