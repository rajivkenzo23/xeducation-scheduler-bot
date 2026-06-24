const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Target channel info
const CHANNEL_NAME = 'Mahavanshaya_xedu';
const FIRST_POST_ID = 61; // First post as specified by the user
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'posts.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper for delaying requests (Telegram rate limiting)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Clean text formatting to keep Telegram-compatible HTML tags
function sanitizeHtml(html) {
  if (!html) return '';
  
  // Re-map some cheerio outputs if needed, but cheerio's HTML is mostly fine.
  // We want to keep: <b>, <strong>, <i>, <em>, <u>, <s>, strike, del, a, code, pre
  // We can use a simple regex or cheerio to strip other tags.
  const $ = cheerio.load(html, null, false);
  
  $('*').each((i, el) => {
    const tagName = el.tagName.toLowerCase();
    const allowed = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'a', 'code', 'pre', 'br'];
    if (!allowed.includes(tagName)) {
      // Replace element with its text contents
      $(el).replaceWith($(el).html() || $(el).text());
    } else if (tagName === 'a') {
      // Only keep href attribute
      const href = $(el).attr('href');
      $(el).removeAttr('class');
      $(el).removeAttr('target');
      $(el).removeAttr('rel');
      if (href) {
        $(el).attr('href', href);
      } else {
        $(el).replaceWith($(el).html() || $(el).text());
      }
    } else {
      // Strip attributes from other allowed tags
      $(el).each((_, element) => {
        element.attribs = {};
      });
    }
  });

  return $.html()
    .replace(/&nbsp;/g, ' ')
    .trim();
}

async function scrapePage(beforeId = null) {
  let url = `https://t.me/s/${CHANNEL_NAME}`;
  if (beforeId) {
    url += `?before=${beforeId}`;
  }

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
      const postPath = $el.attr('data-post') || ''; // e.g. Mahavanshaya_xedu/3775
      if (!postPath || !postPath.includes('/')) return;

      const id = parseInt(postPath.split('/')[1], 10);
      if (isNaN(id)) return;

      // Extract text content with formatting preserved
      const textHtmlEl = $el.find('.tgme_widget_message_text');
      const textHtml = textHtmlEl.length > 0 ? sanitizeHtml(textHtmlEl.html()) : '';

      // Extract photo URL (usually background-image style)
      let photoUrl = '';
      const photoEl = $el.find('.tgme_widget_message_photo_wrap');
      if (photoEl.length > 0) {
        const style = photoEl.attr('style') || '';
        const match = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
        if (match) photoUrl = match[1];
      }

      // Extract video URL if present (look for video tags or preview players)
      let videoUrl = '';
      const videoEl = $el.find('.tgme_widget_message_video');
      if (videoEl.length > 0) {
        // In Telegram web preview, videos are loaded via video tag sources
        const videoSrc = videoEl.find('video').attr('src');
        if (videoSrc) {
          videoUrl = videoSrc;
        } else {
          // Fallback to background image/thumb of the video player
          const videoPlayEl = $el.find('.tgme_widget_message_video_player');
          const style = videoPlayEl.attr('style') || '';
          const match = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
          if (match) photoUrl = match[1]; // Store video thumbnail as photoUrl
        }
      }

      // Extract date
      const dateEl = $el.find('.tgme_widget_message_date time');
      const datetime = dateEl.attr('datetime') || '';

      // Ignore service messages (no text and no media)
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

async function runScraper() {
  console.log(`🚀 Starting scraper for Telegram channel: @${CHANNEL_NAME}`);
  console.log(`📍 Starting from post ID: ${FIRST_POST_ID}`);

  let allPosts = {};
  let beforeId = null;
  let hasMore = true;
  let consecutiveErrors = 0;

  // Read existing posts if any, to avoid starting from scratch if interrupted
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach(p => { allPosts[p.id] = p; });
        console.log(`📦 Loaded ${data.length} existing posts from cache.`);
      }
    } catch (_) {}
  }

  while (hasMore) {
    const posts = await scrapePage(beforeId);
    
    if (!posts || posts.length === 0) {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        console.log('⚠️ Too many consecutive errors. Stopping scraper.');
        break;
      }
      console.log('⏳ Page fetch empty, retrying in 5s...');
      await sleep(5000);
      continue;
    }

    consecutiveErrors = 0;

    // Track new posts
    let minId = Infinity;
    let addedCount = 0;
    let skippedCount = 0;

    posts.forEach(post => {
      if (post.id < minId) minId = post.id;
      
      // Store post
      if (post.id >= FIRST_POST_ID) {
        if (!allPosts[post.id]) {
          allPosts[post.id] = post;
          addedCount++;
        } else {
          skippedCount++;
        }
      }
    });

    console.log(`➡️ Processed ${posts.length} posts (Added new: ${addedCount}, Duplicates: ${skippedCount}). Min ID on page: ${minId}`);

    // If we've reached the minimum post ID threshold or can't go further back
    if (minId <= FIRST_POST_ID || minId === Infinity || posts.length < 5) {
      console.log(`✅ Reached the first post ID limit (${FIRST_POST_ID}).`);
      hasMore = false;
    } else {
      // Setup beforeId for the next request to walk backwards
      beforeId = minId;
      // Stagger requests to avoid getting banned by Telegram
      await sleep(1500 + Math.random() * 1000);
    }
  }

  // Convert map to array and sort chronologically (ascending IDs)
  const sortedPosts = Object.values(allPosts).sort((a, b) => a.id - b.id);
  
  if (sortedPosts.length === 0) {
    console.error('❌ Scraper failed to fetch any posts! The channel might be empty, or the request was blocked.');
    process.exit(1);
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sortedPosts, null, 2), 'utf8');
  
  console.log(`\n🎉 Scraper Finished!`);
  console.log(`📊 Total posts scraped and saved: ${sortedPosts.length}`);
  console.log(`💾 Data saved to: ${OUTPUT_FILE}`);
}

runScraper();
