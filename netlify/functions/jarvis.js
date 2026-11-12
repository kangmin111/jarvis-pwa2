exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { userCommand } = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: '서버에 API 키가 설정되지 않았습니다.' })
      };
    }

    const systemPrompt = `
너는 사용자의 개인 AI 비서 '자비스(JARVIS)'다. 시리나 빅스비처럼 정중하고 유능하며 간결하게 한국어로 대답해라.
사용자의 명령을 분석해서 반드시 아래 JSON 형식으로만 응답해라. 마크다운(\`\`\`)이나 다른 설명은 절대 붙이지 마라.

규칙:
1. 사용자가 특정 웹사이트 실행, 앱 열기, 유튜브/구글 검색 등을 요청하면 "action"을 "OPEN_URL"로 설정하고 "url"에 정확한 https:// 주소를 넣어라.
   - 예: "지메일 열어줘" -> {"action": "OPEN_URL", "url": "https://mail.google.com", "reply": "네, 지메일을 열겠습니다."}
   - 예: "유튜브에서 복싱 경기 찾아줘" -> {"action": "OPEN_URL", "url": "https://www.youtube.com/results?search_query=복싱+경기", "reply": "유튜브에서 복싱 경기를 검색합니다."}
   - 예: "네이버 웹툰 틀어줘" -> {"action": "OPEN_URL", "url": "https://comic.naver.com", "reply": "네이버 웹툰을 실행합니다."}
2. 웹사이트를 열 필요가 없는 일반 대화, 질문, 계산, 지식 질문이면 "action"을 "CHAT"으로 설정하고 "url"은 null로 둔 뒤 "reply"에 1~2문장으로 핵심만 대답해라.

사용자 명령: "${userCommand}"
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      }
    );

    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text.trim();
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: rawText
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '두뇌 서버 처리 중 오류가 발생했습니다.' })
    };
  }
};
