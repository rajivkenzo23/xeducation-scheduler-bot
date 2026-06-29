const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://videoslk.eu.cc';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function checkArticles() {
  console.log(`Checking articles via API on ${WEBSITE_URL}...`);
  try {
    const res = await axios.get(`${WEBSITE_URL}/api/admin/articles`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`
      }
    });
    console.log('API Status:', res.status);
    console.log('API Response:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error fetching articles:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
  }
}

checkArticles();
