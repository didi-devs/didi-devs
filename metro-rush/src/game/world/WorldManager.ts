import * as THREE from 'three';
import { LANE_WIDTH, SPAWN } from '../config/GameConfig';
import { BiomeKind } from '../types/Types';
import { ObjectPool } from '../utils/ObjectPool';
import { randRange } from '../utils/MathUtils';

interface BiomeStyle {
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  groundColor: THREE.Color;
  railColor: THREE.Color;
  ambient: THREE.Color;
  sunColor: THREE.Color;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
}

const BIOME_ORDER: BiomeKind[] = [
  BiomeKind.CITY_DAY,
  BiomeKind.METRO_STATION,
  BiomeKind.TUNNEL,
  BiomeKind.INDUSTRIAL,
  BiomeKind.BRIDGE,
  BiomeKind.NIGHT_CITY,
];

const BIOME_STYLES: Record<BiomeKind, BiomeStyle> = {
  [BiomeKind.CITY_DAY]: {
    fogColor: new THREE.Color('#bfe3ff'),
    fogNear: 30,
    fogFar: 160,
    groundColor: new THREE.Color('#4a5568'),
    railColor: new THREE.Color('#b8c2cc'),
    ambient: new THREE.Color('#dceeff'),
    sunColor: new THREE.Color('#fff3d6'),
    skyTop: new THREE.Color('#4f9dde'),
    skyBottom: new THREE.Color('#cdeeff'),
  },
  [BiomeKind.METRO_STATION]: {
    fogColor: new THREE.Color('#2b2f3a'),
    fogNear: 20,
    fogFar: 120,
    groundColor: new THREE.Color('#3a3f4d'),
    railColor: new THREE.Color('#ffd35c'),
    ambient: new THREE.Color('#5a6478'),
    sunColor: new THREE.Color('#ffe3a3'),
    skyTop: new THREE.Color('#20232d'),
    skyBottom: new THREE.Color('#3a4256'),
  },
  [BiomeKind.TUNNEL]: {
    fogColor: new THREE.Color('#0c0e14'),
    fogNear: 8,
    fogFar: 70,
    groundColor: new THREE.Color('#22252e'),
    railColor: new THREE.Color('#2ad9ff'),
    ambient: new THREE.Color('#2a3040'),
    sunColor: new THREE.Color('#2ad9ff'),
    skyTop: new THREE.Color('#05060a'),
    skyBottom: new THREE.Color('#0c0e14'),
  },
  [BiomeKind.INDUSTRIAL]: {
    fogColor: new THREE.Color('#463a2f'),
    fogNear: 20,
    fogFar: 130,
    groundColor: new THREE.Color('#524537'),
    railColor: new THREE.Color('#ff8a3d'),
    ambient: new THREE.Color('#a68f6d'),
    sunColor: new THREE.Color('#ffb347'),
    skyTop: new THREE.Color('#8a6a4a'),
    skyBottom: new THREE.Color('#d9b98a'),
  },
  [BiomeKind.BRIDGE]: {
    fogColor: new THREE.Color('#7fb2d9'),
    fogNear: 35,
    fogFar: 180,
    groundColor: new THREE.Color('#3d4652'),
    railColor: new THREE.Color('#e8eef3'),
    ambient: new THREE.Color('#cfe6f7'),
    sunColor: new THREE.Color('#ffffff'),
    skyTop: new THREE.Color('#2f6fa8'),
    skyBottom: new THREE.Color('#a9d7f0'),
  },
  [BiomeKind.NIGHT_CITY]: {
    fogColor: new THREE.Color('#0a0e1f'),
    fogNear: 15,
    fogFar: 140,
    groundColor: new THREE.Color('#20232f'),
    railColor: new THREE.Color('#ff5cf0'),
    ambient: new THREE.Color('#2a2a55'),
    sunColor: new THREE.Color('#7fa8ff'),
    skyTop: new THREE.Color('#05060f'),
    skyBottom: new THREE.Color('#181a3a'),
  },
};

const BIOME_SEGMENT_LENGTH = 500; // meters of distance per biome

interface GroundTile {
  mesh: THREE.Object3D;
  worldZ: number;
}

interface SceneryItem {
  mesh: THREE.Object3D;
  worldZ: number;
  lane: number;
}

/**
 * Owns ground tiles, side scenery, sky, fog and lighting. World geometry
 * scrolls toward the camera by re-projecting each object's stored
 * `worldZ` against distance traveled -- the player transform never
 * moves along Z, avoiding float precision issues on long runs.
 */
export class WorldManager {
  private scene: THREE.Scene;
  private groundPool: ObjectPool<THREE.Object3D>;
  private groundTiles: GroundTile[] = [];
  private lampPool: ObjectPool<THREE.Object3D>;
  private pillarPool: ObjectPool<THREE.Object3D>;
  private buildingPool: ObjectPool<THREE.Object3D>;
  private scenery: SceneryItem[] = [];
  private nextGroundZ = 0;
  private nextSceneryZ = 0;

  readonly ambientLight: THREE.HemisphereLight;
  readonly sunLight: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private skyMaterial: THREE.ShaderMaterial;
  private currentStyle: BiomeStyle = BIOME_STYLES[BiomeKind.CITY_DAY];
  private targetStyle: BiomeStyle = BIOME_STYLES[BiomeKind.CITY_DAY];
  private blend = 1;
  private railGlowMat: THREE.MeshStandardMaterial;
  private shadowsEnabled: boolean;

  constructor(scene: THREE.Scene, shadowsEnabled: boolean) {
    this.scene = scene;
    this.shadowsEnabled = shadowsEnabled;

    this.ambientLight = new THREE.HemisphereLight(0xdceeff, 0x33291f, 0.7);
    scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff3d6, 1.0);
    this.sunLight.position.set(-8, 16, 10);
    this.sunLight.castShadow = shadowsEnabled;
    if (shadowsEnabled) {
      this.sunLight.shadow.mapSize.set(1024, 1024);
      this.sunLight.shadow.camera.left = -10;
      this.sunLight.shadow.camera.right = 10;
      this.sunLight.shadow.camera.top = 14;
      this.sunLight.shadow.camera.bottom = -4;
      this.sunLight.shadow.camera.far = 40;
      this.sunLight.shadow.bias = -0.002;
    }
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Simple vertical-gradient sky dome via shader material.
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: this.currentStyle.skyTop.clone() },
        bottomColor: { value: this.currentStyle.skyBottom.clone() },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        void main() {
          float h = normalize(vWorldPosition).y * 0.5 + 0.5;
          gl_FragColor = vec4(mix(bottomColor, topColor, clamp(h, 0.0, 1.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 16, 12), this.skyMaterial);
    scene.add(this.sky);

    scene.fog = new THREE.Fog(this.currentStyle.fogColor.getHex(), this.currentStyle.fogNear, this.currentStyle.fogFar);

    const groundGeo = new THREE.BoxGeometry(LANE_WIDTH * 3 + 1.4, 0.4, SPAWN.CHUNK_LENGTH);
    const groundMat = new THREE.MeshStandardMaterial({ color: this.currentStyle.groundColor.clone(), roughness: 0.9 });
    this.railGlowMat = new THREE.MeshStandardMaterial({
      color: this.currentStyle.railColor.clone(),
      emissive: this.currentStyle.railColor.clone(),
      emissiveIntensity: 0.5,
      roughness: 0.4,
    });

    this.groundPool = new ObjectPool<THREE.Object3D>(
      () => {
        const group = new THREE.Group();
        const base = new THREE.Mesh(groundGeo, groundMat);
        base.position.y = -0.2;
        base.receiveShadow = shadowsEnabled;
        group.add(base);
        for (let i = -1; i <= 1; i++) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, SPAWN.CHUNK_LENGTH), this.railGlowMat);
          rail.position.set(i * LANE_WIDTH, 0.02, 0);
          group.add(rail);
        }
        group.visible = false;
        scene.add(group);
        return group;
      },
      (mesh) => {
        mesh.visible = false;
      },
      Math.ceil(SPAWN.SPAWN_DISTANCE / SPAWN.CHUNK_LENGTH) + 3,
    );

    this.lampPool = new ObjectPool<THREE.Object3D>(
      () => {
        const o = this.buildLamp();
        scene.add(o);
        return o;
      },
      (o) => (o.visible = false),
      6,
    );
    this.pillarPool = new ObjectPool<THREE.Object3D>(
      () => {
        const o = this.buildPillar();
        scene.add(o);
        return o;
      },
      (o) => (o.visible = false),
      8,
    );
    this.buildingPool = new ObjectPool<THREE.Object3D>(
      () => {
        const o = this.buildBuilding();
        scene.add(o);
        return o;
      },
      (o) => (o.visible = false),
      10,
    );
  }

  private buildLamp(): THREE.Object3D {
    const g = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), poleMat);
    pole.position.y = 1.6;
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xfff2c8, emissiveIntensity: 1.2 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bulbMat);
    bulb.position.y = 3.2;
    g.add(pole, bulb);
    g.visible = false;
    return g;
  }

  private buildPillar(): THREE.Object3D {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a6270, roughness: 0.8 });
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6, 0.7), mat);
    pillar.position.y = 3;
    pillar.castShadow = this.shadowsEnabled;
    pillar.visible = false;
    return pillar;
  }

  private buildBuilding(): THREE.Object3D {
    const g = new THREE.Group();
    const height = randRange(5, 11);
    const width = randRange(3, 6);
    const depth = randRange(3, 6);
    const hue = randRange(0.55, 0.62);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.18, randRange(0.35, 0.55)),
      roughness: 0.85,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    body.position.y = height / 2;
    g.add(body);
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0xffe9a8,
      emissive: 0xffe9a8,
      emissiveIntensity: 0.5,
    });
    const rows = Math.max(2, Math.floor(height / 2));
    for (let r = 0; r < rows; r++) {
      if (Math.random() > 0.5) continue;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.6, 0.6), windowMat);
      w.position.set(0, 1 + r * 2, depth / 2 + 0.01);
      g.add(w);
    }
    g.visible = false;
    return g;
  }

  reset(): void {
    for (const t of this.groundTiles) this.groundPool.release(t.mesh);
    this.groundTiles = [];
    for (const s of this.scenery) this.releaseScenery(s);
    this.scenery = [];
    this.nextGroundZ = 0;
    this.nextSceneryZ = 0;
    this.blend = 1;
    this.currentStyle = BIOME_STYLES[BiomeKind.CITY_DAY];
    this.targetStyle = BIOME_STYLES[BiomeKind.CITY_DAY];
    this.applyStyleImmediate(this.currentStyle);
  }

  private releaseScenery(item: SceneryItem): void {
    const type = (item.mesh.userData as any).sceneryType as 'lamp' | 'pillar' | 'building';
    if (type === 'lamp') this.lampPool.release(item.mesh);
    else if (type === 'pillar') this.pillarPool.release(item.mesh);
    else this.buildingPool.release(item.mesh);
  }

  getBiomeForDistance(distance: number): BiomeKind {
    const idx = Math.floor(distance / BIOME_SEGMENT_LENGTH) % BIOME_ORDER.length;
    return BIOME_ORDER[idx];
  }

  private applyStyleImmediate(style: BiomeStyle): void {
    this.ambientLight.color.copy(style.ambient);
    this.sunLight.color.copy(style.sunColor);
    (this.scene.fog as THREE.Fog).color.copy(style.fogColor);
    (this.scene.fog as THREE.Fog).near = style.fogNear;
    (this.scene.fog as THREE.Fog).far = style.fogFar;
    this.skyMaterial.uniforms.topColor.value.copy(style.skyTop);
    this.skyMaterial.uniforms.bottomColor.value.copy(style.skyBottom);
    this.railGlowMat.color.copy(style.railColor);
    this.railGlowMat.emissive.copy(style.railColor);
  }

  update(dt: number, distanceTraveled: number, playerX: number): void {
    // --- ground scrolling / spawning ---
    while (this.nextGroundZ - distanceTraveled < SPAWN.SPAWN_DISTANCE) {
      const mesh = this.groundPool.acquire();
      mesh.visible = true;
      mesh.position.set(0, 0, this.nextGroundZ + SPAWN.CHUNK_LENGTH / 2);
      this.groundTiles.push({ mesh, worldZ: this.nextGroundZ });
      this.nextGroundZ += SPAWN.CHUNK_LENGTH;
    }
    for (let i = this.groundTiles.length - 1; i >= 0; i--) {
      const t = this.groundTiles[i];
      const z = t.worldZ - distanceTraveled + SPAWN.CHUNK_LENGTH / 2;
      t.mesh.position.z = z;
      if (z < -SPAWN.DESPAWN_DISTANCE - SPAWN.CHUNK_LENGTH) {
        this.groundPool.release(t.mesh);
        this.groundTiles.splice(i, 1);
      }
    }

    // --- scenery spawning ---
    while (this.nextSceneryZ - distanceTraveled < SPAWN.SPAWN_DISTANCE) {
      this.spawnSceneryRow(this.nextSceneryZ);
      this.nextSceneryZ += randRange(13, 20);
    }
    for (let i = this.scenery.length - 1; i >= 0; i--) {
      const s = this.scenery[i];
      const z = s.worldZ - distanceTraveled;
      s.mesh.position.z = z;
      if (z < -SPAWN.DESPAWN_DISTANCE) {
        this.releaseScenery(s);
        this.scenery.splice(i, 1);
      }
    }

    // --- biome blend ---
    const biome = this.getBiomeForDistance(distanceTraveled);
    const style = BIOME_STYLES[biome];
    if (style !== this.targetStyle) {
      this.currentStyle = this.blendedStyle();
      this.targetStyle = style;
      this.blend = 0;
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 2.5);
      const blended = this.lerpStyle(this.currentStyle, this.targetStyle, this.blend);
      this.applyStyleImmediate(blended);
    }

    // Parallax: sky follows camera loosely so it never appears to clip.
    this.sky.position.set(0, 0, -distanceTraveled * 0);
    this.sunLight.target.position.set(playerX, 0, 0);
  }

  private blendedStyle(): BiomeStyle {
    return {
      fogColor: (this.scene.fog as THREE.Fog).color.clone(),
      fogNear: (this.scene.fog as THREE.Fog).near,
      fogFar: (this.scene.fog as THREE.Fog).far,
      groundColor: this.currentStyle.groundColor.clone(),
      railColor: this.railGlowMat.color.clone(),
      ambient: this.ambientLight.color.clone(),
      sunColor: this.sunLight.color.clone(),
      skyTop: this.skyMaterial.uniforms.topColor.value.clone(),
      skyBottom: this.skyMaterial.uniforms.bottomColor.value.clone(),
    };
  }

  private lerpStyle(a: BiomeStyle, b: BiomeStyle, t: number): BiomeStyle {
    const c = (x: THREE.Color, y: THREE.Color) => x.clone().lerp(y, t);
    return {
      fogColor: c(a.fogColor, b.fogColor),
      fogNear: a.fogNear + (b.fogNear - a.fogNear) * t,
      fogFar: a.fogFar + (b.fogFar - a.fogFar) * t,
      groundColor: c(a.groundColor, b.groundColor),
      railColor: c(a.railColor, b.railColor),
      ambient: c(a.ambient, b.ambient),
      sunColor: c(a.sunColor, b.sunColor),
      skyTop: c(a.skyTop, b.skyTop),
      skyBottom: c(a.skyBottom, b.skyBottom),
    };
  }

  private spawnSceneryRow(z: number): void {
    const side = Math.random() > 0.5 ? 1 : -1;
    const roll = Math.random();
    let mesh: THREE.Object3D;
    let type: 'lamp' | 'pillar' | 'building';
    let x: number;
    if (roll < 0.4) {
      mesh = this.lampPool.acquire();
      type = 'lamp';
      x = side * (LANE_WIDTH * 1.6 + 0.6);
    } else if (roll < 0.7) {
      mesh = this.pillarPool.acquire();
      type = 'pillar';
      x = side * (LANE_WIDTH * 1.6 + 0.4);
    } else {
      mesh = this.buildingPool.acquire();
      type = 'building';
      x = side * (LANE_WIDTH * 1.6 + randRange(9, 20));
    }
    mesh.userData.sceneryType = type;
    mesh.visible = true;
    mesh.position.set(x, 0, z);
    this.scenery.push({ mesh, worldZ: z, lane: side });
  }

  get activeGroundTileCount(): number {
    return this.groundTiles.length;
  }

  get activeSceneryCount(): number {
    return this.scenery.length;
  }
}
