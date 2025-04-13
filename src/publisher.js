const fs = require('fs');
const axios = require('axios');
const core = require('@actions/core');

// Get inputs from GitHub Action
const markdownPath = process.env.INPUT_MARKDOWN_FILE || 'blog.md';
const content = fs.readFileSync(markdownPath, 'utf-8');
const title = content.match(/^# (.*)/)[1];
const markdownBody = content.replace(/^# .*\n/, '');

// ─── Dev.to ─────────────────────────────────────────────────────
async function publishToDevto() {
  const devtoApiKey = core.getInput('devto_api_key'); // Get the API key from inputs
  console.log("Hi", devtoApiKey);

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

// ─── Medium ─────────────────────────────────────────────────────
async function publishToMedium() {
  const mediumToken = core.getInput('medium_token'); // Get the Medium token from inputs
  const userRes = await axios.get('https://api.medium.com/v1/me', {
    headers: { Authorization: `Bearer ${mediumToken}` }
  });
  const userId = userRes.data.data.id;

  await axios.post(`https://api.medium.com/v1/users/${userId}/posts`, {
    title,
    contentFormat: 'markdown',
    content: content,
    publishStatus: 'public'
  }, {
    headers: {
      Authorization: `Bearer ${mediumToken}`,
      'Content-Type': 'application/json'
    }
  });
}

// ─── Hashnode ───────────────────────────────────────────────────
async function fetchHashnodePublicationId() {
  const hashnodeApiKey = core.getInput('hashnode_api_key'); // Get the Hashnode API key from inputs
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
      Authorization: core.getInput('hashnode_api_key'), // Get Hashnode API key from inputs
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
    await publishToMedium();
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
