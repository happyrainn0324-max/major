// netlify/functions/counter.js
const https = require('https');

const SUPA_HOST = 'hjhaljnujvqqenyxbdui.supabase.co';

function supabaseRequest(path, method, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: SUPA_HOST,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
        ...extraHeaders,
      },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        console.log('path:', path, 'status:', res.statusCode, 'body:', responseData.substring(0, 200));
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData) });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
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

  try {
    if (action === 'get') {
      const res = await supabaseRequest(
        '/rest/v1/counters?key=eq.' + key + '&select=value',
        'GET'
      );
      const value = res.data && res.data[0] ? res.data[0].value : null;
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) };

    } else if (action === 'increment') {
      // SQL로 직접 increment
      const res = await supabaseRequest(
        '/rest/v1/rpc/increment_counter',
        'POST',
        { counter_key: key }
      );
      console.log('rpc result:', JSON.stringify(res));
      const value = typeof res.data === 'number' ? res.data : null;
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) };

    } else {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: '알 수 없는 action' }) };
    }
  } catch (err) {
    console.log('Error:', err.message);
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
