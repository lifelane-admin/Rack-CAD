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

    const mat = new THREE.MeshStandardMaterial({
      metalness: 0.35,
      roughness: 0.40,
    });

    const loader = new THREE.TextureLoader();
    loader.load(imageDataUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 16;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      mat.map = texture;

      // Generate 3D surface depth bump map from custom panel image
      try {
        const img = texture.image;
        if (img && img.width > 0 && img.height > 0) {
          const bumpCanvas = document.createElement('canvas');
          bumpCanvas.width = img.width;
          bumpCanvas.height = img.height;
          const bCtx = bumpCanvas.getContext('2d');
          if (bCtx) {
            bCtx.drawImage(img, 0, 0);
            const imgData = bCtx.getImageData(0, 0, img.width, img.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
              // Invert so dark port cavities recess and light bezels/screws/logos raise in 3D relief
              const bumpVal = Math.min(255, Math.max(0, 255 - lum * 0.85));
              data[i] = bumpVal;
              data[i + 1] = bumpVal;
              data[i + 2] = bumpVal;
            }
            bCtx.putImageData(imgData, 0, 0);
            const bumpTex = new THREE.CanvasTexture(bumpCanvas);
            bumpTex.anisotropy = 16;
            bumpTex.generateMipmaps = true;
            bumpTex.minFilter = THREE.LinearMipmapLinearFilter;
            mat.bumpMap = bumpTex;
            mat.bumpScale = 0.8;
          }
        }
      } catch {
        // Fallback if cross-origin image restricts pixel reading
      }

      mat.needsUpdate = true;
    });

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
