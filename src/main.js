import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bodies } from './catalog.js';
import { cartesianToSpherical, distance, formatMetres, METRES_PER_UNIT, nearestBody, parseGps, sphericalToCartesian } from './measure.js';
import './style.css';

const $ = id => document.getElementById(id);
const camera = new THREE.PerspectiveCamera(52, 1, 0.015, 8000);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020408, 0.00018);
const canvasHost = $('canvas');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.append(renderer.domElement);
} catch (error) {
  $('map-error').hidden = false;
  $('map-error').textContent = `3D view unavailable: ${error.message}. Measurements and coordinate lookup remain usable.`;
}

const controls = renderer ? new OrbitControls(camera, renderer.domElement) : null;
if (controls) {
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomSpeed = 2.4;
  controls.minDistance = 0.08;
  controls.maxDistance = 5500;
}
scene.add(new THREE.AmbientLight(0x587186, 1.8));
const sunlight = new THREE.PointLight(0xffdda7, 1400, 900);
scene.add(sunlight);
const fill = new THREE.DirectionalLight(0xa1c2e0, 0.8);
fill.position.set(200, 180, 350);
scene.add(fill);
const sphere = new THREE.SphereGeometry(1, 48, 32);
const hitSphere = new THREE.SphereGeometry(1, 12, 8);
const meshes = [];
const labels = [];
const scenePoint = p => new THREE.Vector3(p[0] / METRES_PER_UNIT, p[1] / METRES_PER_UNIT, p[2] / METRES_PER_UNIT);
const pos = body => scenePoint(body.position);
const markerSize = body => body.kind === 'Star' ? 3.8 : body.kind === 'Anomaly' ? 3 : Math.max(1.5, Math.log10(body.radius / 1000) * 0.85);
let trueSize = false;
let activeWorld = 0;
let activeBodies = bodies.filter(body => body.world === activeWorld);
let selected = bodies.find(body => body.name === 'Earth');
let userPosition = null;
let measureLine = null;
let userMarker = null;
let routeMarker = null;

function makeGlow(color, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.16, color + 'b0');
  gradient.addColorStop(1, color + '00');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

for (const body of bodies) {
  const group = new THREE.Group();
  group.position.copy(pos(body));
  group.visible = body.world === activeWorld;
  scene.add(group);
  body.group = group;
  body.renderRadius = markerSize(body);
  if (body.kind === 'Anomaly') {
    const dark = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0x03060b }));
    dark.scale.setScalar(2.6);
    group.add(dark);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xd89e62, side: THREE.DoubleSide, transparent: true, opacity: 0.78 });
    const disk = new THREE.Mesh(new THREE.RingGeometry(3.2, 5.8, 64), ringMaterial);
    disk.rotation.x = -Math.PI / 2.7;
    group.add(disk);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.13, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffd2a3 }));
    inner.rotation.x = disk.rotation.x;
    group.add(inner);
    group.add(makeGlow('#e49a5f', 19));
  } else {
    const color = new THREE.Color(body.color);
    const surface = new THREE.Mesh(sphere, body.kind === 'Star'
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, emissive: color, emissiveIntensity: 0.045 }));
    group.add(surface);
    body.surface = surface;
    if (body.kind === 'Star') group.add(makeGlow(body.color, body.name === 'Sun' ? 29 : 15));
    if (body.name === 'Baobara' || body.name === 'Basalt') {
      const rings = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.7, 64), new THREE.MeshBasicMaterial({ color: body.color, side: THREE.DoubleSide, transparent: true, opacity: 0.35 }));
      rings.rotation.x = -1.15;
      group.add(rings);
      body.rings = rings;
    }
  }
  const hit = new THREE.Mesh(hitSphere, new THREE.MeshBasicMaterial({ visible: false }));
  hit.scale.setScalar(Math.max(2.8, body.renderRadius));
  body.hit = hit;
  hit.userData.body = body;
  group.add(hit);
  body.visuals = group.children.filter(child => child !== hit);
  if (body.kind === 'Anomaly') body.anomalyScales = body.visuals.map(visual => visual.scale.clone());
  if (group.visible) meshes.push(hit);
  const label = document.createElement('span');
  label.className = 'body-label';
  label.textContent = body.name.toUpperCase();
  $('labels').append(label);
  labels.push({ position: group.position, element: label, body });
}

// A small deterministic, non-game star field supplies depth without external assets.
const points = new Float32Array(1200);
let seed = 8319;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < points.length; i += 3) {
  const theta = random() * Math.PI * 2;
  const z = random() * 2 - 1;
  const radius = 900 + random() * 220;
  const r = Math.sqrt(1 - z * z) * radius;
  points.set([Math.cos(theta) * r, z * radius, Math.sin(theta) * r], i);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xb2c9da, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false })));

const bodyRow = body => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'body-row';
  button.setAttribute('role', 'listitem');
  button.innerHTML = `<span class="body-dot${body.kind === 'Anomaly' ? ' anomaly' : ''}"></span><span><strong></strong><small></small></span><span class="chevron">›</span>`;
  button.style.setProperty('--body-color', body.color);
  button.querySelector('strong').textContent = body.name;
  button.querySelector('small').textContent = body.kind;
  button.addEventListener('click', () => selectBody(body, true));
  $('body-list').append(button);
  body.button = button;
};
bodies.forEach(bodyRow);
// Local terrain/biome maps are imported from the user's game installation;
// nothing from the game is bundled or fetched from the Pages host.
const surfaceKey = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const surfaceBodies = bodies.filter(body => body.surface && body.kind !== 'Star');
const textureLoader = new THREE.TextureLoader();
async function loadSurface(body, url) {
  const texture = await new Promise((resolve, reject) => textureLoader.load(url, resolve, undefined, reject));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = -1;
  if (body.surface.material.map) {
    body.surface.material.map.dispose();
    URL.revokeObjectURL(body.surfaceUrl);
  }
  body.surfaceUrl = url;
  body.surface.material.map = texture;
  body.surface.material.color.set(0xffffff);
  body.surface.material.emissive.set(0xffffff);
  body.surface.material.emissiveMap = texture;
  body.surface.material.needsUpdate = true;
  const dot = body.button.querySelector('.body-dot');
  dot.classList.add('has-surface');
  dot.style.backgroundImage = `url("${url}")`;
  if (body === selected) selectBody(body);
}
function surfaceStatus() {
  const loaded = surfaceBodies.filter(body => body.surfaceUrl).length;
  $('texture-status').textContent = loaded
    ? `Showing ${loaded} of ${surfaceBodies.length} local game surfaces. Nothing was uploaded.`
    : 'No matching surface PNGs loaded. Extract them locally with tools/export-surfaces.py.';
}
if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  (async () => {
    try {
      const response = await fetch('./__local-game-surfaces/');
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
      const files = await response.json();
      for (const body of surfaceBodies) {
        const name = `${surfaceKey(body.name)}-surface.png`;
        if (files.includes(name)) await loadSurface(body, `./__local-game-surfaces/${name}`);
      }
      surfaceStatus();
    } catch { surfaceStatus(); }
  })();
}
$('game-textures').addEventListener('change', async event => {
  const input = event.target;
  const files = [...input.files];
  input.disabled = true;
  try {
    for (const file of files.slice(0, surfaceBodies.length)) {
      const body = surfaceBodies.find(candidate => `${surfaceKey(candidate.name)}-surface.png` === file.name.toLowerCase());
      if (!body || file.type !== 'image/png' || file.size > 10_000_000) continue;
      const url = URL.createObjectURL(file);
      try {
        await loadSurface(body, url);
      } catch { URL.revokeObjectURL(url); }
    }
    surfaceStatus();
  } finally {
    input.value = '';
    input.disabled = false;
  }
});
window.addEventListener('pagehide', () => bodies.forEach(body => { if (body.surfaceUrl) URL.revokeObjectURL(body.surfaceUrl); }));
function filterBodyList() {
  const query = $('search').value.trim().toLowerCase();
  for (const body of bodies) body.button.hidden = body.world !== activeWorld || (!body.name.toLowerCase().includes(query) && !body.kind.toLowerCase().includes(query));
}
$('search').addEventListener('input', filterBodyList);
window.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    event.preventDefault(); $('search').focus();
  }
});

function focus(point, range = 26) {
  if (!controls) return;
  const offset = camera.position.clone().sub(controls.target).normalize();
  if (offset.lengthSq() < 0.5) offset.set(0.4, 0.35, 0.85).normalize();
  controls.target.copy(point);
  camera.position.copy(point).addScaledVector(offset, range);
  controls.update();
}
function selectBody(body, moveCamera = false) {
  selected = body;
  for (const item of bodies) item.button.classList.toggle('active', item === body);
  labels.sort((a, b) => Number(b.body === body) - Number(a.body === body));
  $('selected-name').textContent = body.name;
  $('selected-kind').textContent = body.kind.toUpperCase();
  $('selected-icon').className = `selected-icon${body.kind === 'Anomaly' ? ' anomaly' : ''}`;
  $('selected-icon').style.backgroundColor = body.kind === 'Anomaly' ? '' : body.color;
  $('selected-icon').classList.toggle('has-surface', Boolean(body.surfaceUrl));
  $('selected-icon').style.backgroundImage = body.surfaceUrl ? `url("${body.surfaceUrl}")` : '';
  $('selected-radius').textContent = body.radius == null ? 'UNKNOWN' : formatMetres(body.radius);
  $('selected-diameter').textContent = body.radius == null ? 'UNKNOWN' : formatMetres(body.radius * 2);
  const [gpsDistance, longitude, latitude] = cartesianToSpherical(body.position);
  $('selected-position').textContent = `${gpsDistance.toLocaleString('en-US', { maximumFractionDigits: 1 })} m · ${longitude.toFixed(8)}° lon · ${latitude.toFixed(8)}° lat`;
  $('measure-from').value = body.name;
  updateMeasurement();
  if (moveCamera) focus(pos(body), 105);
}
$('focus-selected').addEventListener('click', () => focus(pos(selected), 105));
const bounds = new THREE.Box3();
const system = new THREE.Sphere();
function fitMap() {
  if (!controls) return;
  setTrueSize(false);
  bounds.makeEmpty();
  for (const body of activeBodies) bounds.expandByPoint(body.group.position);
  bounds.getBoundingSphere(system);
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const halfFov = Math.atan(Math.tan(vfov / 2) * Math.min(1, camera.aspect));
  const range = system.radius / Math.sin(halfFov) * 1.06;
  controls.target.copy(system.center);
  camera.position.copy(system.center).addScaledVector(new THREE.Vector3(0.13, 0.24, 1).normalize(), range);
  controls.update();
}
$('reset-view').addEventListener('click', fitMap);
$('zoom-out').addEventListener('click', () => {
  if (!controls) return;
  camera.position.sub(controls.target).multiplyScalar(1.9).add(controls.target);
  controls.update();
});
function setTrueSize(value) {
  trueSize = value;
  for (const body of bodies) if (body.rings) body.rings.visible = !trueSize;
  $('scale-toggle').setAttribute('aria-pressed', String(trueSize));
  $('scale-toggle').querySelector('span').textContent = `TRUE SIZE: ${trueSize ? 'ON' : 'OFF'}`;
}
$('scale-toggle').addEventListener('click', () => setTrueSize(!trueSize));

function locationOf(value) {
  return value === '@position' ? userPosition : activeBodies.find(body => body.name === value)?.position;
}
function updateMeasurement() {
  $('route-point').hidden = true;
  if (routeMarker) routeMarker.visible = false;
  const from = $('measure-from').value;
  const to = $('measure-to').value;
  const a = locationOf(from), b = locationOf(to);
  if (measureLine) { scene.remove(measureLine); measureLine.geometry.dispose(); measureLine.material.dispose(); measureLine = null; }
  if (!a || !b) { $('measurement').textContent = 'Locate yourself first to measure from your position.'; return; }
  const metres = distance(a, b);
  const bodyA = bodies.find(body => body.name === from);
  const bodyB = bodies.find(body => body.name === to);
  const gap = bodyA?.radius === null || bodyB?.radius === null
    ? 'N/A' : formatMetres(metres - (bodyA?.radius ?? 0) - (bodyB?.radius ?? 0));
  const delta = b.map((v, i) => v - a[i]);
  $('measurement').replaceChildren();
  const title = document.createElement('strong'); title.textContent = formatMetres(metres);
  const detail = document.createElement('small');
  detail.textContent = `Surface gap: ${gap} · ΔX ${formatMetres(delta[0])} · ΔY ${formatMetres(delta[1])} · ΔZ ${formatMetres(delta[2])}`;
  $('measurement').append(title, detail);
  measureLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([scenePoint(a), scenePoint(b)]), new THREE.LineDashedMaterial({ color: 0x6ee4d0, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.85, depthTest: false }));
  measureLine.userData.endpoints = [a, b];
  measureLine.computeLineDistances();
  scene.add(measureLine);
}
function selectRoutePoint(fraction) {
  const [a, b] = measureLine.userData.endpoints;
  const position = a.map((value, i) => value + (b[i] - value) * fraction);
  const metres = distance(position, bodies.find(body => body.name === 'Sun').position);
  if (!routeMarker) {
    routeMarker = new THREE.Mesh(hitSphere, new THREE.MeshBasicMaterial({ color: 0xedba7d, depthTest: false }));
    routeMarker.renderOrder = 1;
    scene.add(routeMarker);
  }
  routeMarker.position.copy(scenePoint(position));
  routeMarker.visible = true;
  const title = document.createElement('strong');
  title.textContent = `${formatMetres(metres)} from ${activeWorld === 0 ? 'Sun' : 'GPS origin'}`;
  const detail = document.createElement('small');
  detail.textContent = `${metres.toLocaleString('en-US', { maximumFractionDigits: 1 })} m · ${(fraction * 100).toFixed(1)}% along ${$('measure-from').value === '@position' ? 'your position' : $('measure-from').value} → ${$('measure-to').value === '@position' ? 'your position' : $('measure-to').value}`;
  $('route-point').replaceChildren(title, detail);
  $('route-point').hidden = false;
}
for (const select of [$('measure-from'), $('measure-to')]) {
  select.addEventListener('change', updateMeasurement);
}
function changeWorld() {
  activeWorld = Number($('map-world').value);
  activeBodies = bodies.filter(body => body.world === activeWorld);
  meshes.length = 0;
  for (const body of bodies) {
    body.group.visible = body.world === activeWorld;
    if (body.group.visible) meshes.push(body.hit);
  }
  filterBodyList();
  const worldName = activeWorld === 0 ? 'REGULAR UNIVERSE' : 'THROUGH THE BLACK HOLE';
  $('charted-world').textContent = worldName;
  $('charted-count').textContent = `${activeBodies.length} CHARTED OBJECTS`;
  $('map-title').textContent = worldName;
  $('map-status').textContent = activeWorld === 0 ? 'SUN-CENTRED CHART' : 'SEPARATE WORMHOLE WORLD';
  $('body-count').textContent = `${activeBodies.length} OBJECTS`;
  $('gps-centre-label').textContent = activeWorld === 0 ? 'CENTRE · SUN-CENTRED GPS' : 'CENTRE · GPS ORIGIN COORDINATES';
  $('route-hint').textContent = `Click anywhere on the dashed route to see that point's straight-line distance to ${activeWorld === 0 ? 'the Sun' : 'the GPS coordinate origin (not a Sun in this world)'}. Measurements and location lookup use only this map. Surface gap uses spherical mean radii; negative means overlap. No orbit or travel-time prediction.`;
  for (const select of [$('measure-from'), $('measure-to')]) {
    select.replaceChildren(...activeBodies.map(body => new Option(body.name, body.name)), new Option('Your position', '@position'));
  }
  $('measure-to').value = activeWorld === 0 ? 'Sun' : activeBodies[1].name;
  userPosition = null;
  if (userMarker) userMarker.visible = false;
  $('position-result').classList.remove('error');
  $('position-result').textContent = 'Choose the map matching your game world, then enter Space GPS readings and press Locate me.';
  selectBody(selected.world === activeWorld ? selected : activeBodies[0]);
  fitMap();
}
$('map-world').addEventListener('change', changeWorld);
changeWorld();

function locate(position) {
  userPosition = position;
  const nearby = nearestBody(position, activeBodies);
  const name = nearby.body.name;
  const surface = nearby.surface == null ? 'not defined for this anomaly' : `${formatMetres(nearby.surface)} ${nearby.surface < 0 ? 'below mean surface' : 'from mean surface'}`;
  $('position-result').classList.remove('error');
  $('position-result').textContent = `Nearest body: ${name} · ${formatMetres(nearby.centre)} to centre · ${surface}.`;
  if (!userMarker) {
    userMarker = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9cf3e4, depthTest: false }));
    userMarker.add(core);
    userMarker.add(makeGlow('#6fe8d4', 0.6));
    scene.add(userMarker);
    const label = document.createElement('span'); label.className = 'body-label marker-label'; label.textContent = 'YOUR POSITION'; $('labels').append(label);
    labels.push({ position: userMarker.position, element: label, body: null });
  }
  userMarker.position.copy(scenePoint(position));
  userMarker.visible = true;
  setTrueSize(false);
  focus(userMarker.position, Math.max(14, Math.min(75, nearby.centre / METRES_PER_UNIT * 1.4)));
  updateMeasurement();
}
$('coordinate-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const [radius, longitude, latitude] = parseGps($('gps-distance').value, $('gps-longitude').value, $('gps-latitude').value);
    locate(sphericalToCartesian(radius, longitude, latitude));
  }
  catch (error) { $('position-result').classList.add('error'); $('position-result').textContent = error.message; }
});

if (renderer) {
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const routeStart = new THREE.Vector3();
  const routeEnd = new THREE.Vector3();
  const routePoint = new THREE.Vector3();
  const routeProjected = new THREE.Vector3();
  const routeDelta = new THREE.Vector3();
  let start = null;
  renderer.domElement.addEventListener('pointerdown', event => { start = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!start || Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (measureLine) {
      const [a, b] = measureLine.userData.endpoints;
      routeStart.fromArray(a).multiplyScalar(1 / METRES_PER_UNIT);
      routeEnd.fromArray(b).multiplyScalar(1 / METRES_PER_UNIT);
      raycaster.ray.distanceSqToSegment(routeStart, routeEnd, undefined, routePoint);
      routeProjected.copy(routePoint).project(camera);
      const pixelDistance = Math.hypot((routeProjected.x - pointer.x) * rect.width / 2, (routeProjected.y - pointer.y) * rect.height / 2);
      if (routeProjected.z >= -1 && routeProjected.z <= 1 && pixelDistance <= 8) {
        routeDelta.copy(routeEnd).sub(routeStart);
        const lengthSquared = routeDelta.lengthSq();
        const fraction = lengthSquared ? routePoint.sub(routeStart).dot(routeDelta) / lengthSquared : 0;
        selectRoutePoint(THREE.MathUtils.clamp(fraction, 0, 1));
        return;
      }
    }
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (hit) selectBody(hit.object.userData.body);
  });
  const resize = () => {
    const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
  };
  new ResizeObserver(resize).observe(canvasHost);
  resize();
  fitMap();
  const projected = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const labelDirection = new THREE.Vector3();
  const occluderDirection = new THREE.Vector3();
  const occupied = [];
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const unitPerPixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / canvasHost.clientHeight;
    for (const body of activeBodies) {
      const base = body.radius == null ? 0 : body.radius / METRES_PER_UNIT;
      const distanceToCamera = camera.position.distanceTo(body.group.position);
      body.renderRadius = trueSize ? base || 3 : Math.max(base, distanceToCamera * unitPerPixel * (body.kind === 'Star' ? 22 : 18), body === selected ? 8 : 0);
      if (body.surface) body.surface.scale.setScalar(body.renderRadius);
      if (body.rings) body.rings.scale.setScalar(body.renderRadius / 2.7);
      if (body.anomalyScales) body.visuals.forEach((visual, index) => visual.scale.copy(body.anomalyScales[index]).multiplyScalar(body.renderRadius / 3));
      body.hit.scale.setScalar(Math.max(body.renderRadius, distanceToCamera * unitPerPixel * 12));
    }
    if (routeMarker?.visible) routeMarker.scale.setScalar(camera.position.distanceTo(routeMarker.position) * unitPerPixel * 6);
    camera.getWorldDirection(forward);
    occupied.length = 0;
    for (const { position, element, body } of labels) {
      if (body ? !body.group.visible : !userMarker?.visible) { element.hidden = true; continue; }
      projected.copy(position).project(camera);
      labelDirection.copy(position).sub(camera.position);
      const labelDistance = labelDirection.length();
      let visible = labelDirection.dot(forward) > 0 && Math.abs(projected.x) < 1.06 && Math.abs(projected.y) < 1.06;
      if (visible && body && labelDistance > 0) {
        labelDirection.divideScalar(labelDistance);
        for (const other of activeBodies) {
          if (other === body) continue;
          occluderDirection.copy(other.group.position).sub(camera.position);
          const along = occluderDirection.dot(labelDirection);
          if (along <= 0) continue;
          const perpendicularSquared = Math.max(0, occluderDirection.lengthSq() - along * along);
          const radiusSquared = other.renderRadius * other.renderRadius;
          if (perpendicularSquared >= radiusSquared) continue;
          const nearSurface = along - Math.sqrt(radiusSquared - perpendicularSquared);
          if (nearSurface > 0 && nearSurface < labelDistance - body.renderRadius) { visible = false; break; }
        }
      }
      if (!visible) { element.hidden = true; continue; }
      const x = (projected.x + 1) * canvasHost.clientWidth / 2;
      const y = (1 - projected.y) * canvasHost.clientHeight / 2;
      const left = x + (body ? body.renderRadius / labelDistance / unitPerPixel : 0) + 9;
      const right = left + element.textContent.length * 7 + 14;
      const overlaps = occupied.some(box => left < box.right && right > box.left && y - 11 < box.bottom && y + 11 > box.top);
      element.hidden = overlaps;
      if (overlaps) continue;
      occupied.push({ left, right, top: y - 11, bottom: y + 11 });
      element.style.left = `${left - 9}px`;
      element.style.top = `${y}px`;
      element.classList.toggle('active', body === selected);
    }
    renderer.render(scene, camera);
  }
  animate();
}
