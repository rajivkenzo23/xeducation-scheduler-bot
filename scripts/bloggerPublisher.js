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

    // Premium HTML Layout for Blogspot Post (Light Readable Design)
    const contentHtml = `
<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #ffffff; color: #2d3748; padding: 24px; border-radius: 16px; border: 1px solid #e2e8f0; max-width: 620px; margin: 20px auto; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05); box-sizing: border-box;">
  <h2 style="color: #e53e3e; font-size: 1.6rem; font-weight: 700; line-height: 1.4; margin-top: 0; margin-bottom: 16px; border-bottom: 2px solid #fed7d7; padding-bottom: 12px;">${title}</h2>
  
  ${photoUrl ? `<div style="text-align: center; margin-bottom: 24px;"><img src="${photoUrl}" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);" alt="${title}"></div>` : ''}
  
  <div style="font-size: 1.1rem; line-height: 1.8; color: #4a5568; margin-bottom: 28px; word-break: break-word;">
    ${bodyHtml}
  </div>
  
  <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 24px 0;">
  
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <a href="https://t.me/THEXEducation" target="_blank" style="background: #24a1de; color: #ffffff; padding: 14px; border-radius: 30px; text-align: center; text-decoration: none; font-weight: 700; font-size: 0.95rem; display: block; box-shadow: 0 4px 12px rgba(36,161,222,0.2);">📢 Join Telegram Channel</a>
    <a href="https://whatsapp.com/channel/0029VbA9drwBadmctNhZGN3S" target="_blank" style="background: #25d366; color: #ffffff; padding: 14px; border-radius: 30px; text-align: center; text-decoration: none; font-weight: 700; font-size: 0.95rem; display: block; box-shadow: 0 4px 12px rgba(37,211,102,0.2);">💚 Join WhatsApp Channel</a>
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
