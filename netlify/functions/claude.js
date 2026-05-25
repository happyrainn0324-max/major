// netlify/functions/claude.js
const https = require('https');

const ALLOWED_ORIGINS = [
  'https://majoradventure.netlify.app',
  'http://localhost:3000',
  'http://localhost:5500',
];

const MAX_TOKENS_LIMIT = 1500;

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '잘못된 요청 형식입니다.' }),
    };
  }

  const safeMaxTokens = Math.min(body.max_tokens || 1000, MAX_TOKENS_LIMIT);

  const anthropicBody = {
    model: body.model || 'claude-sonnet-4-20250514',
    max_tokens: safeMaxTokens,
    messages: body.messages,
  };
  if (body.system) anthropicBody.system = body.system;

  try {
    const result = await callAnthropicAPI(apiKey, anthropicBody);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'AI 응답 오류: ' + err.message }),
    };
  }
};

function callAnthropicAPI(apiKey, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error?.message || responseData}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('응답 파싱 실패: ' + responseData));
        }
      });
    });

    req.on('error', (e) => reject(new Error('네트워크 오류: ' + e.message)));
    req.write(data);
    req.end();
  });
}
