/**
 * RackSlicer AI Studio – Animated Architect Avatar
 * Renders an animated SVG/Canvas AI character with expressive state transitions
 * (idle, analyzing, thinking, celebrating) and interactive speech dialogues.
 */

export type AvatarMood = 'idle' | 'analyzing' | 'thinking' | 'celebrating' | 'alert';

export class AIAvatar {
  private container: HTMLElement;
  private currentMood: AvatarMood = 'idle';
  private speechBubbleEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  setMood(mood: AvatarMood): void {
    this.currentMood = mood;
    this.updateMoodVisuals();
  }

  say(message: string, durationMs?: number): void {
    if (!this.speechBubbleEl) return;
    this.speechBubbleEl.innerHTML = `<span class="ai-avatar-text">${message}</span>`;
    this.speechBubbleEl.classList.add('visible');

    if (durationMs) {
      setTimeout(() => {
        this.speechBubbleEl?.classList.remove('visible');
      }, durationMs);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="ai-avatar-wrapper" id="ai-avatar-wrapper" title="RackSlicer AI Infrastructure Architect">
        <div class="ai-avatar-speech-bubble" id="ai-avatar-speech">
          Hello! I'm <strong>RackSlicer AI</strong>, your AI Infrastructure Architect.
        </div>
        <div class="ai-avatar-chassis">
          <svg class="ai-avatar-svg" viewBox="0 0 120 120" width="80" height="80">
            <defs>
              <linearGradient id="ai-visor-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8" />
                <stop offset="100%" stop-color="#0284c7" />
              </linearGradient>
              <linearGradient id="ai-chassis-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#1e293b" />
                <stop offset="100%" stop-color="#0f172a" />
              </linearGradient>
              <filter id="ai-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <!-- Antenna -->
            <line x1="60" y1="20" x2="60" y2="8" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
            <circle cx="60" cy="8" r="4" fill="#38bdf8" filter="url(#ai-glow)" class="ai-antenna-orb" />

            <!-- Head Outer Shell -->
            <rect x="22" y="22" width="76" height="70" rx="16" fill="url(#ai-chassis-grad)" stroke="#334155" stroke-width="2.5" />

            <!-- Ear Ports -->
            <rect x="14" y="44" width="8" height="26" rx="3" fill="#38bdf8" opacity="0.8" />
            <rect x="98" y="44" width="8" height="26" rx="3" fill="#38bdf8" opacity="0.8" />

            <!-- Visor Screen -->
            <rect x="30" y="36" width="60" height="38" rx="10" fill="#040812" stroke="#1e293b" stroke-width="1.5" />

            <!-- Glowing LED Eyes (Visor Display) -->
            <g class="ai-avatar-eyes">
              <!-- Left Eye -->
              <rect class="ai-eye left" x="40" y="48" width="14" height="14" rx="4" fill="#38bdf8" filter="url(#ai-glow)" />
              <!-- Right Eye -->
              <rect class="ai-eye right" x="66" y="48" width="14" height="14" rx="4" fill="#38bdf8" filter="url(#ai-glow)" />
            </g>

            <!-- Status Indicator Pulse Line -->
            <path d="M 42 82 Q 60 88 78 82" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" opacity="0.7" class="ai-avatar-mouth" />
          </svg>
        </div>
      </div>
    `;

    this.speechBubbleEl = this.container.querySelector('#ai-avatar-speech');

    const wrapper = this.container.querySelector('#ai-avatar-wrapper');
    wrapper?.addEventListener('click', () => {
      this.blink();
      const phrases = [
        "Let's architect a high-availability datacenter infrastructure!",
        "Every rack unit counts: optimizing for space, power, and thermal airflow.",
        "A/B redundant power feeds keep your mission-critical compute online.",
        "Searching the RackSlicer catalog for right-sized servers and switches.",
      ];
      const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
      this.say(randomPhrase, 4000);
    });
  }

  private blink(): void {
    const eyes = this.container.querySelectorAll('.ai-eye');
    eyes.forEach(eye => {
      eye.setAttribute('transform', 'scale(1, 0.1)');
      setTimeout(() => {
        eye.removeAttribute('transform');
      }, 150);
    });
  }

  private updateMoodVisuals(): void {
    const orb = this.container.querySelector('.ai-antenna-orb');
    const eyes = this.container.querySelectorAll('.ai-eye');
    const mouth = this.container.querySelector('.ai-avatar-mouth');

    let color = '#38bdf8'; // cyan default
    if (this.currentMood === 'thinking') color = '#a855f7'; // purple
    if (this.currentMood === 'celebrating') color = '#4ade80'; // emerald
    if (this.currentMood === 'alert') color = '#f59e0b'; // amber
    if (this.currentMood === 'analyzing') color = '#06b6d4'; // teal

    orb?.setAttribute('fill', color);
    mouth?.setAttribute('stroke', color);
    eyes.forEach(eye => eye.setAttribute('fill', color));
  }
}
