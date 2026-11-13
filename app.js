if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

const core = document.getElementById('core');
const startBtn = document.getElementById('startBtn');
const muteBtn = document.getElementById('muteBtn');
const log = document.getElementById('log');
const clockEl = document.getElementById('clock');

// 아이폰/아이패드(iOS) 기기 감지
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
  // iOS에서는 무음 오디오가 마이크와 충돌하므로 PC/안드로이드에서만 실행
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
// 아이폰(iOS)은 continuous = false로 해야 안정적으로 인식됨
recognition.continuous = !isIOS;
recognition.interimResults = false;

let isSystemActive = false;
let isMuted = false;
let isSpeaking = false;
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
  } catch (e) {
    // 이미 실행 중이면 무시
  }
}

function getNaturalVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    // 1순위: 한국어 중 남성(Male, Kyongho, 남성) 목소리 찾기
    voices.find((v) => v.lang.includes('ko') && (v.name.toLowerCase().includes('male') || v.name.includes('Kyongho') || v.name.includes('남성'))) ||
    // 2순위: 남성 목소리가 없다면 일반 한국어 목소리
    voices.find((v) => v.lang.includes('ko')) ||
    null
  );
}

window.speechSynthesis.onvoiceschanged = getNaturalVoice;

function speak(text) {
  log.innerText = `JARVIS: ${text}`;
  window.speechSynthesis.cancel();

  // 아이폰에서는 말하는 동안 마이크를 잠시 꺼야 오디오 출력이 차단되지 않음
  if (isIOS) {
    try { recognition.stop(); } catch (e) {}
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getNaturalVoice();
  if (voice) utterance.voice = voice;

  utterance.lang = 'ko-KR';
  utterance.rate = 1.02;
  utterance.pitch = 0.5;

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
      // 말이 끝나면 아이폰에서도 다시 마이크 자동 시작
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
  log.innerText = `명령 분석 중: "${userCommand}"`;

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
  if (isSystemActive && !isMuted && !isSpeaking) {
    setTimeout(safeStartRecognition, 300);
  }
};

startBtn.addEventListener('click', () => {
  isSystemActive = true;
  enableBackgroundKeepAlive();

  // ★ 아이폰 음성 합성 잠금 해제 (터치 순간 빈 오디오 1회 실행)
  const unlockUtterance = new SpeechSynthesisUtterance('');
  window.speechSynthesis.speak(unlockUtterance);

  safeStartRecognition();
  startBtn.style.display = 'none';
  muteBtn.style.display = 'inline-block';
  setHudState('listening', 'ONLINE');
  speak('자비스 시스템이 준비되었습니다. 이제 이전 대화도 기억하면서 대답할게요.');
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
