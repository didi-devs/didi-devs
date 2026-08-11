import * as THREE from 'three';

export interface PlayerLimbs {
  root: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  visor: THREE.Mesh;
  trailAnchor: THREE.Object3D;
}

export interface CosmeticPalette {
  jacket: number;
  jacketAccent: number;
  visor: number;
  shoes: number;
}

export const COSMETIC_PALETTES: Record<string, CosmeticPalette> = {
  default: { jacket: 0xff5c5c, jacketAccent: 0x2ad9ff, visor: 0x2ad9ff, shoes: 0x1c1f26 },
  neon: { jacket: 0x8b5cf6, jacketAccent: 0x22ffb0, visor: 0x22ffb0, shoes: 0x1c1f26 },
  sunset: { jacket: 0xff9d3d, jacketAccent: 0xff4d97, visor: 0xff4d97, shoes: 0x1c1f26 },
  arctic: { jacket: 0x4dd4ff, jacketAccent: 0xffffff, visor: 0xffffff, shoes: 0x1c1f26 },
};

/**
 * Builds an original stylized low-poly street-runner from primitives.
 * Kept as a discrete builder function so a GLTF character can later be
 * swapped in without touching PlayerController -- it only needs an
 * object exposing the same limb groups for animation.
 */
export function buildPlayerModel(paletteId = 'default'): PlayerLimbs {
  const palette = COSMETIC_PALETTES[paletteId] ?? COSMETIC_PALETTES.default;
  const root = new THREE.Group();
  root.name = 'PlayerModel';

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcfa8, roughness: 0.7 });
  const jacketMat = new THREE.MeshStandardMaterial({ color: palette.jacket, roughness: 0.55, metalness: 0.05 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: palette.jacketAccent,
    roughness: 0.3,
    metalness: 0.2,
    emissive: new THREE.Color(palette.jacketAccent).multiplyScalar(0.35),
  });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.8 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: palette.shoes, roughness: 0.6 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: palette.visor,
    emissive: new THREE.Color(palette.visor).multiplyScalar(0.6),
    roughness: 0.2,
    metalness: 0.3,
  });

  // Hips pivot -- everything else attaches here for easy squash/stretch.
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);

  const torsoGeo = new THREE.CapsuleGeometry(0.26, 0.42, 4, 8);
  const torso = new THREE.Mesh(torsoGeo, jacketMat);
  torso.position.y = 0.42;
  torso.castShadow = true;
  hips.add(torso);

  const chestStripeGeo = new THREE.BoxGeometry(0.32, 0.1, 0.06);
  const chestStripe = new THREE.Mesh(chestStripeGeo, accentMat);
  chestStripe.position.set(0, 0.5, 0.24);
  hips.add(chestStripe);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.86;
  hips.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.19, 12, 10);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.castShadow = true;
  headGroup.add(head);

  const visorGeo = new THREE.BoxGeometry(0.3, 0.09, 0.08);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 0.02, 0.15);
  headGroup.add(visor);

  const hoodGeo = new THREE.SphereGeometry(0.21, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const hood = new THREE.Mesh(hoodGeo, jacketMat);
  hood.position.y = 0.05;
  hood.rotation.x = Math.PI;
  headGroup.add(hood);

  function buildArm(side: 1 | -1): THREE.Group {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.32 * side, 0.62, 0);
    const upperGeo = new THREE.CapsuleGeometry(0.075, 0.26, 4, 6);
    const upper = new THREE.Mesh(upperGeo, jacketMat);
    upper.position.y = -0.16;
    upper.castShadow = true;
    shoulder.add(upper);

    const foreArmGroup = new THREE.Group();
    foreArmGroup.position.y = -0.3;
    const foreGeo = new THREE.CapsuleGeometry(0.06, 0.24, 4, 6);
    const fore = new THREE.Mesh(foreGeo, skinMat);
    fore.position.y = -0.14;
    fore.castShadow = true;
    foreArmGroup.add(fore);
    shoulder.add(foreArmGroup);

    return shoulder;
  }

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  hips.add(leftArm, rightArm);

  function buildLeg(side: 1 | -1): THREE.Group {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(0.12 * side, 0.05, 0);
    const thighGeo = new THREE.CapsuleGeometry(0.1, 0.3, 4, 6);
    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.y = -0.18;
    thigh.castShadow = true;
    hipJoint.add(thigh);

    const shinGroup = new THREE.Group();
    shinGroup.position.y = -0.34;
    const shinGeo = new THREE.CapsuleGeometry(0.085, 0.28, 4, 6);
    const shin = new THREE.Mesh(shinGeo, pantsMat);
    shin.position.y = -0.16;
    shin.castShadow = true;
    shinGroup.add(shin);

    const shoeGeo = new THREE.BoxGeometry(0.15, 0.09, 0.26);
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.34, 0.05);
    shoe.castShadow = true;
    shinGroup.add(shoe);

    const shoeAccentGeo = new THREE.BoxGeometry(0.16, 0.03, 0.08);
    const shoeAccent = new THREE.Mesh(shoeAccentGeo, accentMat);
    shoeAccent.position.set(0, -0.3, 0.14);
    shinGroup.add(shoeAccent);

    hipJoint.add(shinGroup);
    return hipJoint;
  }

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  hips.add(leftLeg, rightLeg);

  const trailAnchor = new THREE.Object3D();
  trailAnchor.position.set(0, -0.3, -0.3);
  hips.add(trailAnchor);

  return { root, torso, head, leftArm, rightArm, leftLeg, rightLeg, visor, trailAnchor };
}
