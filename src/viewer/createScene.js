import * as THREE from 'three';

/**
 * NAMMA SPACE — Core Three.js Scene Factory & Procedural Baseline Builder
 *
 * Strictly separates:
 * 1. Core WebGL stage setup (Scene, Camera, Renderer, Lighting, Disposal).
 * 2. Demo procedural geometry (`buildProceduralDemoRoom`) used ONLY in `mode: 'demo'`.
 * 3. Spatial overlays (POI 3D beacons & Obstacle-aware A* path ribbons).
 */

export function createThreeStage(container) {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x131d17);
  scene.fog = new THREE.FogExp2(0x131d17, 0.032);

  const camera = new THREE.PerspectiveCamera(68, width / height, 0.1, 80);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  // Sensible pixel-ratio limit for crisp visuals without GPU overdraw on 3x/4x screens
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  // Clear any stale canvas and mount
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.appendChild(renderer.domElement);

  // Balanced architectural interior lighting
  const lightingGroup = new THREE.Group();
  lightingGroup.name = 'StageLighting';

  const hemiLight = new THREE.HemisphereLight(0xf6f4ef, 0x26352c, 0.95);
  hemiLight.position.set(0, 3.1, 0);
  lightingGroup.add(hemiLight);

  const mainSunLight = new THREE.DirectionalLight(0xfff7e8, 1.35);
  mainSunLight.position.set(3.2, 5.4, 2.6);
  mainSunLight.castShadow = true;
  mainSunLight.shadow.mapSize.width = 1024;
  mainSunLight.shadow.mapSize.height = 1024;
  mainSunLight.shadow.camera.near = 0.5;
  mainSunLight.shadow.camera.far = 16;
  const d = 6.5;
  mainSunLight.shadow.camera.left = -d;
  mainSunLight.shadow.camera.right = d;
  mainSunLight.shadow.camera.top = d;
  mainSunLight.shadow.camera.bottom = -d;
  mainSunLight.shadow.bias = -0.0005;
  lightingGroup.add(mainSunLight);

  const warmFillLight = new THREE.PointLight(0xffdfba, 0.85, 9, 1.6);
  warmFillLight.position.set(-2.3, 2.5, -1.6);
  lightingGroup.add(warmFillLight);

  const loungeFillLight = new THREE.PointLight(0xd9ebd9, 0.65, 8, 1.6);
  loungeFillLight.position.set(2.4, 2.5, -1.8);
  lightingGroup.add(loungeFillLight);

  scene.add(lightingGroup);

  const handleResize = () => {
    if (!container) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  return {
    scene,
    camera,
    renderer,
    handleResize
  };
}

/**
 * Builds the procedural architectural baseline room (ONLY used when sceneConfig.mode === 'demo').
 * Includes:
 * - Warm timber/stone floor with subtle metric grid
 * - Perimeter architectural walls with forest-green accent wall & daylight window frame
 * - Collaborative oak table + chairs (-2.3, 0, -1.6)
 * - L-shaped modular forest sofa + coffee table (2.4, 0, -1.8)
 * - Full-height storage cabinet / credenza (-4.45, 0, 1.45)
 * - Central spatial calibration plinth (0, 0, 0)
 * - East telemetry console (4.5, 0, 1.7)
 */
export function buildProceduralDemoRoom() {
  const root = new THREE.Group();
  root.name = 'ProceduralDemoRoom';

  // Shared materials palette matching Namma Space brand direction
  const matFloor = new THREE.MeshStandardMaterial({
    color: 0xd8d1c5,
    roughness: 0.78,
    metalness: 0.04
  });
  const matWallIvory = new THREE.MeshStandardMaterial({
    color: 0xf1eee7,
    roughness: 0.88,
    metalness: 0.02
  });
  const matWallForest = new THREE.MeshStandardMaterial({
    color: 0x183023,
    roughness: 0.82,
    metalness: 0.05
  });
  const matOakWood = new THREE.MeshStandardMaterial({
    color: 0x9b724b,
    roughness: 0.55,
    metalness: 0.06
  });
  const matWalnutDark = new THREE.MeshStandardMaterial({
    color: 0x4a3525,
    roughness: 0.5,
    metalness: 0.08
  });
  const matSofaSage = new THREE.MeshStandardMaterial({
    color: 0x3b5947,
    roughness: 0.85,
    metalness: 0.02
  });
  const matCushionIvory = new THREE.MeshStandardMaterial({
    color: 0xe8e3d9,
    roughness: 0.9
  });
  const matCharcoalMetal = new THREE.MeshStandardMaterial({
    color: 0x222725,
    roughness: 0.35,
    metalness: 0.72
  });
  const matBrassAccent = new THREE.MeshStandardMaterial({
    color: 0xc8964e,
    roughness: 0.3,
    metalness: 0.8
  });
  const matRug = new THREE.MeshStandardMaterial({
    color: 0xc6bfb2,
    roughness: 0.95
  });

  // 1. Floor (10m x 8m) + subtle metric spatial grid
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), matFloor);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  root.add(floorMesh);

  const gridHelper = new THREE.GridHelper(10, 20, 0x7e9485, 0xbab3a6);
  gridHelper.position.y = 0.004;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.35;
  root.add(gridHelper);

  // Subtle ceiling frame beams (open top for airy lighting, perimeter soffit)
  const wallHeight = 3.2;
  const wallThickness = 0.2;

  // North Wall (Deep Forest Green feature wall, z = -4.0)
  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(10.2, wallHeight, wallThickness),
    matWallForest
  );
  northWall.position.set(0, wallHeight / 2, -4.0);
  northWall.receiveShadow = true;
  root.add(northWall);

  // South Wall (Warm Ivory, z = +4.0)
  const southWall = new THREE.Mesh(
    new THREE.BoxGeometry(10.2, wallHeight, wallThickness),
    matWallIvory
  );
  southWall.position.set(0, wallHeight / 2, 4.0);
  southWall.receiveShadow = true;
  root.add(southWall);

  // West Wall (x = -5.0)
  const westWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, 8.0),
    matWallIvory
  );
  westWall.position.set(-5.0, wallHeight / 2, 0);
  westWall.receiveShadow = true;
  root.add(westWall);

  // East Wall (x = +5.0)
  const eastWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, 8.0),
    matWallIvory
  );
  eastWall.position.set(5.0, wallHeight / 2, 0);
  eastWall.receiveShadow = true;
  root.add(eastWall);

  // Baseboard trim around perimeter
  const baseboardMat = matCharcoalMetal;
  const baseN = new THREE.Mesh(new THREE.BoxGeometry(10, 0.08, 0.04), baseboardMat);
  baseN.position.set(0, 0.04, -3.89);
  const baseS = new THREE.Mesh(new THREE.BoxGeometry(10, 0.08, 0.04), baseboardMat);
  baseS.position.set(0, 0.04, 3.89);
  const baseW = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 8), baseboardMat);
  baseW.position.set(-4.89, 0.04, 0);
  const baseE = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 8), baseboardMat);
  baseE.position.set(4.89, 0.04, 0);
  root.add(baseN, baseS, baseW, baseE);

  // Architectural daylight window panel on North wall
  const windowFrame = new THREE.Group();
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xe6f2ec });
  const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.5), glassMat);
  glassPane.position.set(0, 1.85, -3.88);
  windowFrame.add(glassPane);
  root.add(windowFrame);

  // 2. Collaborative Work & Dining Table (Northwest quadrant: x = -2.7, z = -1.6)
  const tableGroup = new THREE.Group();
  tableGroup.position.set(-2.7, 0, -1.6);

  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 1.2), matOakWood);
  tableTop.position.y = 0.76;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  tableGroup.add(tableTop);

  const legOffsets = [
    [-0.92, -0.48],
    [0.92, -0.48],
    [-0.92, 0.48],
    [0.92, 0.48]
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.025, 0.74, 12),
      matCharcoalMetal
    );
    leg.position.set(lx, 0.37, lz);
    leg.castShadow = true;
    tableGroup.add(leg);
  }

  // Minimalist studio chairs tucked around table
  const chairZOffsets = [-0.62, 0.62];
  const chairXOffsets = [-0.5, 0.5];
  for (const cz of chairZOffsets) {
    for (const cx of chairXOffsets) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.44), matWalnutDark);
      seat.position.set(cx, 0.45, cz);
      seat.castShadow = true;
      tableGroup.add(seat);
    }
  }

  // Laptop / spatial tablet prop on work table
  const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.015, 0.25), matCharcoalMetal);
  laptopBase.position.set(-0.3, 0.8, 0.1);
  tableGroup.add(laptopBase);

  root.add(tableGroup);

  // 3. Modular L-Shaped Lounge Sofa & Coffee Table (Northeast quadrant)
  const loungeGroup = new THREE.Group();

  // Area rug under lounge
  const rug = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.015, 2.8), matRug);
  rug.position.set(2.4, 0.008, -1.55);
  rug.receiveShadow = true;
  loungeGroup.add(rug);

  // Main sofa bench (x: 1.25 to 3.75, z: -2.65 to -1.75)
  const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.42, 0.9), matSofaSage);
  sofaBase.position.set(2.5, 0.21, -2.2);
  sofaBase.castShadow = true;
  sofaBase.receiveShadow = true;
  loungeGroup.add(sofaBase);

  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.46, 0.22), matSofaSage);
  sofaBack.position.set(2.5, 0.65, -2.54);
  sofaBack.castShadow = true;
  loungeGroup.add(sofaBack);

  const sofaArmLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.9), matSofaSage);
  sofaArmLeft.position.set(1.34, 0.52, -2.2);
  sofaArmLeft.castShadow = true;
  loungeGroup.add(sofaArmLeft);

  // Chaise section (x: 2.95 to 3.75, z: -1.75 to -0.55)
  const sofaChaise = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.42, 1.2), matSofaSage);
  sofaChaise.position.set(3.35, 0.21, -1.15);
  sofaChaise.castShadow = true;
  sofaChaise.receiveShadow = true;
  loungeGroup.add(sofaChaise);

  // Accent cushions
  const cushion1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.14), matCushionIvory);
  cushion1.position.set(1.75, 0.56, -2.35);
  cushion1.rotation.x = 0.15;
  const cushion2 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.14), matCushionIvory);
  cushion2.position.set(3.25, 0.56, -2.35);
  cushion2.rotation.x = 0.15;
  loungeGroup.add(cushion1, cushion2);

  // Coffee Table (x: 1.55 to 2.45, z: -1.05 to -0.55)
  const coffeeTable = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.38, 0.52), matOakWood);
  coffeeTable.position.set(2.0, 0.19, -0.8);
  coffeeTable.castShadow = true;
  coffeeTable.receiveShadow = true;
  loungeGroup.add(coffeeTable);

  root.add(loungeGroup);

  // 4. West Wall Storage Cabinet / Credenza (x: -4.85 to -4.15, z: 0.35 to 2.55)
  const cabinetGroup = new THREE.Group();
  const cabinetBody = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.88, 2.2), matWalnutDark);
  cabinetBody.position.set(-4.48, 0.94, 1.45);
  cabinetBody.castShadow = true;
  cabinetBody.receiveShadow = true;
  cabinetGroup.add(cabinetBody);

  // Brass handles on cabinet doors
  for (const hz of [0.85, 1.25, 1.65, 2.05]) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), matBrassAccent);
    handle.position.set(-4.12, 1.05, hz);
    cabinetGroup.add(handle);
  }
  root.add(cabinetGroup);

  // 5. Central Digital Twin Calibration Pedestal (0, 0, 0)
  const plinthGroup = new THREE.Group();
  const plinthBody = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.92, 0.66), matWallIvory);
  plinthBody.position.set(0, 0.46, 0);
  plinthBody.castShadow = true;
  plinthBody.receiveShadow = true;
  plinthGroup.add(plinthBody);

  // Architectural wireframe sculpture atop the plinth
  const sculptureGeo = new THREE.OctahedronGeometry(0.22, 0);
  const sculptureMesh = new THREE.Mesh(sculptureGeo, matBrassAccent);
  sculptureMesh.position.set(0, 1.18, 0);
  sculptureMesh.castShadow = true;
  sculptureMesh.name = 'PedestalOctahedron';
  plinthGroup.add(sculptureMesh);

  root.add(plinthGroup);

  // 6. East Wall Telemetry Console (x: 4.25 to 4.85, z: 0.75 to 2.65)
  const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 1.9), matCharcoalMetal);
  consoleMesh.position.set(4.52, 0.33, 1.7);
  consoleMesh.castShadow = true;
  consoleMesh.receiveShadow = true;
  root.add(consoleMesh);

  // Wall-mounted spatial display panel above east console
  const screenPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.95, 1.65),
    new THREE.MeshStandardMaterial({
      color: 0x16291f,
      roughness: 0.2,
      metalness: 0.5,
      emissive: 0x102419,
      emissiveIntensity: 0.55
    })
  );
  screenPanel.position.set(4.85, 1.55, 1.7);
  root.add(screenPanel);

  return root;
}

/**
 * Builds a subtle metric calibration floor grid + perimeter boundary indicator
 * for externally reconstructed GLB or Gaussian Splat scenes.
 */
export function buildReconstructionCalibrationStage(roomBounds) {
  const group = new THREE.Group();
  group.name = 'ReconstructionCalibrationStage';

  const width = (roomBounds?.maxX ?? 4) - (roomBounds?.minX ?? -4);
  const depth = (roomBounds?.maxZ ?? 4) - (roomBounds?.minZ ?? -4);
  const size = Math.max(width, depth);

  const floorPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      color: 0x1a2620,
      roughness: 0.9,
      metalness: 0.05,
      transparent: true,
      opacity: 0.55
    })
  );
  floorPlane.rotation.x = -Math.PI / 2;
  floorPlane.position.y = -0.01;
  floorPlane.receiveShadow = true;
  group.add(floorPlane);

  const grid = new THREE.GridHelper(size, Math.round(size * 2), 0x48b878, 0x2c4235);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  group.add(grid);

  return group;
}

/**
 * Creates interactive 3D Point-of-Interest (POI) beacons that can be hovered/clicked in 3D space.
 */
export function createPOIMarkers(pois = [], activePoiId = null) {
  const group = new THREE.Group();
  group.name = 'POIMarkersGroup';
  const interactables = [];

  for (const poi of pois) {
    const isSelected = poi.id === activePoiId;
    const pinGroup = new THREE.Group();
    pinGroup.position.set(poi.position[0], poi.position[1], poi.position[2]);
    pinGroup.userData = { poi };

    const coreColor = isSelected ? 0xd99b4e : 0x48b878;

    // Glowing beacon sphere
    const sphereGeo = new THREE.SphereGeometry(0.11, 20, 20);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: coreColor,
      emissive: coreColor,
      emissiveIntensity: isSelected ? 0.85 : 0.45,
      roughness: 0.25
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.userData = { poi };
    pinGroup.add(sphere);
    interactables.push(sphere);

    // Outer halo ring
    const ringGeo = new THREE.RingGeometry(0.15, 0.19, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf6f4ef,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isSelected ? 0.9 : 0.55
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.02;
    pinGroup.add(ring);

    // Vertical drop stem to furniture surface
    const stemGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.32, 8);
    const stemMat = new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: 0.65
    });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = -0.18;
    pinGroup.add(stem);

    group.add(pinGroup);
  }

  return { group, interactables };
}

/**
 * Renders an obstacle-aware A* walking route on the floor (Round 2 Wayfinding Visualization).
 */
export function createRouteVisualization(pathPointsXZ = []) {
  const group = new THREE.Group();
  group.name = 'WayfindingRouteGroup';

  if (!Array.isArray(pathPointsXZ) || pathPointsXZ.length < 2) {
    return group;
  }

  const curvePoints = pathPointsXZ.map(([x, z]) => new THREE.Vector3(x, 0.035, z));

  // Build smooth piecewise path tube on the floor
  const pathCurve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.15);
  const tubeGeo = new THREE.TubeGeometry(
    pathCurve,
    Math.max(24, curvePoints.length * 10),
    0.045,
    12,
    false
  );
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0xd99b4e,
    emissive: 0xd99b4e,
    emissiveIntensity: 0.55,
    roughness: 0.3
  });
  const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
  group.add(tubeMesh);

  // Waypoint nodes along the path
  const nodeGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 18);
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0xf6f4ef });

  for (let i = 0; i < curvePoints.length; i++) {
    const node = new THREE.Mesh(nodeGeo, nodeMat);
    node.position.copy(curvePoints[i]);
    group.add(node);
  }

  // Destination target ring
  const dest = curvePoints[curvePoints.length - 1];
  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xd99b4e,
      side: THREE.DoubleSide
    })
  );
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.set(dest.x, 0.03, dest.z);
  group.add(targetRing);

  return group;
}

/**
 * Recursively disposes geometries, materials, and textures in a Three.js Object3D subtree.
 */
export function disposeObject3D(object) {
  if (!object) return;
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (!mat) continue;
        for (const key of Object.keys(mat)) {
          const val = mat[key];
          if (val && typeof val === 'object' && typeof val.dispose === 'function') {
            val.dispose();
          }
        }
        if (typeof mat.dispose === 'function') {
          mat.dispose();
        }
      }
    }
  });
}
