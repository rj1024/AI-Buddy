 
require('dotenv').config(); // Add this line at the top
const openaiKey = process.env.openaiKey;
const confluenceToken = process.env.confluenceToken;

const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json()); // to parse JSON payloads

const axios = require('axios');
const https = require('https');


const agent = new https.Agent({
  rejectUnauthorized: false // ⚠️ disables SSL verification
});

const getConfluencePageData = async (pageId) => {
  const username = 'rganji';
  const token = `${confluenceToken}`; // your actual token
  const auth = Buffer.from(`${username}:${token}`).toString('base64');

  const url = `https://ca-il-confluencetest.il.cyber-ark.com/rest/api/content/${pageId}?expand=space,body.view`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json'
      }
    });

    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching Confluence page:', error.response?.data || error.message);
    return null;
  }
};

const fetchConfluencePages = async () => {
  const pageIds = [
    '516587628',
    '516587632',
    '516587634',
    '516587636',
    '516587638'
  ];

  const pages = [];

  for (const id of pageIds) {
    try {
      const data = await getConfluencePageData(id);
      const title = data.title || 'Untitled';
      const rawContent = data.body?.view?.value || '';
      const content = rawContent.replace(/<[^>]+>/g, '').trim(); // Strip HTML tags

      pages.push({ title, content });
    } catch (error) {
      console.error(`Failed to fetch page ${id}:`, error);
    }
  }

  console.log('Fetched Pages:', pages);
  return pages;
};

const updateConfluencePage = async (pageId, newContent, pageTitle) => {
  const username = 'rganji';
  const token = `${confluenceToken}`;
  const auth = Buffer.from(`${username}:${token}`).toString('base64');

  const getUrl = `https://ca-il-confluencetest.il.cyber-ark.com/rest/api/content/${pageId}?expand=version`;

  try {
    // Step 1: Get current version
    const getResponse = await axios.get(getUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json'
      }
    });

    const currentVersion = getResponse.data.version.number;

    // Step 2: Prepare update payload
    const updatePayload = {
      id: pageId,
      type: 'page',
      title: pageTitle,
      body: {
        storage: {
          value: newContent,
          representation: 'storage'
        }
      },
      version: {
        number: currentVersion + 1
      }
    };

    // Step 3: Send PUT request to update page
    const putUrl = `https://ca-il-confluencetest.il.cyber-ark.com/rest/api/content/${pageId}`;
    const putResponse = await axios.put(putUrl, updatePayload, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Page updated successfully:', putResponse.data);
    return putResponse.data;
  } catch (error) {
    console.error('❌ Error updating Confluence page:', error.response?.data || error.message);
    return null;
  }
};

async function callChatGPT(prompt) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        },
        httpsAgent: agent // 👈 add this line
      }
    );

    const reply = response.data.choices[0].message.content;
    console.log('ChatGPT Response:\n', reply);
    return reply;
  } catch (error) {
    console.error('Error calling ChatGPT:', error.response?.data || error.message);
  }
}

//Actual execution
app.post('/update', async (req, res) => {
  try {
    const meetingTopic = req.body.meetingTopic;
    if (!meetingTopic) {
      return res.status(400).json({ error: 'Missing meetingTopic in payload' });
    }
 
    const pages = await fetchConfluencePages();
 
    const prompt = `
You are an expert Confluence editor. I will give you a meeting update and the content of 5 Confluence pages. Your job is to:
1. Identify which page is most relevant to the meeting update
2. Rewrite that page to reflect the update
3. Return only:
   - The page number (1–5)
   - The new content to replace the page
 
Meeting update:
${meetingTopic}
 
Confluence Pages:
${pages.map((p, i) => `Page ${i + 1} - ${p.title}:\n${p.content}`).join('\n\n')}
`;
 
    const response = await callChatGPT(prompt);
 
    // You can now update the page using response.pageNumber and response.newContent
    res.json(response);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
 
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});