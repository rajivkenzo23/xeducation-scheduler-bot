const { google } = require('googleapis');

async function publishArticleToBlogger(title, bodyHtml, photoUrl) {
  const clientId = process.env.BLOGGER_CLIENT_ID;
  const clientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const refreshToken = process.env.BLOGGER_REFRESH_TOKEN;
  const blogId = process.env.BLOGGER_BLOG_ID;

  if (!clientId || !clientSecret || !refreshToken || !blogId) {
    console.warn("⚠️ Blogger API credentials not fully configured in .env. Skipping Blogger publish.");
    return null;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const bloggerClient = google.blogger({ version: 'v3', auth: oauth2Client });

    // Premium HTML Layout for Blogspot Post
    const contentHtml = `
<div style="font-family: Arial, sans-serif; background: #0c0c14; color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #ff0033; max-width: 600px; margin: 0 auto; box-shadow: 0 10px 30px rgba(255,0,51,0.15); box-sizing: border-box;">
  <h2 style="color: #ff0033; font-weight: 800; margin-bottom: 12px; text-shadow: 0 2px 10px rgba(255,0,51,0.35);">${title}</h2>
  
  ${photoUrl ? `<div style="text-align: center; margin-bottom: 20px;"><img src="${photoUrl}" style="max-width: 100%; border-radius: 8px; border: 1px solid #333;" alt="${title}"></div>` : ''}
  
  <div style="font-size: 1.05rem; line-height: 1.8; color: #cccccc; margin-bottom: 25px;">
    ${bodyHtml}
  </div>
  
  <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
  
  <div style="display: flex; flex-direction: column; gap: 10px;">
    <a href="https://t.me/THEXEducation" target="_blank" style="background: #24A1DE; color: #ffffff; padding: 12px; border-radius: 30px; text-align: center; text-decoration: none; font-weight: bold; font-size: 0.95rem; display: block; box-shadow: 0 5px 15px rgba(36,161,222,0.3);">📢 Join Telegram Channel</a>
    <a href="https://whatsapp.com/channel/0029VbA9drwBadmctNhZGN3S" target="_blank" style="background: #25D366; color: #ffffff; padding: 12px; border-radius: 30px; text-align: center; text-decoration: none; font-weight: bold; font-size: 0.95rem; display: block; box-shadow: 0 5px 15px rgba(37,211,102,0.3);">💚 Join WhatsApp Channel</a>
  </div>
</div>
    `;

    const res = await bloggerClient.posts.insert({
      blogId: blogId,
      isDraft: false,
      requestBody: {
        title: title,
        content: contentHtml,
        labels: ['sex-education', 'srilanka', 'article']
      }
    });

    console.log(`✅ Blogger article post successfully created: ${res.data.url}`);
    return res.data.url;
  } catch (err) {
    console.error("❌ Failed to publish article to Blogger:", err.message);
    return null;
  }
}

module.exports = { publishArticleToBlogger };
