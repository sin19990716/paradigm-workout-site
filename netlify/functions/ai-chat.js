// netlify/functions/ai-chat.js

// Netlify Functions 기본 형식 (Node 환경)
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  // POST 요청만 허용
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'POST 요청만 허용됩니다.' }),
    };
  }

  // OpenAI 키 확인
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'OPENAI_API_KEY가 설정되어 있지 않습니다.(Netlify 환경 변수 확인 필요)',
      }),
    };
  }

  // 클라이언트에서 보낸 메시지 파싱
  let userMessage = '';
  try {
    const body = JSON.parse(event.body || '{}');
    userMessage = body.message || '';
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: '요청 바디를 JSON으로 해석할 수 없습니다.' }),
    };
  }

  if (!userMessage || typeof userMessage !== 'string') {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'message 필드가 비어 있습니다.' }),
    };
  }

  try {
    // OpenAI Responses API 호출 (gpt-5.1)
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.1-mini',      // 원하면 gpt-5.1로 변경 가능
        input: userMessage,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // OpenAI에서 에러 내려준 경우 그대로 반환
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: 'OpenAI API 에러',
          detail: data,
        }),
      };
    }

    // 답변 텍스트 추출 (Responses 형식 대응)
    let replyText = '';

    try {
      if (
        data.output &&
        Array.isArray(data.output) &&
        data.output[0]?.content &&
        Array.isArray(data.output[0].content)
      ) {
        // content 배열 안에서 text 필드 찾아보기
        const firstContent = data.output[0].content[0];
        if (typeof firstContent === 'string') {
          replyText = firstContent;
        } else if (firstContent?.text) {
          // text가 객체거나 문자열일 수 있으니 최대한 꺼내 보기
          replyText =
            firstContent.text.value ||
            firstContent.text ||
            JSON.stringify(firstContent.text);
        }
      }

      // 위에서 못 찾았으면 백업용
      if (!replyText) {
        if (data.output_text && Array.isArray(data.output_text)) {
          replyText = data.output_text.join('\n');
        } else {
          replyText = JSON.stringify(data);
        }
      }
    } catch (e) {
      replyText = JSON.stringify(data);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: replyText }),
    };
  } catch (error) {
    console.error('AI 함수 내부 오류:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: '서버 내부 오류가 발생했습니다.',
        detail: String(error),
      }),
    };
  }
};
