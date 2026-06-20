const { spawnSync, spawn } = require('child_process');
const { existsSync, copyFileSync } = require('fs');
const path = require('path');

const REPO_URL = 'https://github.com/rajivkenzo23/xeducation-scheduler-bot.git';
const BOT_DIR = 'bot-repo';

let nodeRestartCount = 0;
const maxNodeRestarts = 5;
const restartWindow = 30000; // 30 seconds
let lastRestartTime = Date.now();
let childProcess = null;

function cloneRepository() {
  console.log('📥 Cloning the repository...');
  const result = spawnSync('git', ['clone', REPO_URL, BOT_DIR], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('❌ Failed to clone the repository.');
    process.exit(1);
  }
}

function updateRepository() {
  console.log('🔄 Pulling latest changes from git...');
  const result = spawnSync('git', ['pull', '--ff-only'], { cwd: BOT_DIR, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('❌ git pull failed. Refusing to run an unknown or divergent revision.');
    process.exit(1);
  }
}

function installDependencies() {
  console.log('📦 Installing dependencies...');
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['ci', '--no-audit', '--no-fund'], {
    cwd: BOT_DIR,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' }
  });
  if (result.status !== 0) {
    console.error('❌ Failed to install dependencies.');
    process.exit(1);
  }
}

function syncEnvironment() {
  const rootEnv = path.resolve('.env');
  const destEnv = path.resolve(BOT_DIR, '.env');
  if (existsSync(rootEnv)) {
    try {
      copyFileSync(rootEnv, destEnv);
      console.log('🔐 Environment file synced.');
    } catch (err) {
      console.error(`❌ Failed to sync .env: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.error('❌ No .env file found in root directory.');
    process.exit(1);
  }
}

function startBot() {
  console.log('🚀 Starting bot...');
  childProcess = spawn('node', ['index.js'], { cwd: BOT_DIR, stdio: 'inherit' });

  childProcess.on('exit', (code, signal) => {
    childProcess = null;
    if (code === 0 || signal === 'SIGTERM' || signal === 'SIGINT') {
      console.log('👋 Bot stopped gracefully.');
      process.exit(0);
    }

    const currentTime = Date.now();
    if (currentTime - lastRestartTime > restartWindow) {
      nodeRestartCount = 0;
    }
    lastRestartTime = currentTime;
    nodeRestartCount++;

    if (nodeRestartCount > maxNodeRestarts) {
      console.error('❌ Bot is crashing continuously. Stopping restarts.');
      process.exit(1);
    }

    console.log(`⚠️ Bot process exited with code ${code}. Restarting... (Attempt ${nodeRestartCount}/${maxNodeRestarts})`);
    setTimeout(startBot, 2000);
  });
}

// Handle termination signals to cleanly shut down the child bot process
function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}, shutting down...`);
  if (childProcess) {
    childProcess.kill(signal);
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Main execution flow
if (!existsSync(BOT_DIR)) {
  cloneRepository();
} else {
  updateRepository();
}

syncEnvironment();
installDependencies();
startBot();
