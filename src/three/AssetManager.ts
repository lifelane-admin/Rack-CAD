import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export class AssetManager {
  private loadingManager = new THREE.LoadingManager();
  private hdriTexture: THREE.Texture | null = null;

  async loadAll(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Promise<void> {
    await this.loadHDRI(renderer, scene);
  }

  private loadHDRI(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Promise<void> {
    return new Promise((resolve) => {
      const loader = new EXRLoader(this.loadingManager);
      loader.load(
        '/hdri/datacenter.exr',
        (texture) => {
          const pmrem = new THREE.PMREMGenerator(renderer);
          pmrem.compileEquirectangularShader();
          const envMap = pmrem.fromEquirectangular(texture).texture;
          scene.environment = envMap;
          scene.background = envMap;
          texture.dispose();
          pmrem.dispose();
          this.hdriTexture = envMap;
          resolve();
        },
        undefined,
        (err) => {
          console.warn('[AssetManager] HDRI load failed, using fallback colour background:', err);
          scene.background = new THREE.Color(0x060c18);
          resolve(); // non-fatal — scene still renders without HDRI
        }
      );
    });
  }

  dispose(): void {
    this.hdriTexture?.dispose();
    this.hdriTexture = null;
  }
}
