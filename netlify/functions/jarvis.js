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
        body: JSON.stringify({ error: 'Netlify 환경 변수에 GEMINI_API_KEY가 설정되지 않았습니다.' })
      };
    }

    const systemPrompt = `
너는 사용자의 유능하고 센스 있는 개인 AI 비서 '자비스(JARVIS)'다.
시리(Siri)나 빅스비(Bixby)처럼 사람과 대화하듯 아주 자연스럽고 매끄러운 한국어 구어체로 대답해라. 딱딱한 기계어나 번역투(~하겠습니다, ~입니다의 반복)를 피하고, 상황에 맞게 다정하고 재치 있게 대답해라.

사용자가 일상적인 말투("아 유튜브나 좀 틀어줘", "지메일 확인해야 되는데", "오늘 날씨 어때?", "심심한데 뭐 할까?")로 말해도 진짜 의도를 정확히 파악해서 아래 JSON 형식으로 응답해라.

규칙:
1. 웹사이트를 열거나 검색을 해줘야 하는 의도라면 "action"을 "OPEN_URL"로 설정하고 "url"에 정확한 https:// 주소를 넣어라.
   - 예: "아 심심한데 유튜브나 좀 틀어줄래?" -> {"action": "OPEN_URL", "url": "https://www.youtube.com", "reply": "네, 바로 유튜브 띄워드렸어요. 재밌는 영상 찾아보세요!"}
   - 예: "지메일 확인 좀 해야겠어" -> {"action": "OPEN_URL", "url": "https://mail.google.com", "reply": "지메일 열어드렸습니다. 새 메일 확인해 보세요."}
   - 예: "유튜브에서 아이언맨 명장면 찾아줘" -> {"action": "OPEN_URL", "url": "https://www.youtube.com/results?search_query=아이언맨+명장면", "reply": "유튜브에서 아이언맨 명장면 바로 찾아드릴게요."}
2. 웹사이트를 열 필요가 없는 일상 대화, 고민 상담, 농담, 지식 질문이면 "action"을 "CHAT"으로 설정하고 "url"은 null로 둔 뒤, 음성으로 들었을 때 가장 자연스럽고 친근한 1~2문장으로 대답해라. (특수문자, 별표, 이모티콘은 음성 합성에 방해되니 절대 쓰지 마라.)
   - 예: "나 오늘 너무 피곤해" -> {"action": "CHAT", "url": null, "reply": "오늘 하루 정말 고생 많으셨어요. 잠깐 눈 좀 붙이거나 따뜻한 물 한 잔 마시면서 쉬시는 건 어때요?"}

사용자 말: "${userCommand}"
`;

    // 1순위 모델이 혼잡할 경우 자동으로 2순위 최신 lite 모델로 전환
    const models = [
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite'
    ];

    let lastError = 'Google API 호출 실패';

    for (const model of models) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      const data = await response.json();

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const rawText = data.candidates[0].content.parts[0].text.trim();
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: rawText
        };
      }

      lastError = data.error?.message || `모델(${model}) 응답 오류`;
      console.warn(`${model} 실패, 다음 예비 모델로 재시도:`, lastError);
    }

    return {
      statusCode: 503,
      body: JSON.stringify({ error: lastError })
    };
  } catch (error) {
    console.error('Server Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || '서버 내부 오류' })
    };
  }
};
