import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type CameraPreset = 'front' | 'rear' | 'left' | 'right' | 'top' | 'perspective';

// Spherical offsets (distance, azimuth, polar) per preset, relative to orbit target.
// All presets use the same distance (2800 units) — Phase 3.3 will add FOV/distance variation.
const PRESET_OFFSETS: Record<CameraPreset, { dist: number; az: number; polar: number }> = {
  front:       { dist: 2800, az: 0,             polar: Math.PI / 2 },
  rear:        { dist: 2800, az: Math.PI,        polar: Math.PI / 2 },
  left:        { dist: 2800, az: -Math.PI / 2,   polar: Math.PI / 2 },
  right:       { dist: 2800, az:  Math.PI / 2,   polar: Math.PI / 2 },
  top:         { dist: 2800, az: 0,             polar: 0.01 },
  perspective: { dist: 2800, az: -Math.PI / 4,   polar: Math.PI / 3 },
};

const TRANSITION_MS = 400;

export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private animFrame: number | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.camera = new THREE.PerspectiveCamera(60, 1, 5, 20000);
    this.camera.position.set(1200, 1200, 2800);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this.controls.target.set(700, 700, 0);
    this.controls.update();
  }

  update(): void {
    this.controls.update();
  }

  setTarget(x: number, y: number, z: number): void {
    this.controls.target.set(x, y, z);
    this.controls.update();
  }

  setPreset(preset: CameraPreset): void {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);

    const { dist, az, polar } = PRESET_OFFSETS[preset];
    const target = this.controls.target;

    const destX = target.x + dist * Math.sin(polar) * Math.sin(az);
    const destY = target.y + dist * Math.cos(polar);
    const destZ = target.z + dist * Math.sin(polar) * Math.cos(az);

    const startPos = this.camera.position.clone();
    const startTime = performance.now();

    const animate = () => {
      const t = Math.min((performance.now() - startTime) / TRANSITION_MS, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out quad

      this.camera.position.set(
        startPos.x + (destX - startPos.x) * eased,
        startPos.y + (destY - startPos.y) * eased,
        startPos.z + (destZ - startPos.z) * eased,
      );
      this.controls.update();

      if (t < 1) {
        this.animFrame = requestAnimationFrame(animate);
      } else {
        this.animFrame = null;
      }
    };

    this.animFrame = requestAnimationFrame(animate);
  }

  zoomBy(factor: number): void {
    const dir = this.camera.position.clone().sub(this.controls.target);
    dir.multiplyScalar(factor);
    this.camera.position.copy(this.controls.target).add(dir);
    this.controls.update();
  }

  setPanMode(pan: boolean): void {
    this.controls.mouseButtons = pan
      ? { LEFT: THREE.MOUSE.PAN,    MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN    };
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    this.controls.dispose();
  }
}
