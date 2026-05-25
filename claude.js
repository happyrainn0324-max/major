// netlify/functions/claude.js
// ─────────────────────────────────────────────
// Anthropic API 프록시 함수
// API 키는 이 파일에 절대 쓰지 말고
// Netlify 환경변수 ANTHROPIC_API_KEY 에만 저장하세요.
// ─────────────────────────────────────────────

const https = require('https');

// ── 허용할 도메인 목록 (본인 사이트로 변경) ──
const ALLOWED_ORIGINS = [
  'https://your-site.netlify.app',   // ← Netlify 배포 주소로 변경
  'https://your-school-domain.com',  // ← 학교 도메인 있으면 추가
  'http://localhost:3000',           // 로컬 테스트용
  'http://localhost:5500',           // Live Server 테스트용
];

// ── 요청당 최대 토큰 제한 (비용 보호) ──
const MAX_TOKENS_LIMIT = 1500;

exports.handler = async (event) => {
  // CORS preflight 처리
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

  // POST 요청만 허용
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  // API 키 확인
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
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

  // 토큰 제한 적용 (비용 보호)
  const requestedTokens = body.max_tokens || 1000;
  const safeMaxTokens = Math.min(requestedTokens, MAX_TOKENS_LIMIT);

  // Anthropic에 전달할 요청 본문
  const anthropicBody = {
    model: body.model || 'claude-sonnet-4-20250514',
    max_tokens: safeMaxTokens,
    messages: body.messages,
  };
  if (body.system) anthropicBody.system = body.system;

  // Anthropic API 호출 (Node https 모듈 사용, SDK 불필요)
  try {
    const result = await callAnthropicAPI(apiKey, anthropicBody);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error('Anthropic API 오류:', err.message);
    return {
      statusCode: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'AI 응답 오류: ' + err.message }),
    };
  }
};

// ── Anthropic API 호출 헬퍼 (외부 패키지 없이) ──
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
