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
let isSpeaking = false;

function getNaturalVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.includes('ko') && v.name.includes('Google')) ||
    voices.find((v) => v.lang.includes('ko')) ||
    null
  );
}

window.speechSynthesis.onvoiceschanged = getNaturalVoice;

function speak(text) {
  log.innerText = `JARVIS: ${text}`;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getNaturalVoice();
  if (voice) utterance.voice = voice;

  utterance.lang = 'ko-KR';
  utterance.rate = 1.02;
  utterance.pitch = 1.0;

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

// "자비스" 호출어 없이 말하면 바로 실행
recognition.onresult = (event) => {
  if (isSpeaking) return;

  const lastIndex = event.results.length - 1;
  const transcript = event.results[lastIndex][0].transcript.trim();
  console.log('인식된 음성:', transcript);

  // 습관적으로 "자비스"라고 먼저 불렀을 경우 앞부분만 깔끔하게 정리
  const cleanCommand = transcript.replace(/^자\s*비스[,\s]*/, '').trim();

  if (cleanCommand.length === 0) {
    const greetings = [
      '네, 부르셨어요?',
      '네, 말씀하세요. 듣고 있어요.',
      '네, 무슨 일이신가요?'
    ];
    speak(greetings[Math.floor(Math.random() * greetings.length)]);
  } else {
    askJarvisBrain(cleanCommand);
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
  speak('자비스 시스템이 준비됐어요. 이제 부르지 않고 바로 말씀하셔도 됩니다.');
});
