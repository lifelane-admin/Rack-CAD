/**
 * RackSlicer AI Studio – 3D & Interactive Avatar Subsystem
 *
 * Featured Avatars:
 * 1. 3D Cute Robot (Primary): Adorable 3D glossy cyber assistant waving hand with dynamic emotions,
 *    floating physics, and speech interaction.
 * 2. 3D Holographic AI Drone: Real-time Three.js WebGL procedural glowing core with orbital scanner rings
 *    and datacenter particle field.
 */

import * as THREE from 'three';

export type AvatarType = 'cute-robot' | 'hologram';
export type AvatarMood = 'idle' | 'analyzing' | 'thinking' | 'celebrating' | 'alert';

export class AIAvatarManager {
  private container: HTMLElement;
  private currentType: AvatarType = 'cute-robot';
  private currentMood: AvatarMood = 'idle';
  private isPlaying = false;

  // Three.js instances for Hologram mode
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private clock = new THREE.Clock();
  private animationFrameId: number | null = null;
  private holoModel: THREE.Group | null = null;

  // Procedural hologram mesh references
  private holoCore: THREE.Mesh | null = null;
  private holoRing1: THREE.Mesh | null = null;
  private holoRing2: THREE.Mesh | null = null;
  private holoParticles: THREE.Points | null = null;

  // DOM elements
  private canvasContainer: HTMLElement | null = null;
  private imageEl: HTMLImageElement | null = null;
  private speechBubbleEl: HTMLElement | null = null;
  private selectorModalEl: HTMLElement | null = null;

  private mouse = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.container = container;
    const savedType = localStorage.getItem('rackslicer_ai_avatar_type') as AvatarType;
    if (savedType === 'hologram') {
      this.currentType = 'hologram';
    } else {
      this.currentType = 'cute-robot';
    }
    this.initDOM();
    this.loadCurrentAvatar();
    this.bindMouseTracking();
  }

  private initDOM(): void {
    this.container.innerHTML = `
      <div class="ai-avatar-holder" id="ai-avatar-holder">
        <!-- 3D WebGL Canvas Slot (Hologram mode) -->
        <div class="ai-avatar-3d-canvas" id="ai-avatar-3d-canvas" style="display:none;"></div>

        <!-- 3D Cute Robot Image Slot -->
        <div class="cute-robot-wrapper" id="cute-robot-wrapper">
          <img class="char-reference-img" id="ai-avatar-robot-img" src="/assets/ai-studio/char_avatar.png" alt="RackSlicer Cute 3D AI Robot" />
          <div class="robot-glow-ring"></div>
        </div>

        <!-- Speech Dialog Bubble -->
        <div class="welcome" id="ai-avatar-welcome-bubble">
          <b>Hi! I'm RackSlicer AI</b>
          <p id="ai-avatar-speech-p">Your intelligent infrastructure architect.<br>I'll help you design, optimize and build your infrastructure.</p>
        </div>

        <!-- Switch Avatar Control Pill -->
        <button class="btn-avatar-switch" id="btn-avatar-switch" title="Switch AI Architect Avatar">
          <span>✨ Change Avatar</span>
        </button>
      </div>
    `;

    this.canvasContainer = this.container.querySelector('#ai-avatar-3d-canvas');
    this.imageEl = this.container.querySelector('#ai-avatar-robot-img');
    this.speechBubbleEl = this.container.querySelector('#ai-avatar-welcome-bubble');

    this.container.querySelector('#btn-avatar-switch')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showAvatarSelector();
    });
  }

  setAvatar(type: AvatarType): void {
    this.currentType = type;
    localStorage.setItem('rackslicer_ai_avatar_type', type);
    this.loadCurrentAvatar();
  }

  getAvatarType(): AvatarType {
    return this.currentType;
  }

  setMood(mood: AvatarMood): void {
    this.currentMood = mood;
    if (this.currentType === 'cute-robot' && this.imageEl) {
      this.imageEl.classList.remove('avatar-celebrate', 'avatar-thinking', 'avatar-alert');
      void this.imageEl.offsetWidth; // trigger reflow

      if (mood === 'celebrating') {
        this.imageEl.classList.add('avatar-celebrate');
      } else if (mood === 'thinking' || mood === 'analyzing') {
        this.imageEl.classList.add('avatar-thinking');
      } else if (mood === 'alert') {
        this.imageEl.classList.add('avatar-alert');
      }
    }
  }

  say(message: string, durationMs?: number): void {
    const textEl = this.container.querySelector('#ai-avatar-speech-p');
    if (textEl) {
      textEl.innerHTML = message;
    }
    if (this.speechBubbleEl) {
      this.speechBubbleEl.style.display = 'block';
    }

    if (this.currentType === 'cute-robot' && this.imageEl) {
      this.imageEl.classList.add('avatar-waving');
      setTimeout(() => {
        this.imageEl?.classList.remove('avatar-waving');
      }, 1800);
    }

    if (durationMs) {
      setTimeout(() => {
        if (textEl && textEl.innerHTML === message) {
          textEl.innerHTML = 'Your intelligent infrastructure architect.<br>Ready to collaborate.';
        }
      }, durationMs);
    }
  }

  private isWebGLAvailable(): boolean {
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') return false;
      const canvas = document.createElement('canvas');
      return !!(
        (window as any).WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch {
      return false;
    }
  }

  private loadCurrentAvatar(): void {
    this.cleanupThree();

    const robotWrapper = this.container.querySelector('#cute-robot-wrapper') as HTMLElement | null;

    if (this.currentType === 'cute-robot' || !this.isWebGLAvailable()) {
      if (this.canvasContainer) this.canvasContainer.style.display = 'none';
      if (robotWrapper) robotWrapper.style.display = 'flex';
      return;
    }

    // Hologram mode
    if (robotWrapper) robotWrapper.style.display = 'none';
    if (this.canvasContainer) {
      this.canvasContainer.style.display = 'block';
      this.initThree();
      this.createProceduralHologram();
    }
  }

  private initThree(): void {
    if (!this.canvasContainer) return;
    const width = this.canvasContainer.clientWidth || 190;
    const height = this.canvasContainer.clientHeight || 230;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 0.4, 3.2);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // Headless / fallback to cute-robot
      const robotWrapper = this.container.querySelector('#cute-robot-wrapper') as HTMLElement | null;
      if (this.canvasContainer) this.canvasContainer.style.display = 'none';
      if (robotWrapper) robotWrapper.style.display = 'flex';
      return;
    }

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvasContainer.innerHTML = '';
    this.canvasContainer.appendChild(this.renderer.domElement);

    // Soft datacenter lighting
    const ambient = new THREE.AmbientLight(0xdbeafe, 1.4);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.2);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x818cf8, 1.8);
    rimLight.position.set(-2, 1, -2);
    this.scene.add(rimLight);

    this.startAnimationLoop();
  }

  private createProceduralHologram(): void {
    if (!this.scene) return;

    const group = new THREE.Group();

    // 1. Glowing central core
    const coreGeo = new THREE.IcosahedronGeometry(0.5, 3);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      roughness: 0.2,
      metalness: 0.8,
      wireframe: true,
    });
    this.holoCore = new THREE.Mesh(coreGeo, coreMat);
    group.add(this.holoCore);

    // 2. Orbital scanner rings
    const ring1Geo = new THREE.TorusGeometry(0.8, 0.02, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x818cf8 });
    this.holoRing1 = new THREE.Mesh(ring1Geo, ringMat);
    group.add(this.holoRing1);

    const ring2Geo = new THREE.TorusGeometry(1.0, 0.015, 16, 64);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    this.holoRing2 = new THREE.Mesh(ring2Geo, ring2Mat);
    this.holoRing2.rotation.x = Math.PI / 3;
    group.add(this.holoRing2);

    // 3. Floating datacenter particles
    const pCount = 80;
    const pGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 2.5;
      positions[i + 1] = (Math.random() - 0.5) * 2.5;
      positions[i + 2] = (Math.random() - 0.5) * 2.5;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.04, transparent: true, opacity: 0.8 });
    this.holoParticles = new THREE.Points(pGeo, pMat);
    group.add(this.holoParticles);

    group.position.set(0, 0.2, 0);
    this.holoModel = group;
    this.scene.add(group);
  }

  private startAnimationLoop(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      const delta = this.clock.getDelta();

      // Procedural hologram animations
      if (this.holoCore) {
        this.holoCore.rotation.y += delta * 0.8;
        this.holoCore.rotation.x += delta * 0.4;
      }
      if (this.holoRing1) {
        this.holoRing1.rotation.z += delta * 1.2;
        this.holoRing1.rotation.y += delta * 0.5;
      }
      if (this.holoRing2) {
        this.holoRing2.rotation.x -= delta * 0.9;
        this.holoRing2.rotation.z += delta * 0.6;
      }
      if (this.holoParticles) {
        this.holoParticles.rotation.y += delta * 0.15;
      }

      // Parallax tracking
      if (this.holoModel) {
        const targetRotY = this.mouse.x * 0.4;
        const targetRotX = this.mouse.y * 0.2;
        this.holoModel.rotation.y += (targetRotY - this.holoModel.rotation.y) * 0.05;
        this.holoModel.rotation.x += (targetRotX - this.holoModel.rotation.x) * 0.05;
      }

      if (this.renderer && this.scene && this.camera && this.canvasContainer) {
        const w = this.canvasContainer.clientWidth;
        const h = this.canvasContainer.clientHeight;
        if (w > 0 && h > 0) {
          this.renderer.render(this.scene, this.camera);
        }
      }
    };

    if (this.isPlaying) {
      animate();
    }
  }

  start(): void {
    this.isPlaying = true;
    if (this.currentType === 'hologram') {
      if (!this.renderer) {
        this.loadCurrentAvatar();
      } else if (!this.animationFrameId) {
        this.startAnimationLoop();
      }
    }
  }

  pause(): void {
    this.isPlaying = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private bindMouseTracking(): void {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      // Subtle parallax tilt for the cute robot
      if (this.currentType === 'cute-robot' && this.imageEl) {
        const tiltX = -this.mouse.y * 7;
        const tiltY = this.mouse.x * 8;
        this.imageEl.style.transform = `perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
      }
    });
  }

  private cleanupThree(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
    this.holoModel = null;
    this.holoCore = null;
    this.holoRing1 = null;
    this.holoRing2 = null;
    this.holoParticles = null;
  }

  private showAvatarSelector(): void {
    if (this.selectorModalEl) this.selectorModalEl.remove();

    const overlay = document.createElement('div');
    overlay.className = 'avatar-selector-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(3,7,18,0.75); z-index:10001; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);';

    overlay.innerHTML = `
      <div style="background:#090d16; border:1px solid #1e293b; border-radius:12px; width:440px; padding:20px; box-shadow:0 20px 40px rgba(0,0,0,0.6); color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #1e293b; padding-bottom:8px;">
          <div style="font-weight:700; font-size:14px; display:flex; align-items:center; gap:8px;">
            <span>🤖</span>
            <span>Select AI Architect Avatar</span>
          </div>
          <button id="btn-close-avatar-modal" style="background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer;">✕</button>
        </div>

        <div style="font-size:11px; color:#94a3b8; margin-bottom:14px;">
          Choose your active AI assistant representation in RackSlicer AI Studio.
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <!-- Option 1: 3D Cute Robot -->
          <div class="avatar-option-card ${this.currentType === 'cute-robot' ? 'selected' : ''}" data-type="cute-robot" style="border:2px solid ${this.currentType === 'cute-robot' ? '#086cff' : '#1e293b'}; background:#0e1526; border-radius:10px; padding:14px; text-align:center; cursor:pointer; transition:all 0.2s; position:relative;">
            <div style="width:72px; height:72px; margin:0 auto 8px; border-radius:50%; background:#0f243d; display:flex; align-items:center; justify-content:center; border:2px solid #38bdf8; overflow:hidden; box-shadow:0 0 16px rgba(56,189,248,0.35);">
              <img src="/assets/ai-studio/hero_avatar.png" alt="Cute 3D Robot" style="width:100%; height:100%; object-fit:contain;" />
            </div>
            <div style="font-weight:700; font-size:13px; color:#f8fafc;">Cute 3D Robot</div>
            <div style="font-size:10px; color:#38bdf8; margin-top:2px;">Waving Assistant (Active)</div>
            <div style="font-size:9.5px; color:#94a3b8; margin-top:4px;">Expressive 3D cyber companion with real-time speech reactions</div>
          </div>

          <!-- Option 2: 3D Holographic AI Drone Core -->
          <div class="avatar-option-card ${this.currentType === 'hologram' ? 'selected' : ''}" data-type="hologram" style="border:2px solid ${this.currentType === 'hologram' ? '#086cff' : '#1e293b'}; background:#0e1526; border-radius:10px; padding:14px; text-align:center; cursor:pointer; transition:all 0.2s;">
            <div style="width:72px; height:72px; margin:0 auto 8px; border-radius:50%; background:#0f243d; display:flex; align-items:center; justify-content:center; border:2px solid #818cf8; font-size:36px; box-shadow:0 0 16px rgba(129,140,248,0.35);">
              🔮
            </div>
            <div style="font-weight:700; font-size:13px; color:#f8fafc;">3D AI Drone Core</div>
            <div style="font-size:10px; color:#818cf8; margin-top:2px;">WebGL Three.js Hologram</div>
            <div style="font-size:9.5px; color:#94a3b8; margin-top:4px;">Interactive orbital scanner rings and datacenter particle cloud</div>
          </div>
        </div>
      </div>
    `;

    overlay.querySelector('#btn-close-avatar-modal')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelectorAll('.avatar-option-card').forEach((card) => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-type') as AvatarType;
        if (type) {
          this.setAvatar(type);
          overlay.remove();
        }
      });
    });

    document.body.appendChild(overlay);
    this.selectorModalEl = overlay;
  }
}
