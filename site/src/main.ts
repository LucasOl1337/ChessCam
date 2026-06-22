import './styles.css';
import * as THREE from 'three';

const canvas = document.querySelector<HTMLCanvasElement>('#analysis-scene');

if (canvas) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(3.2, 4.2, 6.2);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  group.rotation.x = -0.46;
  group.rotation.z = -0.12;
  scene.add(group);

  const light = new THREE.DirectionalLight(0xe9fff6, 3.2);
  light.position.set(2, 5, 4);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xb8fff5, 0.85));

  const cream = new THREE.MeshStandardMaterial({ color: 0xece3c8, roughness: 0.72, metalness: 0.05 });
  const green = new THREE.MeshStandardMaterial({ color: 0x173d2a, roughness: 0.78, metalness: 0.03 });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x5f4129,
    roughness: 0.8,
    metalness: 0.02,
    transparent: true,
    opacity: 0.34,
  });
  const teal = new THREE.MeshBasicMaterial({ color: 0x30f5dc, transparent: true, opacity: 0.76 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0.84 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xd7c297, roughness: 0.58 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111817, roughness: 0.52, metalness: 0.18 });

  const boardBase = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.055, 5.1), wood);
  boardBase.position.y = -0.04;
  group.add(boardBase);

  for (let x = 0; x < 8; x += 1) {
    for (let z = 0; z < 8; z += 1) {
      const square = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.035, 0.6),
        (x + z) % 2 === 0 ? cream : green,
      );
      square.position.set((x - 3.5) * 0.6, 0.02, (z - 3.5) * 0.6);
      group.add(square);
    }
  }

  function addPiece(x: number, z: number, material: THREE.Material, height: number, radius: number) {
    const piece = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.2, 0.12, 24), material);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.48, height, 24), material);
    const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.68, 24, 16), material);
    body.position.y = height / 2 + 0.08;
    head.position.y = height + 0.2;
    piece.add(base, body, head);
    piece.position.set((x - 3.5) * 0.6, 0.08, (z - 3.5) * 0.6);
    group.add(piece);
    return piece;
  }

  addPiece(3, 4, amber, 0.62, 0.15);
  addPiece(4, 4, black, 0.52, 0.14);
  addPiece(2, 2, amber, 0.42, 0.12);
  addPiece(5, 5, black, 0.74, 0.16);
  addPiece(6, 3, black, 0.44, 0.12);

  const linePoints = [
    new THREE.Vector3(-0.3, 0.22, 0.3),
    new THREE.Vector3(0.9, 0.56, -0.9),
    new THREE.Vector3(-1.5, 0.42, -1.5),
    new THREE.Vector3(0.3, 0.22, 0.3),
  ];
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), blue);
  group.add(line);

  const ringGeometry = new THREE.TorusGeometry(0.25, 0.012, 12, 48);
  const focusRing = new THREE.Mesh(ringGeometry, teal);
  focusRing.position.set(-0.3, 0.33, 0.3);
  focusRing.rotation.x = Math.PI / 2;
  group.add(focusRing);

  const targetRing = focusRing.clone();
  targetRing.position.set(0.9, 0.66, -0.9);
  group.add(targetRing);

  const scanLines = new THREE.Group();
  for (let i = -3; i <= 3; i += 1) {
    const horizontal = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-2.4, 0.09, i * 0.6),
        new THREE.Vector3(2.4, 0.09, i * 0.6),
      ]),
      teal,
    );
    const vertical = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i * 0.6, 0.09, -2.4),
        new THREE.Vector3(i * 0.6, 0.09, 2.4),
      ]),
      teal,
    );
    scanLines.add(horizontal, vertical);
  }
  scanLines.visible = true;
  group.add(scanLines);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  let frame = 0;
  const animate = () => {
    frame += 1;
    group.rotation.z = -0.12 + Math.sin(frame * 0.008) * 0.025;
    focusRing.rotation.z += 0.012;
    targetRing.rotation.z -= 0.01;
    scanLines.children.forEach((child, index) => {
      const material = (child as THREE.Line).material as THREE.Material & { opacity?: number };
      material.opacity = 0.12 + Math.sin(frame * 0.025 + index) * 0.055;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  resize();
  animate();
  window.addEventListener('resize', resize);
}

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const value = button.dataset.copy;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    const original = button.textContent ?? 'Copiar';
    button.textContent = 'Copiado';
    window.setTimeout(() => {
      button.textContent = original;
    }, 1200);
  });
});
