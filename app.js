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

// 서버 혼잡과 무관하게 0.1초 만에 즉시 실행되는 기본 단축 명령
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
  // 1. 기본 사이트 열기 명령이면 서버 안 거치고 즉시 실행
  if (handleInstantCommand(userCommand)) return;

  // 2. 일반 대화나 검색 명령은 AI 두뇌 서버로 전송
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
    if (error.message.includes('high demand')) {
      log.innerText = '구글 AI 서버 일시 혼잡 - 잠시 후 다시 말씀해 주세요.';
      speak('지금 구글 AI 서버에 접속자가 너무 많아서 잠깐 막혔어요. 몇 초 뒤에 다시 말씀해 주실래요?');
    } else {
      log.innerText = `오류 원인: ${error.message}`;
      speak(`오류가 발생했어요. ${error.message}`);
    }
  } finally {
    core.innerText = 'ONLINE';
    core.classList.remove('thinking');
    core.classList.add('listening');
  }
}

recognition.onresult = (event) => {
  if (isSpeaking) return;

  const lastIndex = event.results.length - 1;
  const transcript = event.results[lastIndex][0].transcript.trim();
  console.log('인식된 음성:', transcript);

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
  speak('자비스 시스템이 준비됐어요. 편하게 말씀해 주세요.');
});
