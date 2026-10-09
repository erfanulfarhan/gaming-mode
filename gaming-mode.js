// Gaming Mode: one click before playing. Quits the heavy apps in QUIT, then
// shows how much memory that freed. Apps quit normally, so anything with
// unsaved work still asks you to save first. Everything else stays open:
// Brave for the game, plus Discord, Spotify and OBS.
//
// Build the app:    ./build.sh
// Preview a run:    osascript -l JavaScript gaming-mode.js --dry-run

ObjC.import('AppKit');

const QUIT = [
  'com.microsoft.VSCode',            // Visual Studio Code (ends Claude Code sessions in it)
  'com.anthropic.claudefordesktop',  // Claude
  'com.tinyspeck.slackmacgap',       // Slack
  'ru.keepcoder.Telegram',           // Telegram
  'net.whatsapp.WhatsApp',           // WhatsApp
  'us.zoom.xos',                     // Zoom
  'com.microsoft.Word',
  'com.microsoft.Excel',
  'com.microsoft.Powerpoint',
  'com.microsoft.autoupdate2',       // Microsoft AutoUpdate
  'com.lemon.lvoverseas',            // CapCut
  'com.google.Chrome',
  'com.apple.Safari',
  'com.apple.mail',
  'com.apple.Photos',
  'com.apple.Music',
  'com.apple.TV',
  'com.apple.Preview',
];
const WAIT_SECONDS = 15;   // how long to wait for apps to close before reporting

const sys = Application.currentApplication();
sys.includeStandardAdditions = true;

function sh(cmd) {
  return sys.doShellScript(cmd, { alteringLineEndings: false });
}

function freePercent() {
  const m = sh('/usr/bin/memory_pressure').match(/free percentage: (\d+)%/);
  return m ? Number(m[1]) : null;
}

// Running apps from the list, with the memory their processes use (helpers included).
function runningTargets() {
  const procs = sh('/bin/ps -axo rss=,comm=').split('\n')
    .map(line => line.match(/^\s*(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(m => ({ kb: Number(m[1]), path: m[2] }));
  const found = [];
  for (const id of QUIT) {
    const list = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(id);
    for (let i = 0; i < list.count; i++) {
      const app = list.objectAtIndex(i);
      const bundle = app.bundleURL.path.js + '/';
      const kb = procs.filter(p => p.path.startsWith(bundle)).reduce((sum, p) => sum + p.kb, 0);
      const name = $.NSFileManager.defaultManager.displayNameAtPath(app.bundleURL.path).js.replace(/\.app$/, '');
      found.push({ id, app, name, kb });
    }
  }
  return found;
}

function gb(kb) {
  return (kb / 1048576).toFixed(1) + ' GB';
}

function listNames(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function run(argv) {
  const dryRun = Array.isArray(argv) && argv.includes('--dry-run');
  const targets = runningTargets();

  if (dryRun) {
    if (!targets.length) return 'Nothing to close right now.';
    return 'Would close:\n' + targets.map(t => `  ${t.name} (${gb(t.kb)})`).join('\n') +
      `\nAbout ${gb(targets.reduce((s, t) => s + t.kb, 0))} in total. Free memory now: ${freePercent()}%.`;
  }

  const before = freePercent();
  let message;
  if (!targets.length) {
    message = `Nothing to close. ${before}% of your memory is already free.`;
  } else {
    targets.forEach(t => t.app.terminate);
    for (let waited = 0; waited < WAIT_SECONDS; waited += 0.5) {
      if (targets.every(t => !Application(t.id).running())) break;
      delay(0.5);
    }
    delay(2);   // give macOS a moment to reclaim the memory
    const closed = targets.filter(t => !Application(t.id).running());
    const stillOpen = targets.filter(t => Application(t.id).running());
    const after = freePercent();
    message = closed.length
      ? `Closed ${listNames(closed.map(t => t.name))}, freeing about ${gb(closed.reduce((s, t) => s + t.kb, 0))}.\n` +
        `Free memory went from ${before}% to ${after}%.`
      : `No apps closed yet. Free memory is ${after}%.`;
    if (stillOpen.length) {
      message += `\n\nStill open: ${listNames(stillOpen.map(t => t.name))}. ` +
        'It may be waiting for you to save something.';
    }
  }
  sys.displayDialog(message, {
    withTitle: 'Gaming Mode',
    buttons: ['Play'],
    defaultButton: 'Play',
    givingUpAfter: 10,
    withIcon: 'note',
  });
}
