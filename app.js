if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

const core = document.getElementById('core');
const startBtn = document.getElementById('startBtn');
const muteBtn = document.getElementById('muteBtn');
const silentModeBtn = document.getElementById('silentModeBtn');
const chatForm = document.getElementById('chatForm');
const textInput = document.getElementById('textInput');
const log = document.getElementById('log');
const clockEl = document.getElementById('clock');

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function updateClock() {
  const now = new Date();
  clockEl.innerText = now.toTimeString().split(' ')[0];
}
setInterval(updateClock, 1000);
updateClock();

function setHudState(state, label) {
  document.body.className = `state-${state}`;
  core.innerText = label;
}

let audioCtx = null;
let wakeLock = null;

async function enableBackgroundKeepAlive() {
  if (!isIOS) {
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.0001;
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
      }
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
    } catch (e) {}
  }

  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    }
  } catch (e) {}
}

document.addEventListener('visibilitychange', () => {
  if (isSystemActive && !isMuted && !isSpeaking) {
    enableBackgroundKeepAlive();
    safeStartRecognition();
  }
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'ko-KR';
recognition.continuous = !isIOS;
recognition.interimResults = false;

let isSystemActive = false;
let isMuted = false;
let isSpeaking = false;
let isSilentOutput = false;
let chatHistory = [];
let currentAudio = null; // 현재 재생 중인 릴스 TTS 오디오 객체

function addToHistory(role, text) {
  chatHistory.push({ role, text });
  if (chatHistory.length > 6) {
    chatHistory.shift();
  }
}

function safeStartRecognition() {
  if (!isSystemActive || isMuted || isSpeaking) return;
  try {
    recognition.start();
  } catch (e) {}
}

function finishSpeaking() {
  isSpeaking = false;
  if (!isSystemActive) {
    setHudState('primary', 'TEXT MODE');
  } else if (isMuted) {
    setHudState('muted', 'MUTED');
  } else {
    setHudState('listening', 'ONLINE');
    if (isIOS) {
      setTimeout(safeStartRecognition, 300);
    }
  }
}

// 네트워크 지연 시 백업으로 작동하는 브라우저 내장 하이톤 음성
function fallbackBrowserSpeak(text) {
  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find((v) => v.lang.includes('ko') && (v.name.includes('SunHi') || v.name.includes('선희'))) ||
    voices.find((v) => v.lang.includes('ko') && v.name.includes('Google')) ||
    voices.find((v) => v.lang.includes('ko')) ||
    null;

  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = 'ko-KR';
  utterance.rate = 1.2;
  utterance.pitch = 1.25;

  utterance.onstart = () => {
    isSpeaking = true;
    setHudState('speaking', 'SPEAKING');
  };
  utterance.onend = finishSpeaking;
  utterance.onerror = finishSpeaking;

  window.speechSynthesis.speak(utterance);
}

// ★ 릴스/틱톡 성우 AI 음성(ko-KR-SunHiNeural) 재생 함수
async function speak(text) {
  log.innerText = `JARVIS: ${text}`;
  window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (isSilentOutput || !isSystemActive) {
    finishSpeaking();
    return;
  }

  if (isIOS) {
    try { recognition.stop(); } catch (e) {}
  }

  isSpeaking = true;
  setHudState('speaking', 'SPEAKING');

  try {
    const response = await fetch('/.netlify/functions/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error('TTS 서버 호출 실패');
    const data = await response.json();
    if (!data.audioBase64) throw new Error('오디오 데이터 없음');

    currentAudio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
    currentAudio.onended = finishSpeaking;
    currentAudio.onerror = () => {
      fallbackBrowserSpeak(text);
    };

    await currentAudio.play();
  } catch (err) {
    console.warn('클라우드 TTS 백업 전환:', err);
    fallbackBrowserSpeak(text);
  }
}

function handleInstantCommand(command) {
  if (command.includes('기억 지워') || command.includes('대화 초기화') || command.includes('기억 초기화')) {
    chatHistory = [];
    speak('네, 방금까지 나눈 대화 기억을 깨끗하게 비웠어요!');
    return true;
  }

  if (command.includes('유튜브') && !command.includes('검색') && !command.includes('찾아')) {
    const reply = '네, 바로 유튜브 열어드릴게요!';
    addToHistory('user', command);
    addToHistory('jarvis', reply);
    speak(reply);
    window.open('https://www.youtube.com', '_blank');
    return true;
  }
  if (command.includes('지메일') || command.includes('메일')) {
    const reply = '네, 지메일 확인하실 수 있게 열어드렸어요!';
    addToHistory('user', command);
    addToHistory('jarvis', reply);
    speak(reply);
    window.open('https://mail.google.com', '_blank');
    return true;
  }
  if (command.includes('네이버') && !command.includes('검색') && !command.includes('찾아')) {
    const reply = '네이버 화면 바로 띄워드렸습니다!';
    addToHistory('user', command);
    addToHistory('jarvis', reply);
    speak(reply);
    window.open('https://www.naver.com', '_blank');
    return true;
  }
  if (command.includes('구글') && !command.includes('검색') && !command.includes('찾아')) {
    const reply = '구글 페이지 열어드렸어요!';
    addToHistory('user', command);
    addToHistory('jarvis', reply);
    speak(reply);
    window.open('https://www.google.com', '_blank');
    return true;
  }
  return false;
}

async function askJarvisBrain(userCommand) {
  if (handleInstantCommand(userCommand)) return;

  setHudState('thinking', 'THINKING');
  log.innerText = `분석 중: "${userCommand}"`;

  try {
    const response = await fetch('/.netlify/functions/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCommand, chatHistory })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `서버 오류 (${response.status})`);
    }

    addToHistory('user', userCommand);
    addToHistory('jarvis', data.reply);

    speak(data.reply);

    if (data.action === 'OPEN_URL' && data.url) {
      window.open(data.url, '_blank');
    }
  } catch (error) {
    console.error('상세 오류:', error);
    log.innerText = `오류 원인: ${error.message}`;
    speak(`오류가 발생했어요. ${error.message}`);
  } finally {
    if (!isSpeaking) {
      finishSpeaking();
    }
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const typedCommand = textInput.value.trim();
  if (!typedCommand) return;

  textInput.value = '';
  askJarvisBrain(typedCommand);
});

silentModeBtn.addEventListener('click', () => {
  isSilentOutput = !isSilentOutput;
  if (isSilentOutput) {
    window.speechSynthesis.cancel();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    silentModeBtn.innerText = '무음 출력: ON';
    silentModeBtn.classList.add('active-silent');
    log.innerText = 'JARVIS: 조용한 모드가 켜졌습니다. 이제 소리 없이 화면으로만 대답할게요.';
  } else {
    silentModeBtn.innerText = '무음 출력: OFF';
    silentModeBtn.classList.remove('active-silent');
    log.innerText = 'JARVIS: 음성 출력이 다시 켜졌습니다.';
  }
});

recognition.onresult = (event) => {
  if (isSpeaking || isMuted) return;

  const lastIndex = event.results.length - 1;
  const transcript = event.results[lastIndex][0].transcript.trim();
  const cleanCommand = transcript.replace(/^자\s*비스[,\s]*/, '').trim();

  if (cleanCommand.length === 0) {
    const greetings = [
      '네, 부르셨어요?',
      '네, 말씀하세요! 듣고 있어요.',
      '네, 무슨 일이신가요?'
    ];
    speak(greetings[Math.floor(Math.random() * greetings.length)]);
  } else {
    askJarvisBrain(cleanCommand);
  }
};

recognition.onend = () => {
  if (isSystemActive && !isMuted && !isSpeaking) {
    setTimeout(safeStartRecognition, 300);
  }
};

startBtn.addEventListener('click', () => {
  isSystemActive = true;
  enableBackgroundKeepAlive();

  // iOS/크롬 모바일 오디오 자동재생 잠금 해제
  const silentUnlock = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
  silentUnlock.play().catch(() => {});

  safeStartRecognition();
  startBtn.style.display = 'none';
  muteBtn.style.display = 'inline-block';
  setHudState('listening', 'ONLINE');
  speak('자비스 시스템이 준비되었습니다!');
});

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  if (isMuted) {
    try { recognition.stop(); } catch (e) {}
    muteBtn.innerText = '마이크 다시 켜기';
    setHudState('muted', 'MUTED');
    log.innerText = 'JARVIS: 마이크가 일시정지되었습니다.';
  } else {
    enableBackgroundKeepAlive();
    safeStartRecognition();
    muteBtn.innerText = '마이크 일시정지';
    setHudState('listening', 'ONLINE');
    log.innerText = 'JARVIS: 다시 듣고 있습니다. 말씀해 주세요.';
  }
});

if (new URLSearchParams(window.location.search).get('auto') === '1') {
  window.addEventListener('load', () => {
    setTimeout(() => startBtn.click(), 500);
  });
}
