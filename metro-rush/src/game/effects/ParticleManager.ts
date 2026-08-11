import * as THREE from 'three';

export type ParticlePreset = 'dust' | 'sparkle' | 'impact' | 'speedLine' | 'confetti' | 'smoke';

interface PresetConfig {
  color: THREE.Color;
  size: number;
  gravity: number;
  drag: number;
}

const PRESETS: Record<ParticlePreset, PresetConfig> = {
  dust: { color: new THREE.Color('#cfd8e3'), size: 0.18, gravity: -4, drag: 2.2 },
  sparkle: { color: new THREE.Color('#ffd76a'), size: 0.14, gravity: -1, drag: 1.4 },
  impact: { color: new THREE.Color('#ff6b5b'), size: 0.22, gravity: -6, drag: 1.8 },
  speedLine: { color: new THREE.Color('#7fd8ff'), size: 0.1, gravity: 0, drag: 0.4 },
  confetti: { color: new THREE.Color('#7ee787'), size: 0.16, gravity: -3, drag: 1.2 },
  smoke: { color: new THREE.Color('#9aa5b1'), size: 0.3, gravity: -0.5, drag: 3 },
};

const MAX_PARTICLES = 900;

/**
 * A single pooled GPU-friendly particle system (one draw call) that all
 * gameplay effects share. Particles are stored in typed arrays and
 * recycled via a free-list -- zero per-frame allocations.
 */
export class ParticleManager {
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private gravity: Float32Array;
  private drag: Float32Array;
  private freeList: number[] = [];
  private points: THREE.Points;
  private multiplier: number;

  constructor(scene: THREE.Scene, particleMultiplier = 1) {
    this.multiplier = particleMultiplier;
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.gravity = new Float32Array(MAX_PARTICLES);
    this.drag = new Float32Array(MAX_PARTICLES);

    for (let i = MAX_PARTICLES - 1; i >= 0; i--) this.freeList.push(i);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setDrawRange(0, 0);

    // Plain PointsMaterial only supports a single uniform size for every
    // point, so a custom shader is used to honor each particle's own
    // `size` attribute (world-space diameter, perspective-attenuated).
    const material = new THREE.ShaderMaterial({
      uniforms: {},
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          float alpha = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setParticleMultiplier(m: number): void {
    this.multiplier = m;
  }

  private spawnOne(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    preset: PresetConfig,
    life: number,
    sizeJitter: number,
  ): void {
    const idx = this.freeList.pop();
    if (idx === undefined) return;
    const p3 = idx * 3;
    this.positions[p3] = position.x;
    this.positions[p3 + 1] = position.y;
    this.positions[p3 + 2] = position.z;
    this.velocities[p3] = velocity.x;
    this.velocities[p3 + 1] = velocity.y;
    this.velocities[p3 + 2] = velocity.z;
    this.colors[p3] = preset.color.r;
    this.colors[p3 + 1] = preset.color.g;
    this.colors[p3 + 2] = preset.color.b;
    this.sizes[idx] = preset.size * (1 + (Math.random() - 0.5) * sizeJitter);
    this.life[idx] = life;
    this.maxLife[idx] = life;
    this.gravity[idx] = preset.gravity;
    this.drag[idx] = preset.drag;
  }

  burst(
    presetName: ParticlePreset,
    origin: THREE.Vector3,
    count: number,
    spread = 1.2,
    speed = 2.5,
    life = 0.6,
  ): void {
    const preset = PRESETS[presetName];
    const scaledCount = Math.max(1, Math.round(count * this.multiplier));
    for (let i = 0; i < scaledCount; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.8 + 0.2,
        (Math.random() - 0.5) * spread,
      );
      dir.normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      this.spawnOne(origin, dir, preset, life * (0.7 + Math.random() * 0.6), 0.5);
    }
  }

  update(dt: number): void {
    let maxActive = 0;
    for (let idx = 0; idx < MAX_PARTICLES; idx++) {
      if (this.life[idx] <= 0) continue;
      const p3 = idx * 3;
      this.life[idx] -= dt;
      if (this.life[idx] <= 0) {
        this.life[idx] = 0;
        this.sizes[idx] = 0;
        this.freeList.push(idx);
        continue;
      }
      this.velocities[p3 + 1] += this.gravity[idx] * dt;
      const dragFactor = Math.max(0, 1 - this.drag[idx] * dt);
      this.velocities[p3] *= dragFactor;
      this.velocities[p3 + 2] *= dragFactor;
      this.positions[p3] += this.velocities[p3] * dt;
      this.positions[p3 + 1] += this.velocities[p3 + 1] * dt;
      this.positions[p3 + 2] += this.velocities[p3 + 2] * dt;
      maxActive = idx + 1;
    }
    this.geometry.setDrawRange(0, maxActive);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
