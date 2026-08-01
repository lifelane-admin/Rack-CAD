import * as THREE from 'three';

export class MaterialManager {
  private cache = new Map<string, THREE.MeshStandardMaterial>();

  get(type: string, color?: string): THREE.MeshStandardMaterial {
    const key = color ? `device:${color}` : type;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const mat = this.create(type, color);
    this.cache.set(key, mat);
    return mat;
  }

  private create(type: string, color?: string): THREE.MeshStandardMaterial {
    switch (type) {
      case 'rack-frame':
        return new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.8, roughness: 0.4 });
      case 'rail':
        return new THREE.MeshStandardMaterial({ color: 0x0d1520, metalness: 0.9, roughness: 0.3 });
      case 'floor':
        return new THREE.MeshStandardMaterial({ color: 0x111118, metalness: 0.1, roughness: 0.8, transparent: true, opacity: 0.8 });
      case 'blank-panel':
        return new THREE.MeshStandardMaterial({ color: 0x0d1018, metalness: 0.5, roughness: 0.7 });
      default: // 'device'
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
