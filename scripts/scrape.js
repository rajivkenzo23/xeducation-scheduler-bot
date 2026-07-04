const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Target channel info
const CHANNEL_NAME = 'Mahavanshaya_xedu';
const FIRST_POST_ID = parseInt(process.env.SCRAPE_START_ID, 10) || 61;
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'posts.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper for delaying requests
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Clean text formatting for telegram-compatible tags (Web preview fallback)
function sanitizeHtml(html) {
  if (!html) return '';
  const $ = cheerio.load(html, null, false);
  $('*').each((i, el) => {
    const tagName = el.tagName.toLowerCase();
    const allowed = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'a', 'code', 'pre', 'br'];
    if (!allowed.includes(tagName)) {
      $(el).replaceWith($(el).html() || $(el).text());
    } else if (tagName === 'a') {
      const href = $(el).attr('href');
      $(el).removeAttr('class').removeAttr('target').removeAttr('rel');
      if (href) $(el).attr('href', href);
      else $(el).replaceWith($(el).html() || $(el).text());
    } else {
      $(el).each((_, element) => { element.attribs = {}; });
    }
  });
  return $.html().replace(/&nbsp;/g, ' ').trim();
}

// Old Cheerio Web Scraper (fallback)
async function scrapePage(beforeId = null) {
  let url = `https://t.me/s/${CHANNEL_NAME}`;
  if (beforeId) url += `?before=${beforeId}`;

  console.log(`📡 Fetching: ${url}`);
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const messages = [];

    $('.tgme_widget_message').each((index, element) => {
      const $el = $(element);
      const postPath = $el.attr('data-post') || '';
      if (!postPath || !postPath.includes('/')) return;

      const id = parseInt(postPath.split('/')[1], 10);
      if (isNaN(id)) return;

      const textHtmlEl = $el.find('.tgme_widget_message_text');
      const textHtml = textHtmlEl.length > 0 ? sanitizeHtml(textHtmlEl.html()) : '';

      let photoUrl = '';
      const photoEl = $el.find('.tgme_widget_message_photo_wrap');
      if (photoEl.length > 0) {
        const style = photoEl.attr('style') || '';
        const match = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
        if (match) photoUrl = match[1];
      }

      let videoUrl = '';
      const videoEl = $el.find('.tgme_widget_message_video');
      if (videoEl.length > 0) {
        const videoSrc = videoEl.find('video').attr('src');
        if (videoSrc) {
          videoUrl = videoSrc;
        } else {
          const videoPlayEl = $el.find('.tgme_widget_message_video_player');
          const style = videoPlayEl.attr('style') || '';
          const match = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
          if (match) photoUrl = match[1];
        }
      }

      const dateEl = $el.find('.tgme_widget_message_date time');
      const datetime = dateEl.attr('datetime') || '';

      if (!textHtml && !photoUrl && !videoUrl) return;

      messages.push({
        id,
        textHtml,
        photoUrl,
        videoUrl,
        datetime,
        originalUrl: `https://t.me/${postPath}`
      });
    });

    return messages;
  } catch (error) {
    console.error(`❌ Error scraping page: ${error.message}`);
    return null;
  }
}

async function runSlowWebScraper() {
  console.log(`📡 Falling back to slow web-preview scraping...`);
  let allPosts = {};
  let beforeId = null;
  let hasMore = true;
  let consecutiveErrors = 0;

  while (hasMore) {
    const posts = await scrapePage(beforeId);
    if (!posts || posts.length === 0) {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) break;
      await sleep(5000);
      continue;
    }
    consecutiveErrors = 0;

    let minId = Infinity;
    posts.forEach(post => {
      if (post.id < minId) minId = post.id;
      if (post.id >= FIRST_POST_ID) {
        allPosts[post.id] = post;
      }
    });

    console.log(`➡️ Processed ${posts.length} posts. Min ID on page: ${minId}`);
    if (minId <= FIRST_POST_ID || minId === Infinity || posts.length < 5) {
      hasMore = false;
    } else {
      beforeId = minId;
      await sleep(1500 + Math.random() * 1000);
    }
  }

  const sortedPosts = Object.values(allPosts).sort((a, b) => a.id - b.id);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sortedPosts, null, 2), 'utf8');
  console.log(`\n🎉 Scraper Finished! Total posts: ${sortedPosts.length}`);
}

// Main Runner
async function main() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionStr = process.env.TELEGRAM_SESSION;

  if (!apiId || !apiHash || !sessionStr || sessionStr === 'YOUR_TELEGRAM_SESSION_HERE') {
    await runSlowWebScraper();
    return;
  }

  console.log(`🚀 Starting GramJS-powered Fast Scraper for @${CHANNEL_NAME}`);
  console.log(`📍 Target post range: ID ${FIRST_POST_ID} to Latest`);

  try {
    const stringSession = new StringSession(sessionStr);
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
    await client.connect();
    console.log("🚀 GramJS client connected successfully!");

    let allPosts = {};
    let offsetId = 0;
    let hasMore = true;

    while (hasMore) {
      console.log(`📡 Fetching messages from channel... (Offset ID: ${offsetId || 'Latest'})`);
      const msgs = await client.getMessages(CHANNEL_NAME, {
        limit: 100,
        offsetId: offsetId
      });

      if (!msgs || msgs.length === 0) {
        hasMore = false;
        break;
      }

      let minId = Infinity;
      let added = 0;

      for (const msg of msgs) {
        if (msg.id < minId) minId = msg.id;

        // Ignore service messages
        if (!msg.message && !msg.media) continue;

        if (msg.id >= FIRST_POST_ID) {
          // Format entities into Telegram-compatible HTML tags
          let textHtml = msg.message || '';
          // Simple link & formatting converter for basic representation
          textHtml = textHtml
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');

          let photoUrl = '';
          if (msg.media && msg.media.photo) {
            photoUrl = `telegram_media_${msg.id}`; // Flags media exists for GramJS fallback download
          }

          allPosts[msg.id] = {
            id: msg.id,
            textHtml: textHtml,
            photoUrl: photoUrl,
            videoUrl: '',
            datetime: new Date(msg.date * 1000).toISOString(),
            originalUrl: `https://t.me/${CHANNEL_NAME}/${msg.id}`
          };
          added++;
        }
      }

      console.log(`➡️ Processed ${msgs.length} posts (Added in range: ${added}, Min ID: ${minId})`);

      if (minId <= FIRST_POST_ID || msgs.length < 5) {
        hasMore = false;
      } else {
        offsetId = minId;
        await sleep(500); // Small delay to avoid API limits
      }
    }

    await client.disconnect();

    const sortedPosts = Object.values(allPosts).sort((a, b) => a.id - b.id);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sortedPosts, null, 2), 'utf8');

    console.log(`\n🎉 GramJS Scraper Finished!`);
    console.log(`📊 Total posts scraped: ${sortedPosts.length}`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);

  } catch (err) {
    console.error("❌ GramJS scraping failed, falling back to web scraper:", err.message);
    await runSlowWebScraper();
  }
}

main();
