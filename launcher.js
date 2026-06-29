/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║             X - Education Scheduler Bot — Launcher           ║
 * ║  Drop this file on your Pterodactyl server as launcher.js    ║
 * ║  Set Startup file to launcher.js                             ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ⚙️ Configurations (Default fallbacks — will be overridden by Panel Startup Env if present)
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || '8867230082:AAH02oTb9Dw3gtX622fiAxEMz1kn3wX1ntA',
  ADMIN_ID: process.env.ADMIN_ID || '8667419475',
  TARGET_CHANNEL_USERNAME: process.env.TARGET_CHANNEL_USERNAME || '@THEXEducation',
  WEBSITE_URL: process.env.WEBSITE_URL || 'https://videoslk.eu.cc',
  MAIN_BOT_LINK: process.env.MAIN_BOT_LINK || 'https://t.me/ukussa_69_bot',
  OWNER_BOT_LINK: process.env.OWNER_BOT_LINK || 'https://t.me/Ukussa_Admin49_Bot',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'YOUR_GITHUB_TOKEN_HERE',
  GITHUB_USERNAME: 'rajivkenzo23',
  GITHUB_REPO: 'rajivkenzo23/VideoLK',
  GITHUB_BRANCH: 'main',
  TELEGRAM_API_ID: process.env.TELEGRAM_API_ID || '35481411',
  TELEGRAM_API_HASH: process.env.TELEGRAM_API_HASH || '5db076b70a26a9e703fcd7c27ea8fc58',
  TELEGRAM_SESSION: process.env.TELEGRAM_SESSION || '',
  STREAMTAPE_LOGIN: process.env.STREAMTAPE_LOGIN || '15a6b6d591b99774fe65',
  STREAMTAPE_KEY: process.env.STREAMTAPE_KEY || 'De0xQO7DjxUkpwx'
};

const REPO_URL = 'https://github.com/rajivkenzo23/xeducation-scheduler-bot.git';
const BOT_DIR = __dirname;
const ENV_PATH = path.join(BOT_DIR, '.env');

// Restart variables
let restartCount = 0;
const MAX_RESTARTS = 10;
const RESTART_WINDOW = 60000;
let lastRestartTime = Date.now();

function log(msg) { console.log(`[Launcher] ${msg}`); }
function err(msg) { console.error(`[Launcher] ❌ ${msg}`); }

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  if (result.error) throw new Error(`${cmd} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${cmd} exited with code ${result.status}`);
}

function cloneOrPull() {
  log('Checking git repository status...');
  if (!fs.existsSync(path.join(BOT_DIR, '.git'))) {
    log('Initializing new Git repository...');
    run('git', ['init'], BOT_DIR);
    run('git', ['remote', 'add', 'origin', REPO_URL], BOT_DIR);
  } else {
    // Update remote URL in case it changed
    try {
      run('git', ['remote', 'set-url', 'origin', REPO_URL], BOT_DIR);
    } catch (_) {}
  }

  log('Pulling latest files from GitHub...');
  try {
    run('git', ['fetch', 'origin', 'main'], BOT_DIR);
    run('git', ['reset', '--hard', 'origin/main'], BOT_DIR);
    log('Files updated successfully.');
  } catch (e) {
    err(`Git update failed: ${e.message}`);
  }
}

function writeEnv() {
  log('Writing configuration to .env file...');
  let existing = {};
  
  // Try to preserve existing custom .env keys
  if (fs.existsSync(ENV_PATH)) {
    try {
      const content = fs.readFileSync(ENV_PATH, 'utf8');
      content.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const k = parts[0].trim();
          const v = parts.slice(1).join('=').trim();
          if (k) existing[k] = v;
        }
      });
    } catch (_) {}
  }

  // Merge (CONFIG takes precedence, but custom keys are preserved)
  const merged = { ...existing, ...CONFIG };

  const lines = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  fs.writeFileSync(ENV_PATH, lines + '\n', 'utf8');
  log('.env file updated.');
}

function installDeps() {
  log('Checking dependencies...');
  try {
    run('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], BOT_DIR);
  } catch (e) {
    err(`Npm install failed: ${e.message}`);
  }
}

function startBot() {
  log('Starting X-Education scheduler bot process...');
  const child = spawn('node', ['index.js'], {
    cwd: BOT_DIR,
    stdio: 'inherit',
    shell: false
  });

  child.on('error', (error) => {
    err(`Failed to start bot process: ${error.message}`);
    scheduleRestart();
  });

  child.on('exit', (code, signal) => {
    if (code === 0) {
      log('Bot exited cleanly (code 0).');
      return;
    }
    err(`Bot process exited with code ${code} and signal ${signal}`);
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
    err(`Bot has crashed ${MAX_RESTARTS} times in ${RESTART_WINDOW / 1000}s. Stopping.`);
    process.exit(1);
  }

  const delayMs = Math.min(3000 * restartCount, 30000);
  log(`Restarting bot in ${delayMs / 1000}s...`);
  setTimeout(startBot, delayMs);
}

function main() {
  cloneOrPull();
  writeEnv();
  installDeps();
  startBot();
}

main();
