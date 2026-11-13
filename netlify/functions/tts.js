exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { text } = JSON.parse(event.body);
    if (!text) {
      return { statusCode: 400, body: JSON.stringify({ error: '변환할 텍스트가 없습니다.' }) };
    }

    // 1순위: 릴스/틱톡/캡컷 원조 한국어 TTS 음성 (kr_002: 특유의 톡톡 튀는 여성 톤)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const tiktokRes = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice: 'kr_002' // 원조 틱톡/릴스 한국어 여성 목소리 (남성 톤을 원하면 'kr_003')
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const tiktokData = await tiktokRes.json();

      if (tiktokRes.ok && tiktokData.data) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: tiktokData.data })
        };
      }
    } catch (e) {
      console.warn('1순위 TTS 지연, 백업 엔진 전환:', e.message);
    }

    // 2순위 백업: Edge Neural 하이텐션 튜닝 (속도 +25%, 피치 +15Hz)
    const fallbackUrl = `https://tts.travisvn.com/api/tts?text=${encodeURIComponent(text)}&voice=ko-KR-SunHiNeural&rate=%2B25%25&pitch=%2B15Hz`;
    const fallbackRes = await fetch(fallbackUrl);

    if (!fallbackRes.ok) {
      throw new Error(`백업 TTS 서버 오류 (${fallbackRes.status})`);
    }

    const arrayBuffer = await fallbackRes.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: base64Audio })
    };
  } catch (error) {
    console.error('TTS Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'TTS 변환 실패' })
    };
  }
};
