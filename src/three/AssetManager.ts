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
          try {
            if (texture && texture.image) {
              const pmrem = new THREE.PMREMGenerator(renderer);
              pmrem.compileEquirectangularShader();
              const envMap = pmrem.fromEquirectangular(texture).texture;
              scene.environment = envMap; // IBL only — background stays dark
              texture.dispose();
              pmrem.dispose();
              this.hdriTexture = envMap;
            }
          } catch (err) {
            console.warn('[AssetManager] HDRI processing failed, continuing without IBL:', err);
          }
          resolve();
        },
        undefined,
        (err) => {
          console.warn('[AssetManager] HDRI load failed, continuing without IBL:', err);
          resolve(); // non-fatal — lights handle illumination
        }
      );
    });
  }

  dispose(): void {
    this.hdriTexture?.dispose();
    this.hdriTexture = null;
  }
}
