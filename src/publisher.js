const fs = require('fs');
const axios = require('axios');

const markdownPath = process.env.INPUT_MARKDOWN_FILE || 'blog.md';
const content = fs.readFileSync(markdownPath, 'utf-8');
const title = content.match(/^# (.*)/)[1];
const markdownBody = content.replace(/^# .*\n/, '');

// ─── Dev.to ─────────────────────────────────────────────────────
async function publishToDevto() {
  await axios.post('https://dev.to/api/articles', {
    article: {
      title,
      body_markdown: content,
      published: true
    }
  }, {
    headers: {
      'api-key': process.env.DEVTO_API_KEY
    }
  });
}

// ─── Medium ─────────────────────────────────────────────────────
async function publishToMedium() {
  const userRes = await axios.get('https://api.medium.com/v1/me', {
    headers: { Authorization: `Bearer ${process.env.MEDIUM_INTEGRATION_TOKEN}` }
  });
  const userId = userRes.data.data.id;

  await axios.post(`https://api.medium.com/v1/users/${userId}/posts`, {
    title,
    contentFormat: 'markdown',
    content: content,
    publishStatus: 'public'
  }, {
    headers: {
      Authorization: `Bearer ${process.env.MEDIUM_INTEGRATION_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

// ─── Hashnode ───────────────────────────────────────────────────
async function fetchHashnodePublicationId() {
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
      Authorization: process.env.HASHNODE_API_KEY,
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
      Authorization: process.env.HASHNODE_API_KEY,
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
