const fs = require('fs');
const axios = require('axios');
const core = require('@actions/core');

// Get inputs from GitHub Action
const markdownPath = process.env.INPUT_MARKDOWN_FILE || 'blog.md';
const content = fs.readFileSync(markdownPath, 'utf-8');
const title = content.match(/^# (.*)/)[1];
const markdownBody = content.replace(/^# .*\n/, '');

// console.log("🧪 Action inputs:");
// console.log(core.getInput('markdown_file'));
// console.log(core.getInput('devto_api_key') ? "✅ Dev.to key present" : "❌ Dev.to key missing");
// console.log(core.getInput('medium_token') ? "✅ Medium token present" : "❌ Medium token missing");
// console.log(core.getInput('hashnode_api_key') ? "✅ Hashnode key present" : "❌ Hashnode key missing");


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
  const hashnodeApiKey = core.getInput('hashnode_api_key');
  console.log(`🔐 Got Hashnode API Key: ${hashnodeApiKey ? '✅ present' : '❌ missing'}`);

  
  const res = await axios.post(
    'https://gql.hashnode.com/',
    {
      query: `
        {
          me {
            publications(first: 10) {
              edges {
                node {
                  id
                  title
                }
              }
            }
          }
        }
      `
    },
    {
      headers: {
        Authorization: `Bearer ${hashnodeApiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const publicationEdges = res.data.data.me.publications.edges;
  console.log(res.data);
  
  if (!publicationEdges || publicationEdges.length === 0) {
    throw new Error("No publications found for the user.");
  }

  return publicationEdges[0].node.id; // assuming you're using the first publication
}


async function publishToHashnode() {
  const publicationId = await fetchHashnodePublicationId();
  const hashnodeApiKey = core.getInput('hashnode_api_key');

  // Use variables instead of string interpolation to avoid escaping issues
  await axios.post('https://gql.hashnode.com/', {
    query: `
      mutation CreatePublicationStory($title: String!, $content: String!, $publicationId: ObjectId!) {
        createPublicationStory(input: {
          title: $title,
          contentMarkdown: $content,
          publicationId: $publicationId
        }) {
          post {
            slug
            title
          }
        }
      }
    `,
    variables: {
      title: title,
      content: markdownBody,
      publicationId: publicationId
    }
  }, {
    headers: {
      Authorization: hashnodeApiKey,
      'Content-Type': 'application/json'
    }
  });
}

// ─── Master Runner ──────────────────────────────────────────────
(async () => {
  try {
    // console.log('📤 Publishing to Dev.to...');
    // await publishToDevto();
    // console.log('✅ Dev.to published!');

    // console.log('📤 Publishing to Medium...');
    // await publishToMedium();
    // console.log('✅ Medium published!');

    console.log('📤 Publishing to Hashnode...');
    await publishToHashnode();
    console.log('✅ Hashnode published!');

    console.log('🎉 Blog published to all platforms!');
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
    process.exit(1);
  }
})();
