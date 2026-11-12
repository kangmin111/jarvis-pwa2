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
let isSpeaking = false; // 자비스가 말하는 중에는 자기 목소리 듣지 않기

// 자연스러운 한국어 목소리 찾기
function getNaturalVoice() {
  const voices = window.speechSynthesis.getVoices();
  // Google 한국어 또는 자연스러운 여성/남성 음성 우선 선택
  return (
    voices.find((v) => v.lang.includes('ko') && v.name.includes('Google')) ||
    voices.find((v) => v.lang.includes('ko')) ||
    null
  );
}

window.speechSynthesis.onvoiceschanged = getNaturalVoice;

function speak(text) {
  log.innerText = `JARVIS: ${text}`;
  window.speechSynthesis.cancel(); // 이전 말이 남아있으면 끊고 새로 말하기

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getNaturalVoice();
  if (voice) utterance.voice = voice;

  utterance.lang = 'ko-KR';
  utterance.rate = 1.02;  // 너무 빠르거나 느리지 않은 자연스러운 속도
  utterance.pitch = 1.0;  // 자연스러운 음높이

  utterance.onstart = () => {
    isSpeaking = true;
  };
  utterance.onend = () => {
    isSpeaking = false;
  };

  window.speechSynthesis.speak(utterance);
}

async function askJarvisBrain(userCommand) {
  core.innerText = 'THINKING';
  core.classList.remove('listening');
  core.classList.add('thinking');
  log.innerText = `듣고 생각 중: "${userCommand}"`;

  try {
    const response = await fetch('/.netlify/functions/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCommand })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `서버 오류 (${response.status})`);
    }

    speak(data.reply);

    if (data.action === 'OPEN_URL' && data.url) {
      window.open(data.url, '_blank');
    }
  } catch (error) {
    console.error('상세 오류:', error);
    log.innerText = `오류 원인: ${error.message}`;
    speak(`오류가 발생했어요. ${error.message}`);
  } finally {
    core.innerText = 'ONLINE';
    core.classList.remove('thinking');
    core.classList.add('listening');
  }
}

recognition.onresult = (event) => {
  // 자비스 본인이 말하고 있을 때는 마이크 입력 무시
  if (isSpeaking) return;

  const lastIndex = event.results.length - 1;
  const transcript = event.results[lastIndex][0].transcript.trim();
  console.log('인식된 음성:', transcript);

  // "자비스" 또는 띄어쓰기 오인식("자 비스") 모두 감지
  const wakeRegex = /자\s*비스/;
  if (wakeRegex.test(transcript)) {
    const command = transcript.split(wakeRegex)[1].trim();
    if (command.length === 0) {
      const greetings = [
        '네, 부르셨어요?',
        '네, 말씀하세요. 듣고 있어요.',
        '네, 무슨 일이신가요?'
      ];
      const randomReply = greetings[Math.floor(Math.random() * greetings.length)];
      speak(randomReply);
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
  speak('자비스 시스템이 준비됐어요. 편하게 말씀해 주세요.');
});
