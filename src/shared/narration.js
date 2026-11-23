/* 문장 단위 음성 설명 (Web Speech API). 음성이 없는 기기에서는 자막을 읽을 시간만큼 기다린다 */

function pickKoreanVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const korean = voices.filter((voice) => (voice.lang || "").toLowerCase().startsWith("ko"));
  if (!korean.length) return null;
  return (
    korean.find((voice) => /google|natural|neural/i.test(voice.name)) ||
    korean.find((voice) => /yuna|sora|jinho|mina/i.test(voice.name)) ||
    korean[0]
  );
}

export class Narrator {
  constructor({ sentences, onSentence, onState }) {
    this.sentences = sentences;
    this.onSentence = onSentence || (() => {});
    this.onState = onState || (() => {});
    this.supported = "speechSynthesis" in window;
    this.token = 0;
    this.state = "idle";
    this.voice = null;

    this.loadVoice = () => {
      this.voice = pickKoreanVoice();
    };
    if (this.supported) {
      this.loadVoice();
      window.speechSynthesis.addEventListener("voiceschanged", this.loadVoice);
    }
  }

  /** 레슨을 떠날 때: 읽기를 멈추고 음성 목록 구독을 푼다 */
  dispose() {
    this.stop();
    if (this.supported) {
      window.speechSynthesis.removeEventListener("voiceschanged", this.loadVoice);
    }
  }

  emit(state) {
    this.state = state;
    this.onState(state);
  }

  cancelAudio() {
    if (!this.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch (error) {
      /* 무시: 브라우저가 아직 준비되지 않은 경우 */
    }
  }

  async start() {
    this.token += 1;
    const token = this.token;
    this.cancelAudio();
    this.emit("playing");

    for (const sentence of this.sentences) {
      if (token !== this.token) return;
      this.onSentence(sentence);
      // eslint-disable-next-line no-await-in-loop
      await this.speak(sentence);
    }

    if (token === this.token) this.emit("done");
  }

  stop() {
    this.token += 1;
    this.cancelAudio();
    this.emit("stopped");
  }

  speak(text) {
    return new Promise((resolve) => {
      let settled = false;
      let safety = 0;
      const readTime = Math.max(2800, 1100 + text.length * 185);

      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(safety);
        resolve();
      };

      if (!this.supported) {
        safety = window.setTimeout(finish, readTime);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ko-KR";
      utterance.rate = 0.94;
      utterance.pitch = 1.06;
      utterance.volume = 1;
      if (this.voice) utterance.voice = this.voice;

      utterance.onend = finish;
      utterance.onerror = (event) => {
        if (event.error === "interrupted" || event.error === "canceled") {
          finish();
          return;
        }
        // 음성을 낼 수 없는 환경에서는 자막을 읽을 시간만큼만 기다린다
        if (!settled) {
          window.clearTimeout(safety);
          safety = window.setTimeout(finish, readTime);
        }
      };

      safety = window.setTimeout(finish, 7000 + text.length * 250);

      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        window.clearTimeout(safety);
        safety = window.setTimeout(finish, readTime);
      }
    });
  }
}
