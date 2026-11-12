if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

const core = document.getElementById('core');
const startBtn = document.getElementById('startBtn');
const log = document.getElementById('log');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'ko-KR';
recognition.continuous = true;
recognition.interimResults = false;

let isSystemActive = false;

function speak(text) {
  log.innerText = `JARVIS: ${text}`;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}

// 내 Netlify 백엔드 함수로 명령만 안전하게 전달
async function askJarvisBrain(userCommand) {
  core.innerText = 'THINKING';
  core.classList.remove('listening');
  core.classList.add('thinking');
  log.innerText = `명령 분석 중: "${userCommand}"...`;

  try {
    const response = await fetch('/.netlify/functions/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCommand })
    });

    if (!response.ok) throw new Error('서버 응답 오류');

    const result = await response.json();

    speak(result.reply);

    if (result.action === 'OPEN_URL' && result.url) {
      window.open(result.url, '_blank');
    }

  } catch (error) {
    console.error(error);
    speak('죄송합니다. 보안 서버와 통신하는 중 오류가 발생했습니다.');
  } finally {
    core.innerText = 'ONLINE';
    core.classList.remove('thinking');
    core.classList.add('listening');
  }
}

recognition.onresult = (event) => {
  const lastIndex = event.results.length - 1;
  const transcript = event.results[lastIndex][0].transcript.trim();

  if (transcript.includes('자비스')) {
    const command = transcript.split('자비스')[1].trim();
    if (command.length === 0) {
      speak('네, 부르셨습니까?');
    } else {
      askJarvisBrain(command);
    }
  }
};

recognition.onend = () => {
  if (isSystemActive) {
    recognition.start();
  }
};

startBtn.addEventListener('click', () => {
  isSystemActive = true;
  recognition.start();
  startBtn.style.display = 'none';
  core.innerText = 'ONLINE';
  core.classList.add('listening');
  speak('자비스 보안 시스템을 가동합니다. 무엇을 도와드릴까요?');
});