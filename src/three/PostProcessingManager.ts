import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class PostProcessingManager {
  private composer: EffectComposer;
  private ssaoPass: SSAOPass;
  private ssrPass: SSRPass;
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

    // Pass 2: SSAO — ambient occlusion (contact shadows between rack parts and devices)
    this.ssaoPass = new SSAOPass(scene, camera, width, height);
    this.ssaoPass.kernelRadius = 0.5;
    this.ssaoPass.minDistance = 0.001;
    this.ssaoPass.maxDistance = 0.1;
    this.composer.addPass(this.ssaoPass);

    // Pass 3: SSR — screen-space reflections (primarily on the floor plane)
    this.ssrPass = new SSRPass({ renderer, scene, camera, width, height, groundReflector: null, selects: null } as any);
    this.ssrPass.thickness = 0.018;
    this.ssrPass.maxDistance = 0.1;
    this.ssrPass.opacity = 0.35;
    this.composer.addPass(this.ssrPass);

    // Pass 4: Bloom — LED glow, highlighted edges
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.4, 0.3, 0.85);
    this.composer.addPass(this.bloomPass);

    // Pass 5: OutputPass — ACES tone mapping output + gamma
    this.composer.addPass(new OutputPass());
  }

  render(): void {
    this.composer.render();
  }

  onResize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.ssaoPass.setSize(width, height);
    this.ssrPass.resolution = new THREE.Vector2(width, height);
    this.bloomPass.resolution = new THREE.Vector2(width, height);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
