import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class PostProcessingManager {
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = new EffectComposer(renderer);

    // Pass 1: base scene render
    this.composer.addPass(new RenderPass(scene, camera));

    // Pass 2: Bloom — threshold 1.3 ensures only emissive LEDs/displays bloom, never diffuse white/ivory racks
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.15, 0.3, 1.3);
    this.composer.addPass(this.bloomPass);

    // Pass 3: OutputPass — ACES tone mapping output + gamma
    this.composer.addPass(new OutputPass());
  }

  render(): void {
    this.composer.render();
  }

  onResize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
