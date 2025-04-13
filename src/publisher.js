const fs = require('fs');
const axios = require('axios');
const core = require('@actions/core');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CookieFile } = require('cookiefile');

// ─── Blog Content ───────────────────────────────────────────────
const markdownPath = core.getInput('markdown_file') || './blog.md'; // Path to blog file
const cookieFilePath = core.getInput('cookies_file') || './cookies.txt'; // Path to cookies file

// Read blog content
const content = fs.readFileSync(markdownPath, 'utf-8');
const title = content.match(/^# (.*)/)[1]; // Extract title from markdown
const markdownBody = content.replace(/^# .*\n/, ''); // Remove title from content for body

// ─── Dev.to ─────────────────────────────────────────────────────
async function publishToDevto() {
  const devtoApiKey = core.getInput('devto_api_key'); // Get the API key from inputs
  await axios.post('https://dev.to/api/articles', {
    article: {
      title,
      body_markdown: content,
      published: true
    }
  }, {
    headers: {
      'api-key': devtoApiKey
    }
  });
}

// ─── Medium via Puppeteer + cookies.txt ─────────────────────────
async function publishToMediumWithPuppeteer() {
  puppeteer.use(StealthPlugin());

  // Read cookies from the provided cookie file
  const mediumCookies = new CookieFile(cookieFilePath).getCookies('https://medium.com');
  console.log(mediumCookies);
  
  const cookies = mediumCookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    expires: cookie.expires || -1
  }));

  const browser = await puppeteer.launch({ headless: true }); // Launch Puppeteer in headless mode
  const page = await browser.newPage();
  await page.setCookie(...cookies); // Set cookies for Medium

  await page.goto('https://medium.com/new-story', { waitUntil: 'networkidle2' });

  // Type title into the title field
  await page.waitForSelector('textarea[placeholder="Title"]', { timeout: 10000 });
  await page.type('textarea[placeholder="Title"]', title, { delay: 30 });

  // Type content into the body field
  await page.waitForSelector('div[role="textbox"]', { timeout: 10000 });
  await page.click('div[role="textbox"]');
  await page.keyboard.type(markdownBody, { delay: 10 });

  // Click "Publish" button
  await page.waitForSelector('button', { visible: true });
  await page.evaluate(() => {
    const publishBtn = [...document.querySelectorAll('button')].find(btn => btn.innerText.includes('Publish'));
    if (publishBtn) publishBtn.click();
  });

  // Wait for and click the "Publish now" button
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const finalBtn = [...document.querySelectorAll('button')].find(btn => btn.innerText.includes('Publish now'));
    if (finalBtn) finalBtn.click();
  });

  // Wait for navigation to complete
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await browser.close();
}

// ─── Hashnode ───────────────────────────────────────────────────
async function fetchHashnodePublicationId() {
  const hashnodeApiKey = core.getInput('hashnode_api_key');
  const res = await axios.post('https://gql.hashnode.com/', {
    query: `
      {
        me {
          publication {
            _id
            title
          }
        }
      }
    `
  }, {
    headers: {
      Authorization: hashnodeApiKey,
      'Content-Type': 'application/json'
    }
  });

  return res.data.data.me.publication._id;
}

async function publishToHashnode() {
  const publicationId = await fetchHashnodePublicationId();

  await axios.post('https://gql.hashnode.com/', {
    query: `
      mutation {
        createStory(input: {
          title: "${title}",
          contentMarkdown: """${markdownBody}""",
          publicationId: "${publicationId}",
          isPartOfPublication: true
        }) {
          post {
            slug
            title
          }
        }
      }
    `
  }, {
    headers: {
      Authorization: core.getInput('hashnode_api_key'),
      'Content-Type': 'application/json'
    }
  });
}

// ─── Master Runner ──────────────────────────────────────────────
(async () => {
  try {
    console.log('📤 Publishing to Dev.to...');
    await publishToDevto();
    console.log('✅ Dev.to published!');

    console.log('📤 Publishing to Medium...');
    await publishToMediumWithPuppeteer();
    console.log('✅ Medium published!');

    console.log('📤 Publishing to Hashnode...');
    await publishToHashnode();
    console.log('✅ Hashnode published!');

    console.log('🎉 Blog published to all platforms!');
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
    process.exit(1);
  }
})();
