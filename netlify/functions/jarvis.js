exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { userCommand, chatHistory = [] } = JSON.parse(event.body);
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!geminiApiKey && !groqApiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Netlify 환경 변수에 API 키가 설정되지 않았습니다.' })
      };
    }

    const historyText = chatHistory.length > 0
      ? chatHistory.map((item) => `${item.role === 'user' ? '사용자' : '자비스'}: ${item.text}`).join('\n')
      : '이전 대화 없음';

    const systemPrompt = `
너는 인스타 릴스나 틱톡 쇼츠 나레이션처럼 텐션 높고 찰지게 말하는 AI 비서 '자비스'다.
딱딱한 AI 말투나 긴 존댓말 설명을 절대 쓰지 마라. 친한 형이나 동생한테 릴스 대본 읽어주듯 짧고 리듬감 있는 반말/구어체로 1~2문장 안에 핵심만 톡톡 쏘듯이 대답해라.
예시 말투:
- "어, 유튜브 바로 띄웠어! 재밌는 거 찾아봐."
- "야, 그건 진짜 레전드지. 내가 바로 검색해 줄게!"
- "오케이 접수 완료! 지금 바로 열어줄게."

[최근 대화 기록]
${historyText}

위 [최근 대화 기록]의 문맥을 반드시 참고해서, 사용자가 "그거", "거기서", "방금 말한 거", "다시 찾아줘"처럼 생략해서 말해도 무슨 뜻인지 정확히 연결해 처리해라.

규칙:
1. 웹사이트를 열거나 검색을 해줘야 하는 의도라면 "action"을 "OPEN_URL"로 설정하고 "url"에 정확한 https:// 주소를 넣어라.
2. 웹사이트를 열 필요가 없는 일상 대화, 고민 상담, 농담, 지식 질문이면 "action"을 "CHAT"으로 설정하고 "url"은 null로 둔 뒤, 음성으로 들었을 때 가장 찰지고 자연스러운 짧은 1~2문장으로 대답해라. (특수문자, 별표, 이모티콘, 물결표는 TTS 발음이 망가지니 절대 쓰지 마라.)

반드시 아래 JSON 형식으로만 응답해라:
{"action": "OPEN_URL" 또는 "CHAT", "url": "https://..." 또는 null, "reply": "자비스의 한국어 대답"}
`;

    let lastError = 'AI 서버 호출 실패';

    // 1단계: Google Gemini 서버 시도
    if (geminiApiKey) {
      const geminiModels = [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-3.5-flash-lite'
      ];

      for (const model of geminiModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2200);

        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': geminiApiKey
              },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\n현재 사용자 말: "${userCommand}"` }] }],
                generationConfig: {
                  responseMimeType: 'application/json'
                }
              }),
              signal: controller.signal
            }
          );

          clearTimeout(timeoutId);
          const data = await response.json();

          if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            const rawText = data.candidates[0].content.parts[0].text.trim();
            return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/json' },
              body: rawText
            };
          }

          lastError = data.error?.message || `Gemini(${model}) 오류`;
        } catch (err) {
          clearTimeout(timeoutId);
          lastError = err.name === 'AbortError' ? `${model} 응답 지연` : err.message;
        }
      }
    }

    // 2단계: Groq 백업 엔진 (현재 내 계정에서 사용 가능한 채팅 모델을 자동 조회해 선택)
    if (groqApiKey) {
      try {
        const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${groqApiKey}` }
        });
        const modelsData = await modelsRes.json();

        // 음성 인식(whisper)이나 가드 모델을 제외한 일반 텍스트 대화 모델 중 최적 모델 자동 선택
        const availableModels = (modelsData.data || [])
          .map((m) => m.id)
          .filter((id) => !id.includes('whisper') && !id.includes('guard') && !id.includes('tts'));

        const selectedGroqModel =
          availableModels.find((id) => id.includes('llama-3.3') || id.includes('llama-4')) ||
          availableModels.find((id) => id.includes('llama')) ||
          availableModels.find((id) => id.includes('qwen') || id.includes('gemma')) ||
          availableModels[0];

        if (selectedGroqModel) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
              model: selectedGroqModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userCommand }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.7
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          const groqData = await groqResponse.json();

          if (groqResponse.ok && groqData.choices?.[0]?.message?.content) {
            const rawText = groqData.choices[0].message.content.trim();
            return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/json' },
              body: rawText
            };
          }

          lastError = groqData.error?.message || `Groq(${selectedGroqModel}) 오류`;
        } else {
          lastError = 'Groq에서 사용 가능한 대화 모델을 찾지 못했습니다.';
        }
      } catch (err) {
        lastError = err.name === 'AbortError' ? 'Groq 응답 지연' : err.message;
      }
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
