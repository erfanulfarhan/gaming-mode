// Gaming Mode: one click before playing, one click after.
//
// On:  saves your Brave tabs and closes Brave, quits the heavy apps in QUIT,
//      opens a fresh Safari window (the lightest browser on a Mac), then shows
//      how much memory that freed. Apps quit normally, so anything with unsaved
//      work still asks you to save first.
// Off: the next click reopens Brave with the saved tabs (and the same launch
//      flags, so its debug port comes back) plus the apps it closed.
//
// Discord, Spotify and OBS are never touched.
//
// Build the app:    ./build.sh
// Preview a click:  osascript -l JavaScript gaming-mode.js --dry-run

ObjC.import('AppKit');

const BRAVE = 'com.brave.Browser';
const QUIT = [
  BRAVE,                             // tabs are saved first and come back on the next click
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
  'com.apple.mail',
  'com.apple.Photos',
  'com.apple.Music',
  'com.apple.TV',
  'com.apple.Preview',
];
const DONT_REOPEN = ['com.microsoft.autoupdate2'];
const WAIT_SECONDS = 15;   // how long to wait for apps to close before reporting
const HOME = $.NSHomeDirectory().js;
const DIR = HOME + '/Library/Application Support/Gaming Mode';
const STATE = DIR + '/state.json';

const sys = Application.currentApplication();
sys.includeStandardAdditions = true;

function sh(cmd) {
  return sys.doShellScript(cmd, { alteringLineEndings: false });
}

function q(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function readState() {
  const s = $.NSString.stringWithContentsOfFileEncodingError(STATE, $.NSUTF8StringEncoding, null);
  try { return s.isNil() ? null : JSON.parse(s.js); } catch (e) { return null; }
}

function writeFile(path, text) {
  sh('/bin/mkdir -p ' + q(DIR));
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}

function isRunning(id) {
  return Application(id).running();
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

// Brave's open tabs, read through its debug port when it has one (no permission
// prompt), otherwise by asking Brave itself. Also keeps the flags it was started with.
function braveSession() {
  const cmd = sh('/bin/ps -axo command=').split('\n')
    .find(c => c.startsWith('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser')) || '';
  const flags = cmd.match(/(?<=\s)--\S+/g) || [];
  const keep = u => /^(https?|file):/.test(u);
  try {
    const list = JSON.parse(sh('/usr/bin/curl -s -m 3 http://127.0.0.1:9222/json/list'));
    return { flags, tabs: list.filter(t => t.type === 'page' && keep(t.url)).map(t => t.url) };
  } catch (e) {}
  try {
    const tabs = [].concat(...Application('Brave Browser').windows().map(w => w.tabs().map(t => t.url())));
    return { flags, tabs: tabs.filter(keep) };
  } catch (e) {
    return { flags, tabs: [] };
  }
}

function gb(kb) {
  return (kb / 1048576).toFixed(1) + ' GB';
}

function listNames(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function show(message) {
  sys.displayDialog(message, {
    withTitle: 'Gaming Mode',
    buttons: ['OK'],
    defaultButton: 'OK',
    givingUpAfter: 12,
    withIcon: 'note',
  });
}

function turnOn() {
  const before = freePercent();
  const targets = runningTargets();
  const brave = isRunning(BRAVE) ? braveSession() : null;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  if (brave && brave.tabs.length) writeFile(`${DIR}/brave-tabs-${stamp}.txt`, brave.tabs.join('\n') + '\n');

  targets.forEach(t => t.app.terminate);
  for (let waited = 0; waited < WAIT_SECONDS; waited += 0.5) {
    if (targets.every(t => !isRunning(t.id))) break;
    delay(0.5);
  }
  const closed = targets.filter(t => !isRunning(t.id));
  const stillOpen = targets.filter(t => isRunning(t.id));

  const safariWasOpen = isRunning('com.apple.Safari');
  sh('/usr/bin/open -a Safari');
  delay(2);   // give macOS a moment to reclaim the memory
  const after = freePercent();

  writeFile(STATE, JSON.stringify({
    on: true,
    since: new Date().toISOString(),
    brave: brave && closed.some(t => t.id === BRAVE) ? brave : null,
    reopen: closed.map(t => t.id).filter(id => id !== BRAVE && !DONT_REOPEN.includes(id)),
    quitSafari: !safariWasOpen,
  }, null, 2));

  let message = '';
  if (brave && closed.some(t => t.id === BRAVE)) message += `Saved your ${plural(brave.tabs.length, 'Brave tab')}. `;
  const others = closed.map(t => t.name);
  message += closed.length
    ? `Closed ${listNames(others)}, freeing about ${gb(closed.reduce((s, t) => s + t.kb, 0))}.\n`
    : 'Nothing needed closing.\n';
  message += `Free memory went from ${before}% to ${after}%.\n\n` +
    'A fresh Safari window is open. Click Gaming Mode again when you are done to get your tabs and apps back.';
  if (stillOpen.length) {
    message += `\n\nStill open: ${listNames(stillOpen.map(t => t.name))}. It may be waiting for you to save something.`;
  }
  show(message);
}

function turnOff(state) {
  const done = [];
  if (state.quitSafari && isRunning('com.apple.Safari')) {
    $.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.apple.Safari').objectAtIndex(0).terminate;
  }
  if (state.brave) {
    if (isRunning(BRAVE)) {
      done.push(`Brave was already open, so your saved tabs are in ${DIR}`);
    } else {
      sh(['/usr/bin/open', '-a', 'Brave Browser', '--args', ...state.brave.flags, ...state.brave.tabs].map(q).join(' '));
      done.push(`Reopened Brave with your ${plural(state.brave.tabs.length, 'tab')}`);
    }
  }
  const names = [];
  for (const id of state.reopen) {
    try {
      sh('/usr/bin/open -g -b ' + q(id));
      const path = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(id).path;
      names.push($.NSFileManager.defaultManager.displayNameAtPath(path).js.replace(/\.app$/, ''));
    } catch (e) {}
  }
  if (names.length) done.push(`reopened ${listNames(names)}`);
  writeFile(STATE, JSON.stringify({ on: false, since: new Date().toISOString() }, null, 2));
  const summary = done.join(', and ');
  show('Gaming Mode is off. ' + (summary ? summary[0].toUpperCase() + summary.slice(1) + '.' : 'Nothing needed reopening.'));
}

function run(argv) {
  const dryRun = Array.isArray(argv) && argv.includes('--dry-run');
  const state = readState();
  if (dryRun) {
    if (state && state.on) {
      return 'Gaming Mode is on. The next click would reopen Brave' +
        (state.brave ? ` with ${plural(state.brave.tabs.length, 'tab')}` : '') +
        ` and ${state.reopen.length} other app(s).`;
    }
    const targets = runningTargets();
    const brave = isRunning(BRAVE) ? braveSession() : null;
    return (brave ? `Would save ${plural(brave.tabs.length, 'Brave tab')} (flags: ${brave.flags.join(' ') || 'none'}).\n` : '') +
      (targets.length ? 'Would close:\n' + targets.map(t => `  ${t.name} (${gb(t.kb)})`).join('\n') +
        `\nAbout ${gb(targets.reduce((s, t) => s + t.kb, 0))} in total.` : 'Nothing to close.') +
      `\nThen open a Safari window. Free memory now: ${freePercent()}%.`;
  }
  if (state && state.on) turnOff(state); else turnOn();
}
