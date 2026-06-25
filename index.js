const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dns = require('dns');
const { execFile, execFileSync } = require('child_process');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID, 10);
const TARGET_CHANNEL = process.env.TARGET_CHANNEL_USERNAME || '@THEXEducation';
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://videoslk.eu.cc';
const MAIN_BOT_LINK = process.env.MAIN_BOT_LINK || 'https://t.me/ukussa_69_bot';
const OWNER_BOT_LINK = process.env.OWNER_BOT_LINK || 'https://t.me/Ukussa_Admin49_Bot';

if (!BOT_TOKEN || isNaN(ADMIN_ID)) {
  console.error('❌ BOT_TOKEN or ADMIN_ID is not configured in .env file!');
  process.exit(1);
}

const botOptions = {
  polling: {
    interval: 1000,
    autoStart: false,
    params: {
      timeout: 30
    }
  },
  request: {
    agentOptions: {
      keepAlive: true,
      family: 4
    }
  }
};

if (process.env.TELEGRAM_API_URL) {
  botOptions.baseApiUrl = process.env.TELEGRAM_API_URL;
}

const bot = new TelegramBot(BOT_TOKEN, botOptions);

bot.deleteWebHook()
  .then(() => {
    console.log('🔄 Webhook cleared successfully. Starting polling...');
    return bot.startPolling();
  })
  .catch((err) => {
    console.error('❌ Failed to clear webhook:', err.message);
    return bot.startPolling();
  });

const DATA_DIR = __dirname.endsWith('bot-repo')
  ? path.join(__dirname, '..', 'data')
  : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure directories exist
[DATA_DIR, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Load scheduler state
let state = {
  currentIndex: 0,
  schedulerEnabled: true,
  lastPostTime: null,
  nextPostTime: null,
  reviewingId: null,
  reviewMessageId: null,
  publishedPostIds: [],
  publishingPostId: null
};

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    } catch (e) {
      console.error('⚠️ Could not load state file, using defaults:', e.message);
    }
  }
}

function saveState() {
  const tempFile = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tempFile, STATE_FILE);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '');
}

function safeHttpUrl(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new Error(`${label} must be a valid URL`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} must use http or https`);
  if (parsed.username || parsed.password) throw new Error(`${label} must not contain credentials`);
  return parsed.toString();
}

function sanitizeTelegramHtml(value) {
  return String(value ?? '')
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attributes, content) => {
      const hrefMatch = attributes.match(/href\s*=\s*(["'])(.*?)\1/i);
      if (!hrefMatch) return content;
      try { return `<a href="${escapeHtml(safeHttpUrl(hrefMatch[2], 'Telegram link'))}">${content}</a>`; }
      catch (_) { return content; }
    })
    .replace(/<(?!\/?(?:a|b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler)\b)[^>]*>/gi, '')
    .replace(/<a\s+[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>/gi, (_, quote, href) => {
      try { return `<a href="${escapeHtml(safeHttpUrl(href, 'Telegram link'))}">`; }
      catch (_) { return ''; }
    });
}

// Load scraped posts
let posts = [];
function loadPosts() {
  if (fs.existsSync(POSTS_FILE)) {
    try {
      posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
      console.log(`✅ Loaded ${posts.length} posts from posts.json`);
    } catch (e) {
      console.error('❌ Could not parse posts.json:', e.message);
    }
  } else {
    console.warn('⚠️ posts.json not found! Please run "npm run scrape" to fetch historical posts.');
  }
}

loadState();
if (!Array.isArray(state.publishedPostIds)) state.publishedPostIds = [];
if (!Number.isInteger(state.publishingPostId)) state.publishingPostId = null;
loadPosts();

let scraperRunning = false;
if (posts.length === 0) {
  console.log('⚠️ posts.json is empty! Running scraper automatically...');
  scraperRunning = true;
  const { exec } = require('child_process');
  exec(`"${process.execPath}" scripts/scrape.js`, (err, stdout, stderr) => {
    scraperRunning = false;
    if (stdout) console.log(`[Scraper stdout]:\n${stdout}`);
    if (stderr) console.error(`[Scraper stderr]:\n${stderr}`);
    if (err) {
      console.error('❌ Automatic scraping failed:', err.message);
      return;
    }
    console.log('✅ Automatic scraping finished!');
    loadPosts();
    bot.sendMessage(ADMIN_ID, `🔄 *Auto-Scrape Complete:* Scraped and loaded *${posts.length}* posts automatically.`).catch(() => {});
  });
}

// Admin session storage for editing
const adminSession = {};

// Clean and format post text
function formatPostText(rawHtml, originalId) {
  if (!rawHtml) return '';

  // 1. Replace block/break tags with newlines before stripping
  let cleaned = rawHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n');

  // 2. Strip unsupported tags, keeping only Telegram supported tags
  cleaned = cleaned.replace(/<(?!(\/?(a|b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler)\b))[^>]+>/gi, '');

  // 3. Replace old owner handles and links
  cleaned = cleaned.replace(/t\.me\/Mr_Karlos_555/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@Mr_Karlos_555/gi, OWNER_BOT_LINK);
  cleaned = cleaned.replace(/t\.me\/Mr_lucky_08/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@Mr_lucky_08/gi, OWNER_BOT_LINK);
  cleaned = cleaned.replace(/t\.me\/wizard_ka/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@wizard_ka/gi, OWNER_BOT_LINK);
  
  // 4. Replace old channel names and links
  cleaned = cleaned.replace(/t\.me\/Mahavanshaya_xedu/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@Mahavanshaya_xedu/gi, '@THEXEducation');
  cleaned = cleaned.replace(/t\.me\/Mahavanshaya/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@Mahavanshaya/gi, '@THEXEducation');
  cleaned = cleaned.replace(/මහාවංශය(\s*2\.0)?/g, 'X - Education🔞🍃');
  cleaned = cleaned.replace(/Mahavanshaya/gi, 'X - Education🔞🍃');

  // Create website read page slug (replace <br> with \n first for correct title extraction)
  const cleanTitle = rawHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)[0] // Get first non-empty line
    .replace(/[^\w\s\u0d80-\u0dff]/g, '') // Clean punctuation
    .trim()
    .slice(0, 120) || `Sex Education Post ${originalId}`;
    
  const slug = generateSlug(cleanTitle, originalId);
  const articleUrl = `${WEBSITE_URL}/unlock-article.html?id=${slug}`;

  // Create teaser (first 2 non-empty lines)
  const cleanedLines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
  const teaser = cleanedLines.slice(0, 2).join('\n') + (cleanedLines.length > 2 ? '...' : '');

  // Format the text with beautiful super emojis and call to action
  let formatted = `🔞🍃 <b>${escapeHtml(cleanTitle)}</b>\n\n` +
                  `${sanitizeTelegramHtml(teaser)}\n\n` +
                  `📚 <b>සම්පූර්ණ ලිපිය කියවන්න (Read Full Article):</b>\n` +
                  `👉 <a href="${articleUrl}">මෙහි ක්ලික් කරන්න (Click Here to Unlock)</a>`;

  return sanitizeTelegramHtml(formatted);
}

function generateSlug(title, id) {
  // Simple slugifier
  let slug = title
    .toLowerCase()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{FE0F}]/gu, '')
    .replace(/[^\x00-\x7F]/g, '') // Remove non-ascii
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);

  if (slug.length < 5) slug = 'sex-education-article';
  return `${slug}-${id}`;
}

// Download media file helper
async function downloadMedia(url, filename) {
  const safeUrl = safeHttpUrl(url, 'Media URL');
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename) throw new Error('Invalid media filename');
  const filePath = path.join(TEMP_DIR, safeFilename);
  const response = await axios({
    url: safeUrl,
    method: 'GET',
    responseType: 'stream',
    timeout: 20000,
    maxRedirects: 3,
    maxContentLength: 10 * 1024 * 1024
  });
  const writer = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    let received = 0;
    const fail = (error) => {
      writer.destroy();
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
      reject(error);
    };
    response.data.on('data', chunk => {
      received += chunk.length;
      if (received > 10 * 1024 * 1024) response.data.destroy(new Error('Media exceeds 10 MB limit'));
    });
    response.data.on('error', fail);
    writer.on('finish', () => resolve(filePath));
    writer.on('error', fail);
    response.data.pipe(writer);
  });
}

// Git Push Helper to update Website repository
function validateGitConfig(repo, branch) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Invalid GITHUB_REPO');
  if (!/^[A-Za-z0-9._\/-]+$/.test(branch) || branch.includes('..')) throw new Error('Invalid GITHUB_BRANCH');
}

function gitAuthEnv(token) {
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`
  };
}

function runGit(args, cwd, token) {
  return execFileSync('git', args, { cwd, stdio: 'pipe', env: gitAuthEnv(token) });
}

function hasStagedGitChanges(cwd, token) {
  try {
    runGit(['diff', '--cached', '--quiet'], cwd, token);
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    throw error;
  }
}

function runGitAsync(args, cwd, token) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, env: gitAuthEnv(token) }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout);
    });
  });
}

async function waitForPublishedUrl(url, attempts = 12, delayMs = 10000) {
  const safeUrl = safeHttpUrl(url, 'Published article URL');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await axios.get(safeUrl, {
        timeout: 10000,
        maxRedirects: 3,
        validateStatus: status => status >= 200 && status < 400
      });
      return;
    } catch (error) {
      if (attempt === attempts) throw new Error(`Published page was not ready: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

function cleanArticleHtml(rawHtml) {
  if (!rawHtml) return '';
  let cleaned = rawHtml;

  // Replace old owner handles and links
  cleaned = cleaned.replace(/t\.me\/Mr_Karlos_555/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@Mr_Karlos_555/gi, OWNER_BOT_LINK);
  cleaned = cleaned.replace(/t\.me\/Mr_lucky_08/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@Mr_lucky_08/gi, OWNER_BOT_LINK);
  cleaned = cleaned.replace(/t\.me\/wizard_ka/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@wizard_ka/gi, OWNER_BOT_LINK);
  
  // Replace old channel names and links
  cleaned = cleaned.replace(/t\.me\/Mahavanshaya_xedu/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@Mahavanshaya_xedu/gi, '@THEXEducation');
  cleaned = cleaned.replace(/t\.me\/Mahavanshaya/gi, 't.me/THEXEducation');
  cleaned = cleaned.replace(/@Mahavanshaya/gi, '@THEXEducation');
  cleaned = cleaned.replace(/මහාවංශය(\s*2\.0)?/g, 'X - Education🔞🍃');
  cleaned = cleaned.replace(/Mahavanshaya/gi, 'X - Education🔞🍃');

  return cleaned;
}

async function publishArticleToWebsite(slug, title, bodyHtml, photoUrl) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN || GITHUB_TOKEN === 'YOUR_NEW_GITHUB_TOKEN') {
    throw new Error('GITHUB_TOKEN is not configured in .env file!');
  }

  console.log(`🌐 Publishing article ${slug} to website API...`);
  try {
    let thumbnailUrl = '';
    
    // 1. Download and Upload Thumbnail to Assets Repo via Website API
    if (photoUrl) {
      try {
        console.log(`🖼️ Downloading photo from Telegram...`);
        const tempPhotoPath = await downloadMedia(photoUrl, `${slug}_thumb.jpg`);
        const base64Data = fs.readFileSync(tempPhotoPath, { encoding: 'base64' });
        fs.unlinkSync(tempPhotoPath);

        console.log(`🖼️ Uploading thumbnail to Website API...`);
        const uploadResponse = await axios.post(`${WEBSITE_URL}/api/admin/upload`, {
          filename: `${slug}.jpg`,
          type: 'thumb',
          base64Data: base64Data
        }, {
          headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        if (uploadResponse.data && uploadResponse.data.ok) {
          thumbnailUrl = uploadResponse.data.url;
          console.log(`✅ Thumbnail uploaded successfully. CDN URL: ${thumbnailUrl}`);
        } else {
          throw new Error(uploadResponse.data.error || 'Unknown upload error');
        }
      } catch (uploadErr) {
        console.warn(`⚠️ Failed to upload article thumbnail (expired link?):`, uploadErr.message);
        thumbnailUrl = ''; // Fallback: no thumbnail
      }
    }

    // 2. Publish Article Metadata and Content to D1 via Website API
    console.log(`📝 Sending article metadata to D1...`);
    const cleanContent = cleanArticleHtml(bodyHtml);
    const publishResponse = await axios.post(`${WEBSITE_URL}/api/admin/articles`, {
      id: slug,
      title: title,
      content: cleanContent,
      thumbnail: thumbnailUrl,
      views: Math.floor(Math.random() * 8000) + 1500,
      category: 'sex-education',
      tags: ['sex-education', 'srilanka', 'article']
    }, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (publishResponse.data && publishResponse.data.ok) {
      console.log(`✅ Article published successfully to database!`);
    } else {
      throw new Error(publishResponse.data.error || 'Unknown publish error');
    }

  } catch (err) {
    const errorDetails = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    console.error('❌ Failed to publish article to website:', errorDetails);
    throw new Error(`Failed to publish article: ${errorDetails}`);
  }
}

// Prepare next post for review DMs
async function sendPostForReview(postIndex) {
  if (postIndex < 0 || postIndex >= posts.length) {
    bot.sendMessage(ADMIN_ID, `🏁 *All posts in the queue have been reviewed!*`, { parse_mode: 'Markdown' });
    return;
  }

  const post = posts[postIndex];
  state.reviewingId = post.id;
  saveState();

  const formattedText = formatPostText(post.textHtml, post.id);

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Approve & Post', callback_data: `approve:${post.id}` },
        { text: '⏭ Skip', callback_data: `skip:${post.id}` }
      ],
      [
        { text: '📝 Edit Text', callback_data: `edit:${post.id}` }
      ]
    ]
  };

  const draftHeader = `📝 <b>DAILY REVIEW DRAFT</b> (Post ID: ${post.id}, Queue Index: ${postIndex})\n\n`;
  const fullReviewText = draftHeader + formattedText;

  let localPath = null;
  try {
    let sentMsg;
    if (post.photoUrl) {
      try {
        const filename = `preview_${post.id}.jpg`;
        localPath = await downloadMedia(post.photoUrl, filename);
      } catch (dlErr) {
        console.error('⚠️ Failed to download review photo locally:', dlErr.message);
      }
    }

    // Send as native photo only if combined text fits safely in caption limit (950 chars for safety)
    if (localPath && fullReviewText.length <= 950) {
      sentMsg = await bot.sendPhoto(ADMIN_ID, localPath, {
        caption: fullReviewText,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    } else {
      // If photo exists but text is too long, send photo first, then text message with keyboard
      if (localPath) {
        await bot.sendPhoto(ADMIN_ID, localPath).catch(err => console.error('⚠️ Failed to pre-send photo:', err.message));
      }
      sentMsg = await bot.sendMessage(ADMIN_ID, fullReviewText, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }
    state.reviewMessageId = sentMsg.message_id;
    saveState();
  } catch (error) {
    console.error('❌ Failed to send review message to admin:', error.message);
    // Fallback to text-only if media fails
    try {
      const sentMsg = await bot.sendMessage(ADMIN_ID, `⚠️ <b>Media Failed to Load. Text Draft:</b>\n\n${formattedText}`, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      state.reviewMessageId = sentMsg.message_id;
      saveState();
    } catch (e) {
      console.error('❌ Critical failure sending draft:', e.message);
    }
  } finally {
    if (localPath && fs.existsSync(localPath)) {
      try { fs.unlinkSync(localPath); } catch (_) {}
    }
  }
}

// Callback Query handlers
bot.on('callback_query', async (query) => {
  const data = query.data || '';
  const adminId = query.from.id;
  if (adminId !== ADMIN_ID) return;

  const [action, postIdStr] = data.split(':');
  const postId = parseInt(postIdStr, 10);

  if (action === 'approve') {
    await bot.answerCallbackQuery(query.id, { text: '📤 Publishing...' });
    const post = posts.find(p => p.id === postId);
    if (!post) {
      bot.sendMessage(ADMIN_ID, '❌ Post not found in data store!');
      return;
    }
    if (state.publishedPostIds.includes(postId)) {
      await bot.sendMessage(ADMIN_ID, `ℹ️ Post ${postId} was already published.`);
      return;
    }
    if (state.publishingPostId !== null) {
      await bot.sendMessage(ADMIN_ID, `⏳ Post ${state.publishingPostId} is already being published.`);
      return;
    }
    state.publishingPostId = postId;
    saveState();

    // Cleaned Text
    const originalText = formatPostText(post.textHtml, post.id);
    const finalPostText = sanitizeTelegramHtml(adminSession[adminId]?.editedText || originalText);

    try {
      // Helper to update admin message status
      const updateAdminStatus = async (text) => {
        try {
          await bot.editMessageCaption(text, {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
          });
        } catch (_) {
          try {
            await bot.editMessageText(text, {
              chat_id: ADMIN_ID,
              message_id: query.message.message_id,
              parse_mode: 'Markdown'
            });
          } catch (e) {}
        }
      };

      await updateAdminStatus(`🌐 *Publishing article to website and pushing to GitHub...*\nPlease wait.`);

      // 1. Publish to website first (and await Git push completion)
      const cleanTitle = post.textHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]*>/g, '') // strip HTML
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)[0]
        .replace(/[^\w\s\u0d80-\u0dff]/g, '')
        .trim()
        .slice(0, 120) || `Sex Education Post ${post.id}`;
        
      const slug = generateSlug(cleanTitle, post.id);

      await publishArticleToWebsite(slug, cleanTitle, post.textHtml, post.photoUrl);
      console.log('✅ Article pushed to GitHub.');

      // 2. Verify the deployed article is reachable before publishing its link.
      await updateAdminStatus('⏳ *Website updated!* Waiting for the article URL to become reachable...');
      await waitForPublishedUrl(`${WEBSITE_URL}/article/${encodeURIComponent(slug)}.html`);

      // 3. Post to the Telegram Channel
      if (post.photoUrl && finalPostText.length <= 1024) {
        const filename = `post_${post.id}.jpg`;
        const localPath = await downloadMedia(post.photoUrl, filename);
        
        await bot.sendPhoto(TARGET_CHANNEL, localPath, {
          caption: finalPostText,
          parse_mode: 'HTML'
        });
        
        fs.rmSync(localPath, { force: true });
      } else {
        let textToSend = finalPostText;
        if (post.photoUrl) {
          textToSend = `<a href="${post.photoUrl}">&#8203;</a>` + textToSend;
        }
        await bot.sendMessage(TARGET_CHANNEL, textToSend, {
          parse_mode: 'HTML'
        });
      }

      console.log(`✅ Posted to ${TARGET_CHANNEL}`);

      // 4. Update admin message to final success
      await updateAdminStatus(`✅ *Published successfully to ${TARGET_CHANNEL} and website!*`);

      // 5. Update state
      state.currentIndex = posts.findIndex(p => p.id === postId) + 1;
      state.lastPostTime = new Date().toISOString();
      state.nextPostTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours later
      state.reviewingId = null;
      state.reviewMessageId = null;
      state.publishingPostId = null;
      state.publishedPostIds = [...new Set([...state.publishedPostIds, postId])].slice(-1000);
      saveState();

      // Clear edit session
      delete adminSession[adminId];

    } catch (err) {
      state.publishingPostId = null;
      saveState();
      console.error('❌ Failed to publish post:', err.message);
      bot.sendMessage(ADMIN_ID, `❌ *Failed to publish:* ${err.message}`);
    }
  } 
  else if (action === 'skip') {
    await bot.answerCallbackQuery(query.id, { text: '⏭ Skipped' });
    
    // Update state to next index
    state.currentIndex = posts.findIndex(p => p.id === postId) + 1;
    state.reviewingId = null;
    state.reviewMessageId = null;
    saveState();

    await bot.editMessageText(`⏭ *Post ID ${postId} skipped.*`, {
      chat_id: ADMIN_ID,
      message_id: query.message.message_id
    }).catch(() => {
      bot.editMessageCaption(`⏭ *Post ID ${postId} skipped.*`, {
        chat_id: ADMIN_ID,
        message_id: query.message.message_id
      });
    });

    delete adminSession[adminId];
    
    // Instantly queue next post review
    setTimeout(() => sendPostForReview(state.currentIndex), 1000);
  }
  else if (action === 'edit') {
    await bot.answerCallbackQuery(query.id);
    adminSession[adminId] = {
      editingPostId: postId,
      step: 'waiting_edit_text'
    };
    bot.sendMessage(ADMIN_ID, '📝 *Please paste or type the new formatted text for this post:*', { parse_mode: 'Markdown' });
  }
});

// Message listener for edits or commands
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text ? msg.text.trim() : null;

  if (userId !== ADMIN_ID) return;

  // Handle Edit session text input
  if (adminSession[userId] && adminSession[userId].step === 'waiting_edit_text' && text) {
    const postId = adminSession[userId].editingPostId;
    const post = posts.find(p => p.id === postId);

    // Save edited text
    adminSession[userId].editedText = text;
    adminSession[userId].step = null;

    bot.sendMessage(ADMIN_ID, '✅ *Text updated!* Review the draft below again and click Approve to publish.', { parse_mode: 'Markdown' });

    // Resend/update the review message with the new text
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve & Post', callback_data: `approve:${postId}` },
          { text: '⏭ Skip', callback_data: `skip:${postId}` }
        ],
        [
          { text: '📝 Edit Text Again', callback_data: `edit:${postId}` }
        ]
      ]
    };

    const draftHeader = `📝 <b>EDITED DRAFT</b> (Post ID: ${postId})\n\n`;
    const fullDraftText = draftHeader + text;

    let localPath = null;
    try {
      if (post.photoUrl) {
        try {
          const filename = `edit_preview_${postId}.jpg`;
          localPath = await downloadMedia(post.photoUrl, filename);
        } catch (dlErr) {
          console.error('⚠️ Failed to download edit preview photo locally:', dlErr.message);
        }
      }

      if (localPath && fullDraftText.length <= 950) {
        await bot.sendPhoto(ADMIN_ID, localPath, {
          caption: fullDraftText,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } else {
        if (localPath) {
          await bot.sendPhoto(ADMIN_ID, localPath).catch(err => console.error('⚠️ Failed to pre-send photo:', err.message));
        }
        await bot.sendMessage(ADMIN_ID, fullDraftText, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }
    } catch (error) {
      console.error('❌ Failed to send edited review message to admin:', error.message);
      try {
        await bot.sendMessage(ADMIN_ID, `⚠️ <b>Media Failed. Edited Text Draft:</b>\n\n${text}`, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } catch (e) {
        console.error('❌ Critical failure sending edited draft:', e.message);
      }
    } finally {
      if (localPath && fs.existsSync(localPath)) {
        try { fs.unlinkSync(localPath); } catch (_) {}
      }
    }
    return;
  }

  if (!text) return;

  // commands
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    const command = parts[0].split('@')[0].toLowerCase();
    const arg = parts[1];

    if (command === '/start' || command === '/status') {
      const stats = `📊 *X-Education Scheduler Bot Status*\n\n` +
                    `📦 Total Posts Scraped: ${posts.length}\n` +
                    `👉 Current Post Index: ${state.currentIndex}\n` +
                    `🎯 Destination: ${TARGET_CHANNEL}\n` +
                    `⏱ Scheduler Enabled: ${state.schedulerEnabled ? '✅ Yes' : '⛔ Paused'}\n` +
                    `⏱ Next Post Review Time: ${state.nextPostTime ? state.nextPostTime : 'Not scheduled'}\n` +
                    `📝 Currently Reviewing: ${state.reviewingId ? `Post ID ${state.reviewingId}` : 'None'}\n\n` +
                    `🛠 *Available Commands:*\n` +
                    `• \`/start\` or \`/status\` - Show bot stats and list all commands.\n` +
                    `• \`/trigger\` - Force-send the next queued post to your DM for review.\n` +
                    `• \`/setindex [number]\` - Set the queue index to a specific post number.\n` +
                    `• \`/toggle\` - Enable or pause the automatic 24-hour scheduler.\n` +
                    `• \`/reset\` - Start fresh (resets index to 0 and clears history).\n` +
                    `• \`/post [number]\` - Force-send a specific post by index to your DM.\n` +
                    `• \`/scrape\` - Re-scrape historical posts from the Telegram channel.`;
      bot.sendMessage(chatId, stats, { parse_mode: 'Markdown' });
    }
    else if (command === '/trigger') {
      if (scraperRunning) {
        bot.sendMessage(chatId, '⏳ *Scraper is currently running in the background!* Please wait for it to finish (this can take 1-2 minutes).', { parse_mode: 'Markdown' });
        return;
      }
      bot.sendMessage(chatId, '🔄 *Forcing next post review...*', { parse_mode: 'Markdown' });
      sendPostForReview(state.currentIndex);
    }
    else if (command === '/setindex') {
      const idx = parseInt(arg, 10);
      if (isNaN(idx) || idx < 0 || idx >= posts.length) {
        bot.sendMessage(chatId, `❌ *Invalid index!* Enter a number between 0 and ${posts.length - 1}`);
        return;
      }
      state.currentIndex = idx;
      state.reviewingId = null;
      saveState();
      bot.sendMessage(chatId, `✅ *Post index set to ${idx}.* Next post ID: ${posts[idx].id}`);
    }
    else if (command === '/toggle') {
      state.schedulerEnabled = !state.schedulerEnabled;
      saveState();
      bot.sendMessage(chatId, `⏱ *Scheduler is now ${state.schedulerEnabled ? 'ENABLED' : 'PAUSED'}.*`);
    }
    else if (command === '/reset') {
      state.currentIndex = 0;
      state.publishedPostIds = [];
      state.reviewingId = null;
      state.reviewMessageId = null;
      state.publishingPostId = null;
      saveState();
      bot.sendMessage(chatId, `🔄 *Scheduler Bot Memory has been fully reset!* Index is at 0, and all published history has been cleared.`);
    }
    else if (command === '/post') {
      const idx = parseInt(arg, 10);
      if (isNaN(idx) || idx < 0 || idx >= posts.length) {
        bot.sendMessage(chatId, `❌ *Invalid index!* Enter a number between 0 and ${posts.length - 1}`);
        return;
      }
      sendPostForReview(idx);
    }
    else if (command === '/scrape') {
      if (scraperRunning) {
        bot.sendMessage(chatId, '⏳ *Scraper is already running in the background!*', { parse_mode: 'Markdown' });
        return;
      }
      bot.sendMessage(chatId, '📡 *Starting scraper in the background...* please wait.', { parse_mode: 'Markdown' });
      scraperRunning = true;
      const { exec } = require('child_process');
      exec(`"${process.execPath}" scripts/scrape.js`, (err, stdout, stderr) => {
        scraperRunning = false;
        if (stdout) console.log(`[Scraper stdout]:\n${stdout}`);
        if (stderr) console.error(`[Scraper stderr]:\n${stderr}`);
        if (err) {
          const errMsg = stderr ? stderr.trim() : err.message;
          bot.sendMessage(chatId, `❌ *Scrape failed:* ${errMsg}`, { parse_mode: 'Markdown' });
          return;
        }
        loadPosts();
        bot.sendMessage(chatId, `✅ *Scraper finished successfully!*\n📦 Loaded *${posts.length}* posts from posts.json.\nUse \`/trigger\` to review the first post.`, { parse_mode: 'Markdown' });
      });
    }

  }
});

// Scheduler loop (runs every 60 seconds)
setInterval(() => {
  if (!state.schedulerEnabled || posts.length === 0) return;
  if (state.reviewingId) return; // Wait until current post in review is resolved

  const now = new Date();
  
  if (!state.nextPostTime) {
    // Schedule first review immediately
    state.nextPostTime = new Date().toISOString();
    saveState();
  }

  const nextTime = new Date(state.nextPostTime);
  if (now >= nextTime) {
    console.log('⏰ Scheduler triggered: Sending post for review...');
    sendPostForReview(state.currentIndex);
  }
}, 60000);

console.log('🚀 X-Education Scheduler Bot is online!');
console.log(`👤 Admin ID: ${ADMIN_ID}`);
console.log(`📢 Destination Channel: ${TARGET_CHANNEL}`);
