import * as THREE from 'three';

export class MaterialManager {
  private cache = new Map<string, THREE.MeshStandardMaterial>();

  get(type: string, color?: string): THREE.MeshStandardMaterial {
    const key = color ? `device\0${color}` : type;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const mat = this.create(type, color);
    this.cache.set(key, mat);
    return mat;
  }

  getTextured(imageDataUrl: string): THREE.MeshStandardMaterial {
    const key = `texture:${imageDataUrl.length}:${imageDataUrl.slice(-32)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const loader = new THREE.TextureLoader();
    const texture = loader.load(imageDataUrl);
    const mat = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.2, roughness: 0.5 });
    this.cache.set(key, mat);
    return mat;
  }

  getFrontPanel(color: string, label: string, heightUnits: number): THREE.MeshStandardMaterial {
    const key = `front-panel:${color}:${label}:${heightUnits}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const W = 512;
    const H = Math.max(64, Math.round(128 * heightUnits));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Base color fill
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);

    // Always-visible gradient overlay (lighten very dark panels)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Bezel edge lines
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, W, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, H - 2, W, 2);

    // Device label — dark shadow for contrast on any background
    const fontSize = Math.min(22, Math.max(10, H * 0.30));
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 14, H / 2);
    ctx.shadowBlur = 0;

    // Power LED — green
    const dotR = Math.max(4, H * 0.08);
    ctx.beginPath();
    ctx.arc(W - 22, H / 2, dotR, 0, Math.PI * 2);
    ctx.fillStyle = '#33ff77';
    ctx.fill();
    // Glow halo
    ctx.beginPath();
    ctx.arc(W - 22, H / 2, dotR * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(51,255,119,0.25)';
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.2, roughness: 0.55 });
    this.cache.set(key, mat);
    return mat;
  }

  private create(type: string, color?: string): THREE.MeshStandardMaterial {
    switch (type) {
      case 'rack-frame':
        return new THREE.MeshStandardMaterial({ color: 0x3a4a5c, metalness: 0.7, roughness: 0.45 });
      case 'rail':
        return new THREE.MeshStandardMaterial({ color: 0x2a3545, metalness: 0.85, roughness: 0.3 });
      case 'floor':
        return new THREE.MeshStandardMaterial({ color: 0x111118, metalness: 0.1, roughness: 0.8, transparent: true, opacity: 0.8 });
      case 'blank-panel':
        return new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.5, roughness: 0.6 });
      case 'bay':
        return new THREE.MeshStandardMaterial({ color: 0x080c14, transparent: true, opacity: 0.15, side: THREE.BackSide });
      default: // 'device'
        if (type !== 'device') {
          console.warn(`[MaterialManager] Unknown material type "${type}", using device default`);
        }
        return new THREE.MeshStandardMaterial({
          color: color ? new THREE.Color(color) : new THREE.Color(0x1a3a6a),
          metalness: 0.3,
          roughness: 0.6,
        });
    }
  }

  dispose(): void {
    this.cache.forEach(mat => mat.dispose());
    this.cache.clear();
  }
}
