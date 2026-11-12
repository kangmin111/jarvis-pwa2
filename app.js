if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

const core = document.getElementById('core');
const startBtn = document.getElementById('startBtn');
const muteBtn = document.getElementById('muteBtn');
const log = document.getElementById('log');
const clockEl = document.getElementById('clock');

// 상단 실시간 HUD 시계
function updateClock() {
  const now = new Date();
  clockEl.innerText = now.toTimeString().split(' ')[0];
}
setInterval(updateClock, 1000);
updateClock();

// HUD 테마 상태 변경 함수
function setHudState(state, label) {
  document.body.className = `state-${state}`;
  core.innerText = label;
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'ko-KR';
recognition.continuous = true;
recognition.interimResults = false;

let isSystemActive = false;
let isMuted = false;
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
    setHudState('speaking', 'SPEAKING');
  };
  utterance.onend = () => {
    isSpeaking = false;
    if (isMuted) {
      setHudState('muted', 'MUTED');
    } else {
      setHudState('listening', 'ONLINE');
    }
  };

  window.speechSynthesis.speak(utterance);
}

function handleInstantCommand(command) {
  if (command.includes('유튜브') && !command.includes('검색') && !command.includes('찾아')) {
    speak('네, 바로 유튜브 열어드릴게요!');
    window.open('https://www.youtube.com', '_blank');
    return true;
  }
  if (command.includes('지메일') || command.includes('메일')) {
    speak('네, 지메일 확인하실 수 있게 열어드렸어요.');
    window.open('https://mail.google.com', '_blank');
    return true;
  }
  if (command.includes('네이버') && !command.includes('검색') && !command.includes('찾아')) {
    speak('네이버 화면 띄워드렸습니다.');
    window.open('https://www.naver.com', '_blank');
    return true;
  }
  if (command.includes('구글') && !command.includes('검색') && !command.includes('찾아')) {
    speak('구글 페이지 열어드렸어요.');
    window.open('https://www.google.com', '_blank');
    return true;
  }
  return false;
}

async function askJarvisBrain(userCommand) {
  if (handleInstantCommand(userCommand)) return;

  setHudState('thinking', 'THINKING');
  log.innerText = `명령 분석 중: "${userCommand}"`;

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
    if (error.message.includes('high demand')) {
      log.innerText = '구글 AI 서버 일시 혼잡 - 잠시 후 다시 말씀해 주세요.';
      speak('지금 구글 AI 서버에 접속자가 너무 많아서 잠깐 막혔어요. 몇 초 뒤에 다시 말씀해 주실래요?');
    } else {
      log.innerText = `오류 원인: ${error.message}`;
      speak(`오류가 발생했어요. ${error.message}`);
    }
  } finally {
    if (!isSpeaking) {
      setHudState(isMuted ? 'muted' : 'listening', isMuted ? 'MUTED' : 'ONLINE');
    }
  }
}

recognition.onresult = (event) => {
  if (isSpeaking || isMuted) return;

  const lastIndex = event.results.length - 1;
  const transcript = event.results[lastIndex][0].transcript.trim();
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
  if (isSystemActive && !isMuted) {
    recognition.start();
  }
};

startBtn.addEventListener('click', () => {
  isSystemActive = true;
  recognition.start();
  startBtn.style.display = 'none';
  muteBtn.style.display = 'inline-block';
  setHudState('listening', 'ONLINE');
  speak('자비스 홀로그램 인터페이스가 가동되었습니다. 편하게 말씀해 주세요.');
});

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  if (isMuted) {
    recognition.stop();
    muteBtn.innerText = '마이크 다시 켜기';
    setHudState('muted', 'MUTED');
    log.innerText = 'JARVIS: 마이크가 일시정지되었습니다.';
  } else {
    recognition.start();
    muteBtn.innerText = '마이크 일시정지';
    setHudState('listening', 'ONLINE');
    log.innerText = 'JARVIS: 다시 듣고 있습니다. 말씀해 주세요.';
  }
});
