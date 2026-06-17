// netlify/functions/counter.js
const https = require('https');

const SUPA_URL = 'hjhaljnujvqqenyxbdui.supabase.co';

function supabaseRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: SUPA_URL,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
      },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        console.log('Supabase response status:', res.statusCode);
        console.log('Supabase response body:', responseData);
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(new Error('파싱 실패: ' + responseData));
        }
      });
    });
    req.on('error', (e) => reject(e));
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: '잘못된 요청' }) };
  }

  const { action, key } = body;
  console.log('action:', action, 'key:', key);
  console.log('SUPABASE_KEY exists:', !!process.env.SUPABASE_KEY);

  try {
    if (action === 'get') {
      const result = await supabaseRequest(
        '/rest/v1/counters?key=eq.' + key + '&select=value',
        'GET'
      );
      const value = result && result[0] ? result[0].value : null;
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) };

    } else if (action === 'increment') {
      const result = await supabaseRequest(
        '/rpc/increment_counter',
        'POST',
        { counter_key: key }
      );
      const value = typeof result === 'number' ? result : (result && result.value ? result.value : null);
      console.log('increment result:', result, 'value:', value);
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ value: value }) };

    } else {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: '알 수 없는 action' }) };
    }
  } catch (err) {
    console.log('Error:', err.message);
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
