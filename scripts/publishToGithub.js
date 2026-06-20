const axios = require('axios');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.GITHUB_TOKEN;
const REPO_NAME = 'xeducation-scheduler-bot';
const USERNAME = 'rajivkenzo23';

if (!TOKEN) {
  console.error('❌ GITHUB_TOKEN not found in .env!');
  process.exit(1);
}

async function createRepo() {
  console.log(`🌐 Creating GitHub repository: ${USERNAME}/${REPO_NAME}...`);
  try {
    const res = await axios.post('https://api.github.com/user/repos', {
      name: REPO_NAME,
      private: true,
      description: 'Telegram Scheduler and Scraper Bot for X-Education'
    }, {
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'NodeJS-GitHub-Creator'
      }
    });
    console.log(`✅ Repository created successfully: ${res.data.html_url}`);
  } catch (error) {
    if (error.response && (error.response.status === 422 || error.response.status === 409)) {
      console.log('ℹ️ Repository already exists on GitHub. Proceeding to push...');
    } else {
      console.error('❌ Failed to create repository via API:', error.message);
      throw new Error(`GitHub repository creation failed with status ${error.response?.status || 'unknown'}`);
    }
  }
}

function runGit(args, cwd, authenticated = false) {
  const env = { ...process.env };
  if (authenticated) {
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${TOKEN}`).toString('base64')}`;
  }
  const result = spawnSync('git', args, { cwd, stdio: 'inherit', env });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
}

function runGitCommands() {
  const botDir = path.join(__dirname, '..');
  console.log(`🚀 Initializing local Git repository in ${botDir}...`);
  
  try {
    // Check if git is initialized
    if (!fs.existsSync(path.join(botDir, '.git'))) {
      runGit(['init'], botDir);
      console.log('✅ Git initialized.');
    }
    
    const remoteUrl = `https://github.com/${USERNAME}/${REPO_NAME}.git`;
    
    try {
      runGit(['remote', 'remove', 'origin'], botDir);
    } catch (_) {}
    
    runGit(['remote', 'add', 'origin', remoteUrl], botDir);
    console.log('✅ Remote origin added.');
    
    // Set branch name to main
    try {
      runGit(['branch', '-M', 'main'], botDir);
    } catch (_) {
      runGit(['checkout', '-b', 'main'], botDir);
    }

    // Add and commit files
    runGit(['add', '--', '.'], botDir);
    try {
      runGit(['commit', '-m', 'Initial commit of X-Education Scheduler Bot'], botDir);
      console.log('✅ Changes committed.');
    } catch (e) {
      console.log('ℹ️ Nothing to commit (working tree clean).');
    }

    // Push to GitHub
    console.log('📤 Pushing code to GitHub main branch...');
    runGit(['push', '-u', 'origin', 'main'], botDir, true);
    console.log('🎉 Code successfully pushed to GitHub!');
  } catch (error) {
    console.error('❌ Git commands failed:', error.message);
    throw error;
  }
}

async function start() {
  await createRepo();
  runGitCommands();
}

start().catch(error => {
  console.error('❌ Publish failed:', error.message);
  process.exitCode = 1;
});
