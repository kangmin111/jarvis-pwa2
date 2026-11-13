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
let isSilentOutput = false; // ★ 조용한 채팅(무음 출력) 모드 상태
let chatHistory = [];

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

function getNaturalVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.includes('ko') && (v.name.includes('Google') || v.name.includes('Yuna'))) ||
    voices.find((v) => v.lang.includes('ko')) ||
    null
  );
}

window.speechSynthesis.onvoiceschanged = getNaturalVoice;

function speak(text) {
  log.innerText = `JARVIS: ${text}`;
  window.speechSynthesis.cancel();

  // ★ 무음 출력 모드이거나 음성 시스템을 켜지 않은 상태면 소리 없이 텍스트만 표시
  if (isSilentOutput || !isSystemActive) {
    if (!isSystemActive) {
      setHudState('primary', 'TEXT MODE');
    } else {
      setHudState(isMuted ? 'muted' : 'listening', isMuted ? 'SILENT' : 'ONLINE');
    }
    return;
  }

  if (isIOS) {
    try { recognition.stop(); } catch (e) {}
  }

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
      if (isIOS) {
        setTimeout(safeStartRecognition, 300);
      }
    }
  };

  utterance.onerror = () => {
    isSpeaking = false;
    if (!isMuted) {
      setHudState('listening', 'ONLINE');
      if (isIOS) setTimeout(safeStartRecognition, 300);
    }
  };

  window.speechSynthesis.speak(utterance);
}

function handleInstantCommand(command) {
  if (command.includes('기억 지워') || command.includes('대화 초기화') || command.includes('기억 초기화')) {
    chatHistory = [];
    speak('네, 방금까지 나눈 대화 기억을 깨끗하게 비웠어요.');
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
    const reply = '네, 지메일 확인하실 수 있게 열어드렸어요.';
    addToHistory('user', command);
    addToHistory('jarvis', reply);
    speak(reply);
    window.open('https://mail.google.com', '_blank');
    return true;
  }
  if (command.includes('네이버') && !command.includes('검색') && !command.includes('찾아')) {
    const reply = '네이버 화면 띄워드렸습니다.';
    addToHistory('user', command);
    addToHistory('jarvis', reply);
    speak(reply);
    window.open('https://www.naver.com', '_blank');
    return true;
  }
  if (command.includes('구글') && !command.includes('검색') && !command.includes('찾아')) {
    const reply = '구글 페이지 열어드렸어요.';
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
      if (!isSystemActive) {
        setHudState('primary', 'TEXT MODE');
      } else {
        setHudState(isMuted ? 'muted' : 'listening', isMuted ? 'SILENT' : 'ONLINE');
      }
    }
  }
}

// ★ 조용한 채팅 입력창 전송 이벤트
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const typedCommand = textInput.value.trim();
  if (!typedCommand) return;

  textInput.value = '';
  askJarvisBrain(typedCommand);
});

// ★ 무음 출력 토글 버튼
silentModeBtn.addEventListener('click', () => {
  isSilentOutput = !isSilentOutput;
  if (isSilentOutput) {
    window.speechSynthesis.cancel();
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
      '네, 말씀하세요. 듣고 있어요.',
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

  const unlockUtterance = new SpeechSynthesisUtterance('');
  window.speechSynthesis.speak(unlockUtterance);

  safeStartRecognition();
  startBtn.style.display = 'none';
  muteBtn.style.display = 'inline-block';
  setHudState('listening', 'ONLINE');
  speak('자비스 시스템이 준비되었습니다.');
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

// 주소창에 ?auto=1이 붙어서 열리면 즉시 시스템 가동
if (new URLSearchParams(window.location.search).get('auto') === '1') {
  window.addEventListener('load', () => {
    setTimeout(() => startBtn.click(), 500);
  });
}
