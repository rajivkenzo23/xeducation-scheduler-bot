/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         X - Education Scheduler Bot — VPS Launcher           ║
 * ║  Drop this file on your VPS and run:  node launcher.js       ║
 * ║  It will clone/update the bot, write .env, and start it.     ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ✏️  FILL IN YOUR VALUES BELOW BEFORE RUNNING
 */

// ================================================================
//  ⚙️  CONFIGURATION — Edit these values
// ================================================================
const CONFIG = {
  // 🔑 Telegram Bot Token (from @BotFather)
  BOT_TOKEN: 'YOUR_BOT_TOKEN_HERE',

  // 👤 Your Telegram User ID (get it from @userinfobot)
  ADMIN_ID: 'YOUR_TELEGRAM_ID_HERE',

  // 📢 Telegram channel username (with @)
  TARGET_CHANNEL_USERNAME: '@THEXEducation',

  // 🌐 Your website URL
  WEBSITE_URL: 'https://videoslk.eu.cc',

  // 🔑 GitHub Personal Access Token (for pushing articles to website repo)
  GITHUB_TOKEN: 'YOUR_GITHUB_TOKEN_HERE',

  // 💚 WhatsApp Channel link
  WHATSAPP_CHANNEL: 'https://whatsapp.com/channel/0029VbA9drwBadmctNhZGN3S',

  // 📢 Telegram bot links
  MAIN_BOT_LINK: 'https://t.me/ukussa_69_bot',
  OWNER_BOT_LINK: 'https://t.me/Ukussa_Admin49_Bot',
};
// ================================================================
//  Do NOT edit below this line
// ================================================================

const { spawnSync, spawn } = require('child_process');
const { existsSync, writeFileSync } = require('fs');
const path = require('path');

const REPO_URL = 'https://github.com/rajivkenzo23/xeducation-scheduler-bot.git';
const BOT_DIR  = 'xeducation-scheduler-bot';
const ENV_PATH = path.join(BOT_DIR, '.env');

// Restart throttle
let restartCount    = 0;
const MAX_RESTARTS   = 10;
const RESTART_WINDOW = 60000; // 1 minute
let lastRestartTime  = Date.now();

// ── Helpers ──────────────────────────────────────────────────────

function log(msg) { console.log(`[Launcher] ${msg}`); }
function err(msg) { console.error(`[Launcher] ❌ ${msg}`); }

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw new Error(`${cmd} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${cmd} exited with code ${result.status}`);
}

// ── Write .env ───────────────────────────────────────────────────

function writeEnv() {
  const lines = Object.entries(CONFIG)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  writeFileSync(ENV_PATH, lines + '\n', 'utf8');
  log('.env written successfully.');
}

// ── Install npm packages ─────────────────────────────────────────

function installDeps() {
  log('Installing npm dependencies...');
  run('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], BOT_DIR);
  log('Dependencies installed.');
}

// ── Clone or Pull ────────────────────────────────────────────────

function cloneOrPull() {
  if (!existsSync(BOT_DIR)) {
    log(`Cloning repo from ${REPO_URL} ...`);
    run('git', ['clone', REPO_URL, BOT_DIR]);
    log('Clone complete.');
  } else {
    log('Repo already exists. Pulling latest changes...');
    run('git', ['fetch', '--all'], BOT_DIR);
    run('git', ['reset', '--hard', 'origin/main'], BOT_DIR);
    log('Pull complete.');
  }
}

// ── Start the Bot ────────────────────────────────────────────────

function startBot() {
  log('Starting X - Education Scheduler Bot...');

  const child = spawn('node', ['index.js'], {
    cwd: BOT_DIR,
    stdio: 'inherit',
    shell: false,
  });

  child.on('error', (error) => {
    err(`Failed to start bot process: ${error.message}`);
    scheduleRestart();
  });

  child.on('exit', (code, signal) => {
    if (code === 0) {
      log('Bot exited cleanly (code 0). Not restarting.');
      return;
    }
    log(`Bot process exited. Code: ${code}, Signal: ${signal}`);
    scheduleRestart();
  });
}

function scheduleRestart() {
  const now = Date.now();

  if (now - lastRestartTime > RESTART_WINDOW) {
    restartCount = 0;
  }

  lastRestartTime = now;
  restartCount++;

  if (restartCount > MAX_RESTARTS) {
    err(`Bot has crashed ${MAX_RESTARTS} times in ${RESTART_WINDOW / 1000}s. Stopping restarts.`);
    err('Fix the error above, then run: node launcher.js');
    process.exit(1);
  }

  const delay = Math.min(5000 * restartCount, 30000);
  log(`Restarting in ${delay / 1000}s ... (Attempt ${restartCount}/${MAX_RESTARTS})`);
  setTimeout(startBot, delay);
}

// ── Main ─────────────────────────────────────────────────────────

function main() {
  log('══════════════════════════════════════════');
  log('  X - Education Scheduler Bot Launcher    ');
  log('══════════════════════════════════════════');

  if (CONFIG.BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    err('Please set your BOT_TOKEN in launcher.js before running!');
    process.exit(1);
  }
  if (CONFIG.ADMIN_ID === 'YOUR_TELEGRAM_ID_HERE') {
    err('Please set your ADMIN_ID in launcher.js before running!');
    process.exit(1);
  }
  if (CONFIG.GITHUB_TOKEN === 'YOUR_GITHUB_TOKEN_HERE') {
    err('Please set your GITHUB_TOKEN in launcher.js before running!');
    process.exit(1);
  }

  try {
    cloneOrPull();
    writeEnv();
    installDeps();
    startBot();
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
}

main();
