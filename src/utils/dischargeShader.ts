// ============================================================
// 泄洪湍流着色器 — 白色水流喷射 + 泡沫
// ============================================================
import * as THREE from 'three'

export function createDischargeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vNoise;

      float hash(float n) { return fract(sin(n) * 43758.5453); }

      void main() {
        vUv = uv;
        vec3 pos = position;
        float t = uTime * 3.5;
        float n = sin(pos.y * 8.0 + t) * cos(pos.z * 6.0 + t * 1.2) * 0.08;
        pos.x += n;
        pos.z += sin(pos.y * 12.0 - t * 2.0) * 0.05;
        vNoise = n;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vNoise;

      void main() {
        float t = uTime * 4.0;
        float streak = sin(vUv.y * 40.0 - t) * 0.5 + 0.5;
        float foam = smoothstep(0.55, 0.95, streak + vNoise * 2.0);
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);

        vec3 deep = vec3(0.65, 0.82, 0.98);
        vec3 white = vec3(0.98, 0.99, 1.0);
        vec3 col = mix(deep, white, foam * 0.92 + 0.08);
        col += vec3(1.0, 0.92, 0.75) * foam * 0.15;

        float alpha = (0.65 + foam * 0.35) * edge * uIntensity;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
}

export function createDischargeSheet(width = 3.8, height = 14): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, height, 24, 48)
  const mat = createDischargeMaterial()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.y = Math.PI / 2
  return mesh
}
