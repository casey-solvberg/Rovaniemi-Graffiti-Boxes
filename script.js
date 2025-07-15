import * as THREE from "three";
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- Глобальные переменные ---
let scene, camera, renderer, composer, bloomPass;
let plane, allBoxes = [];
let backgroundCylinder;
let arcFocusTarget, circleCenterPoint;
const boxHeight = 2.44, boxWidth = 1.3, boxDepth = 0.32;
const LIFT_HEIGHT = 0.2;
const numActualBoxes = 8;
const arcRadius = 48, totalArcAngleDeg = 42, totalArcAngleRad = THREE.MathUtils.degToRad(totalArcAngleDeg);
let currentViewIndex = 0;
const GENERAL_VIEWS_COUNT = 2;
const BOX_FOCUS_VIEWS_START_INDEX = GENERAL_VIEWS_COUNT;
let FINAL_LOOK_VIEW_INDEX;
let BOX_ROTATION_VIEWS_START_INDEX;
let FINAL_FADE_VIEW_INDEX;
let isAnimating = false;
const cameraAnimationDuration = 0.8;
const rotationAnimationDuration = 0.5;
const fadeAnimationDuration = 0.1;
const cameraViews = [];
let animatedLookAtTarget = new THREE.Vector3();
let accumulatedDeltaY = 0;

const SCROLL_THRESHOLD = 200;
let currentScrollThreshold = SCROLL_THRESHOLD;

let scrollTimeout = null;
let canProcessScroll = true;
const pageFooterUI = document.getElementById("page-footer");
const navArrowsUI = document.getElementById("nav-arrows");
const textPanelUI = document.getElementById("text-panel");
const prevBoxBtn = document.getElementById("prev-box-btn");
const nextBoxBtn = document.getElementById("next-box-btn");
const homeButton = document.getElementById("home-button");
const toggleLightButton = document.getElementById("toggle-light-button");

// --- Ночные переменные ---
let isNightMode = false;
let ambientLight, directionalLight;
let dayFloorTexture;

// ИЗМЕНЕНИЕ: Функция init теперь асинхронная, чтобы дождаться загрузки
async function init() {
  const textureLoader = new THREE.TextureLoader();
  
  // ИЗМЕНЕНИЕ: Убрана загрузка top-bottom.png
  const texturePromises = [
    textureLoader.loadAsync("textures/floor.jpg"),
    textureLoader.loadAsync("textures/background.jpg"),
    // textureLoader.loadAsync("textures/top-bottom.png") // УБРАНО
  ];
  for (let i = 0; i < numActualBoxes; i++) {
    texturePromises.push(textureLoader.loadAsync(`textures/box_${i + 1}_sides.png`));
  }
  
  // ИЗМЕНЕНИЕ: Ждем, пока ВСЕ текстуры загрузятся
  const [
    floorTexture, 
    backgroundTexture, 
    // topBottomTexture, // УБРАНО
    ...sideTextures
  ] = await Promise.all(texturePromises);

  // Теперь, когда все текстуры загружены, мы можем безопасно продолжать
  dayFloorTexture = floorTexture;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdddddd);
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);
  directionalLight = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight.position.set(0, 80, 40);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);

  plane = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ map: dayFloorTexture, side: THREE.DoubleSide })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  scene.add(plane);
  
  const BACKGROUND_RADIUS = 100, BACKGROUND_HEIGHT = 40, BACKGROUND_Y_OFFSET = 20, BACKGROUND_Z_OFFSET = 100, BACKGROUND_ARC_DEGREES = 80;
  const startAngleRad = THREE.MathUtils.degToRad(180 - BACKGROUND_ARC_DEGREES / 2);
  const lengthAngleRad = THREE.MathUtils.degToRad(BACKGROUND_ARC_DEGREES);
  const backgroundCylinderGeometry = new THREE.CylinderGeometry(BACKGROUND_RADIUS, BACKGROUND_RADIUS, BACKGROUND_HEIGHT, 64, 1, true, startAngleRad, lengthAngleRad);
  const backgroundCylinderMaterial = new THREE.MeshStandardMaterial({ map: backgroundTexture, side: THREE.BackSide });
  backgroundCylinder = new THREE.Mesh(backgroundCylinderGeometry, backgroundCylinderMaterial);
  backgroundCylinder.position.set(0, BACKGROUND_Y_OFFSET, BACKGROUND_Z_OFFSET);
  scene.add(backgroundCylinder);

  circleCenterPoint = new THREE.Vector3(0, boxHeight / 2 + LIFT_HEIGHT, 0);

  const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
  const angleStep = numActualBoxes > 1 ? totalArcAngleRad / (numActualBoxes - 1) : 0;
  const startAngle = -totalArcAngleRad / 2;

  // ИЗМЕНЕНИЕ: Этот цикл теперь работает с уже загруженными текстурами
  for (let i = 0; i < numActualBoxes; i++) {
    const sideTexture = sideTextures[i];
    sideTexture.wrapS = THREE.RepeatWrapping;
    sideTexture.repeat.x = 0.25;

    // ИСПРАВЛЕНО: Верх и низ - просто белые материалы
    const materials = [
      new THREE.MeshStandardMaterial({ map: sideTexture.clone(), roughness: 0.8, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ map: sideTexture.clone(), roughness: 0.8, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ map: sideTexture.clone(), roughness: 0.8, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ map: sideTexture.clone(), roughness: 0.8, metalness: 0.2 }),
    ];
    materials[0].map.offset.x = 0.25; materials[1].map.offset.x = 0.75; materials[4].map.offset.x = 0.0; materials[5].map.offset.x = 0.5;

    const box = new THREE.Mesh(boxGeometry, materials);

    const angle = startAngle + i * angleStep;
    box.position.set(circleCenterPoint.x + arcRadius * Math.sin(angle), boxHeight / 2 + LIFT_HEIGHT, circleCenterPoint.z + arcRadius * Math.cos(angle));
    box.castShadow = true;
    box.userData.id = i + 1;
    box.userData.initialRotationY = box.rotation.y;
    scene.add(box);
    allBoxes.push(box);

    const spotLight = new THREE.SpotLight(0xffffff, 0, 20, Math.PI / 4, 0.5, 1);
    const boxPos = box.position;
    spotLight.position.set(boxPos.x, 0.1, boxPos.z + 2.5);
    spotLight.target = box;
    spotLight.castShadow = true;
    box.userData.spotLight = spotLight;
    scene.add(spotLight);
    scene.add(spotLight.target);
  }
  
  // Код создания cameraViews остается без изменений
  arcFocusTarget = numActualBoxes > 0 ? new THREE.Vector3(circleCenterPoint.x, boxHeight / 2 + LIFT_HEIGHT, circleCenterPoint.z + arcRadius) : new THREE.Vector3(0, boxHeight / 2 + LIFT_HEIGHT, 0);
  cameraViews.push({ navLabel: "Домой", viewId: 0, name: "View 1: Top Down", type: "general", position: new THREE.Vector3(arcFocusTarget.x, arcFocusTarget.y + 40, arcFocusTarget.z + 5), lookAt: arcFocusTarget.clone(), fov: 60 });
  cameraViews.push({ navLabel: "Общий вид", viewId: 1, name: "View 2: Arc Front", type: "general", position: new THREE.Vector3(arcFocusTarget.x, 1.6, circleCenterPoint.z + arcRadius + 18), lookAt: arcFocusTarget.clone(), fov: 55 });
  const cameraHeightBoxFocus = 1.6, cameraOffsetX = 1.5, cameraOffsetZFromFrontFace = 4.0;
  allBoxes.forEach((box, index) => {
    const boxPos = box.position;
    const targetCameraPosition = new THREE.Vector3(boxPos.x + cameraOffsetX, cameraHeightBoxFocus, boxPos.z + boxDepth / 2 + cameraOffsetZFromFrontFace);
    const targetLookAtPos = new THREE.Vector3(targetCameraPosition.x, targetCameraPosition.y, boxPos.z);
    cameraViews.push({ navLabel: index === 0 ? "Бокс 1" : null, viewId: BOX_FOCUS_VIEWS_START_INDEX + index, name: `View 3.${index + 1}: Focus Box ${index + 1}`, type: "box_focus", boxIndex: index, position: targetCameraPosition, lookAt: targetLookAtPos, fov: 50 });
  });
  const lastBoxFocusView = cameraViews[BOX_FOCUS_VIEWS_START_INDEX + numActualBoxes - 1];
  const finalCamPos_s = lastBoxFocusView.position.clone();
  finalCamPos_s.x += 1.0; finalCamPos_s.y -= 0.5 - LIFT_HEIGHT;
  const finalLookAt_s = lastBoxFocusView.lookAt.clone();
  finalLookAt_s.x += 1.0; finalLookAt_s.y -= 0.5 - LIFT_HEIGHT;
  cameraViews.push({ navLabel: "До вращения", viewId: cameraViews.length, name: `View 4: Shifted Look Box ${numActualBoxes}`, type: "final_look", boxIndex: numActualBoxes - 1, position: finalCamPos_s, lookAt: finalLookAt_s, fov: lastBoxFocusView.fov });
  FINAL_LOOK_VIEW_INDEX = cameraViews.length - 1;
  BOX_ROTATION_VIEWS_START_INDEX = cameraViews.length;
  const lastBoxForRotation = allBoxes[numActualBoxes - 1];
  const initialRotY = lastBoxForRotation.userData.initialRotationY;
  cameraViews.push({ navLabel: null, viewId: cameraViews.length, name: "View 5.1 (Base for Rotation)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY, text: "Бокс готов к вращению.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
  cameraViews.push({ navLabel: null, viewId: cameraViews.length, name: "View 5.2 (Rotate +90 deg)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY + Math.PI / 2, text: "Бокс повернут на 90° по часовой.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
  cameraViews.push({ navLabel: null, viewId: cameraViews.length, name: "View 5.3 (Rotate +180 deg)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY + Math.PI, text: "Бокс повернут на 180° по часовой.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
  cameraViews.push({ navLabel: null, viewId: cameraViews.length, name: "View 5.4 (Rotate +360 deg)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY + 2 * Math.PI, text: "Бокс совершил полный оборот по часовой.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
  FINAL_FADE_VIEW_INDEX = cameraViews.length;
  cameraViews.push({ navLabel: "Финал", viewId: cameraViews.length, name: "View 6: Fade Out", type: "final_fade", box: lastBoxForRotation, cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });

  const renderPass = new RenderPass(scene, camera);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.4, 0);
  bloomPass.enabled = false;
  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  
  setupHeaderNavigation();
  if (cameraViews.length > 0) { setCameraToView(0, true); }
  window.addEventListener("resize", onWindowResize, false);
  window.addEventListener("wheel", onMouseWheel, { passive: false });
  if (homeButton) { homeButton.addEventListener("click", (e) => { e.preventDefault(); const targetIndex = parseInt(homeButton.dataset.viewIndex); if (!isAnimating && targetIndex !== currentViewIndex) { setCameraToView(targetIndex, false); } }); }
  if (toggleLightButton) { toggleLightButton.addEventListener('click', toggleNightMode); }
  prevBoxBtn.addEventListener("click", () => navigateWithButtons(-1));
  nextBoxBtn.addEventListener("click", () => navigateWithButtons(1));
  animate();

  const finalViewIndex = cameraViews.findIndex((view) => view.type === "final_fade");
  if (pageFooterUI && finalViewIndex !== -1) { pageFooterUI.addEventListener("click", (event) => { if (event.target.closest("a")) { return; } if (!isAnimating && currentViewIndex !== finalViewIndex) { setCameraToView(finalViewIndex, false); } }); }
}

// Запускаем асинхронную инициализацию
init().catch(error => console.error("Failed to initialize scene:", error));

function toggleNightMode() {
    isNightMode = !isNightMode;
    const duration = 1.5;

    bloomPass.enabled = isNightMode;

    gsap.to(ambientLight, { intensity: isNightMode ? 0.1 : 1.0, duration });
    gsap.to(directionalLight, { intensity: isNightMode ? 0.05 : 2.0, duration });
    gsap.to(scene.background, { r: isNightMode ? 0.03 : 0.86, g: isNightMode ? 0.03 : 0.86, b: isNightMode ? 0.1 : 0.86, duration });
    
    // Запасной вариант, так как nightFloorTexture нет - меняем цвет материала
    const nightFloorColor = new THREE.Color(0x333333);
    const dayFloorColor = new THREE.Color(0xffffff);
    gsap.to(plane.material.color, {
        r: isNightMode ? nightFloorColor.r : dayFloorColor.r,
        g: isNightMode ? nightFloorColor.g : dayFloorColor.g,
        b: isNightMode ? nightFloorColor.b : dayFloorColor.b,
        duration,
    });

    const lightColors = [0x00ff00, 0xff00ff, 0x00aaff, 0xffff00, 0xff5500, 0x00ffff, 0xff0055, 0x5500ff];

    allBoxes.forEach((box, index) => {
        const spotLight = box.userData.spotLight;

        if (isNightMode) {
            spotLight.color.set(lightColors[index % lightColors.length]);
            gsap.to(spotLight, { intensity: 15, duration });
        } else {
            gsap.to(spotLight, { intensity: 0, duration });
        }
    });
}

function setCameraToView(viewIndex, instant = false) {
  if (isAnimating && !instant) return;
  if (viewIndex < 0 || viewIndex >= cameraViews.length) return;

  if (instant) {
    const targetViewConfig = cameraViews[viewIndex];
    let pos = targetViewConfig.position.clone();
    let look = targetViewConfig.lookAt.clone();
    camera.position.copy(pos);
    animatedLookAtTarget.copy(look);
    camera.lookAt(look);
    camera.fov = targetViewConfig.fov;
    camera.updateProjectionMatrix();
    currentViewIndex = viewIndex;
    updateHeaderNavActiveState(currentViewIndex);
    updateUIForView(viewIndex);
    if (bloomPass) bloomPass.enabled = isNightMode;
    handleSceneAndFooterState(targetViewConfig, null);
    return;
  }
  
  isAnimating = true;
  canProcessScroll = false;
  
  const prevViewConfig = cameraViews[currentViewIndex];
  const targetViewConfig = cameraViews[viewIndex];
  currentViewIndex = viewIndex;
  updateHeaderNavActiveState(currentViewIndex);

  let actualCameraPosition, actualLookAt, actualFov;
  if (targetViewConfig.cameraViewIndexToClone !== undefined) {
    const baseCamView = cameraViews[targetViewConfig.cameraViewIndexToClone];
    actualCameraPosition = baseCamView.position.clone();
    actualLookAt = baseCamView.lookAt.clone();
    actualFov = baseCamView.fov;
  } else {
    actualCameraPosition = targetViewConfig.position.clone();
    actualLookAt = targetViewConfig.lookAt.clone();
    actualFov = targetViewConfig.fov;
  }

  handleSceneAndFooterState(targetViewConfig, prevViewConfig);

  const duration = (targetViewConfig.type === "box_rotation" || targetViewConfig.type === "final_fade")
      ? rotationAnimationDuration
      : cameraAnimationDuration;
  
  const tl = gsap.timeline({
    onComplete: () => {
      isAnimating = false;
      if (targetViewConfig.type === "box_rotation") { targetViewConfig.box.rotation.y = targetViewConfig.targetRotationY; }
      
      if (targetViewConfig.type === "final_fade") {
        const materials = Array.isArray(targetViewConfig.box.material) ? targetViewConfig.box.material : [targetViewConfig.box.material];
        materials.forEach(m => m.opacity = 0);
      }

      camera.position.copy(actualCameraPosition);
      animatedLookAtTarget.copy(actualLookAt);
      camera.lookAt(animatedLookAtTarget);
      
      setTimeout(() => { canProcessScroll = true; accumulatedDeltaY = 0; }, 200);
    }
  });

  tl.to(camera.position, { ...actualCameraPosition, duration, ease: "power2.inOut" }, 0);
  tl.to(animatedLookAtTarget, { ...actualLookAt, duration, ease: "power2.inOut" }, 0);
  tl.to(camera, { fov: actualFov, duration, ease: "power2.inOut", onUpdate: () => camera.updateProjectionMatrix() }, 0);

  if (targetViewConfig.type === "box_rotation") {
    tl.to(targetViewConfig.box.rotation, { y: targetViewConfig.targetRotationY, duration: rotationAnimationDuration, ease: "power1.inOut" }, ">-0.1");
  }
  
  if (targetViewConfig.type === "final_fade") {
    const materials = Array.isArray(targetViewConfig.box.material) ? targetViewConfig.box.material : [targetViewConfig.box.material];
    materials.forEach(m => {
        tl.to(m, { opacity: 0, duration: fadeAnimationDuration, ease: "power1.inOut" }, ">-0.1");
    });
    tl.to(textPanelUI, { opacity: 0, duration: fadeAnimationDuration, ease: "power1.inOut" }, ">-0.1");
  }

  updateUIForView(viewIndex);
}

function handleSceneAndFooterState(targetView, prevView) {
  const targetType = targetView.type;
  const prevType = prevView ? prevView.type : null;

  if (targetType === "final_fade") { pageFooterUI.style.height = "92vh"; } 
  else if (targetType === "final_look" || targetType === "box_rotation") { pageFooterUI.style.height = "13vh"; } 
  else { pageFooterUI.style.height = "8vh"; }

  if (numActualBoxes > 0) {
    const rotatingBox = allBoxes[numActualBoxes - 1];
    const wasInRotationSequence = prevType === "box_rotation" || prevType === "final_look" || prevType === "final_fade";
    const isEnteringGeneralSequence = targetType !== "box_rotation" && targetType !== "final_look" && targetType !== "final_fade";

    if (wasInRotationSequence && isEnteringGeneralSequence) {
        rotatingBox.rotation.y = rotatingBox.userData.initialRotationY;
    }
  }

  if (targetType === 'final_fade') {
    allBoxes.forEach(b => b.visible = false);
    plane.visible = false;
    backgroundCylinder.visible = false;
  } else {
    const isRotationOrFade = targetType === "box_rotation";
    const isFinalLook = targetType === "final_look";

    plane.visible = !(isFinalLook || isRotationOrFade);
    backgroundCylinder.visible = !(isFinalLook || isRotationOrFade);

    allBoxes.forEach((b) => {
      b.visible = true;
      const materials = Array.isArray(b.material) ? b.material : [b.material];
      materials.forEach(m => m.opacity = 1);

      if (isRotationOrFade) {
          if (b !== targetView.box) b.visible = false;
      }
    });
  }

  if (targetType === "general") { textPanelUI.style.display = "none"; } 
  else {
    textPanelUI.style.display = "block";
    textPanelUI.style.opacity = targetType === "final_fade" && isAnimating ? textPanelUI.style.opacity : 1;
  }
}

function animate() {
  requestAnimationFrame(animate);
  camera.lookAt(animatedLookAtTarget);
  if (composer) {
    composer.render();
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  currentScrollThreshold = SCROLL_THRESHOLD;
  setupHeaderNavigation();
  updateHeaderNavActiveState(currentViewIndex);
}
function setupHeaderNavigation() {
  const navLinksContainer = document.getElementById( "header-nav-links-container"  );
  navLinksContainer.innerHTML = "";
  const navPoints = [
    { label: "Общий вид", targetViewNameOrIndex: 1 },
    { label: "Бокс 1", targetViewNameOrIndex: "View 3.1: Focus Box 1" },
    {      label: "Вращение",      targetViewNameOrIndex: "View 5.1 (Base for Rotation)",    },
    { label: "Финал", targetViewNameOrIndex: "View 6: Fade Out" },
  ];
  navPoints.forEach((point) => {
    const link = document.createElement("a");
    link.href = "#";
    link.classList.add("header-nav-link", "nav-button-style");
    link.textContent = point.label;
    let targetIndex = -1;
    if (typeof point.targetViewNameOrIndex === "number") {
      targetIndex = point.targetViewNameOrIndex;
    } else {
      targetIndex = cameraViews.findIndex(
        (cv) => cv.name === point.targetViewNameOrIndex
      );
    }
    if (targetIndex !== -1) {
      link.dataset.viewIndex = targetIndex;
      link.addEventListener("click", (e) => {
        e.preventDefault();
        if (!isAnimating && targetIndex !== currentViewIndex) {
          setCameraToView(targetIndex, false);
        }
      });
      navLinksContainer.appendChild(link);
    }
  });
  updateHeaderNavActiveState(currentViewIndex);
}
function updateHeaderNavActiveState(activeIndex) {
  const headerNavElements = document.querySelectorAll(
    "#page-header .header-nav-link"
  );
  headerNavElements.forEach((link) => {
    link.classList.remove("active");
    const linkViewIndex = parseInt(link.dataset.viewIndex);
    if (linkViewIndex === activeIndex) {
      link.classList.add("active");
      return;
    }
    const activeViewConf = cameraViews[activeIndex];
    if (activeViewConf) {
      if (
        link.textContent === "Бокс 1" &&
        activeViewConf.type === "box_focus"
      ) {
        link.classList.add("active");
      } else if (
        link.textContent === "Вращение" &&
        (activeViewConf.type === "box_rotation" ||
          (activeViewConf.type === "final_look" &&
            activeViewConf.name.startsWith("View 4")))
      ) {
        link.classList.add("active");
      }
    }
  });
}
function onMouseWheel(event) {
  event.preventDefault();
  if (!canProcessScroll || isAnimating) return;
  accumulatedDeltaY += event.deltaY;
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    if (!isAnimating) accumulatedDeltaY = 0;
  }, 400);
  if (accumulatedDeltaY > SCROLL_THRESHOLD) {
    if (currentViewIndex < cameraViews.length - 1) {
      setCameraToView(currentViewIndex + 1);
      clearTimeout(scrollTimeout);
      accumulatedDeltaY = 0;
    } else accumulatedDeltaY = 0;
  } else if (accumulatedDeltaY < -SCROLL_THRESHOLD) {
    if (currentViewIndex > 0) {
      setCameraToView(currentViewIndex - 1);
      clearTimeout(scrollTimeout);
      accumulatedDeltaY = 0;
    } else accumulatedDeltaY = 0;
  }
}
function updateUIForView(viewIndex) {
  if (viewIndex < 0 || viewIndex >= cameraViews.length) return;
  const view = cameraViews[viewIndex];
  if (view.type === "box_focus") {
    navArrowsUI.style.visibility = "visible";
    textPanelUI.innerHTML = `<h2>Бокс №${
      allBoxes[view.boxIndex].userData.id
    }</h2><p>Фокус на боксе.</p>`;
    prevBoxBtn.classList.toggle("disabled", view.boxIndex === 0);
    nextBoxBtn.classList.toggle(
      "disabled",
      view.boxIndex === allBoxes.length - 1
    );
  } else if (view.type === "final_look") {
    navArrowsUI.style.visibility = "hidden";
    textPanelUI.innerHTML = `<h2>Бокс №${
      allBoxes[view.boxIndex].userData.id
    }</h2><p>Подготовка к вращению.</p>`;
  } else if (view.type === "box_rotation") {
    navArrowsUI.style.visibility = "hidden";
    textPanelUI.innerHTML = `<h2>Бокс №${view.box.userData.id}</h2><p>${view.text}</p>`;
  } else if (view.type === "final_fade") {
    navArrowsUI.style.visibility = "hidden";
    textPanelUI.innerHTML = `<h2>Прощание</h2><p>Вселенная схлопывается...</p>`;
  } else {
    navArrowsUI.style.visibility = "hidden";
  }
}
function navigateWithButtons(direction) {
  const currentConfig = cameraViews[currentViewIndex];
  if (currentConfig && currentConfig.type === "box_focus") {
    let targetViewIdx = currentViewIndex + direction;
    if (
      targetViewIdx >= BOX_FOCUS_VIEWS_START_INDEX &&
      targetViewIdx < BOX_FOCUS_VIEWS_START_INDEX + numActualBoxes
    ) {
      setCameraToView(targetViewIdx);
    }
  }
}

init();