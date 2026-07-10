// ============================================================
// 泄流可视化 — 宽幅水幕 + 水雾 + 底部水花（BIM 工业流体）
// ============================================================
import * as THREE from 'three'

export const GATE_SILL_Y = 4.5
export const LINTEL_BOTTOM_Y = 15.5
export const DISCHARGE_X = 6.2
/** 闸门开孔满宽（与 bay 宽 3.2 对齐，略外扩铺满） */
export const GATE_OPENING_WIDTH = 2.85

const GATE_LEAF_BASE = 6
const GATE_LIFT = 7
const GATE_HALF_H = 5

export interface DischargeMetrics {
  visible: boolean
  topY: number
  fallH: number
  width: number
  thickness: number
  mistSpread: number
  splashSize: number
  opening: number
}

const INVISIBLE: DischargeMetrics = {
  visible: false,
  topY: 0,
  fallH: 0,
  width: 0,
  thickness: 0,
  mistSpread: 0,
  splashSize: 0,
  opening: 0,
}

function waterfallMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpening: { value: 0.5 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpening;
      varying vec2 vUv;

      void main() {
        float flow = fract(vUv.y * 2.2 - uTime * 0.95);
        float streak = smoothstep(0.0, 0.08, flow) * (1.0 - smoothstep(0.38, 0.58, flow));
        float refr = 0.12 + streak * 0.22;

        vec3 topCol = vec3(0.72, 0.9, 0.98);
        vec3 midCol = vec3(0.35, 0.68, 0.92);
        vec3 botCol = vec3(0.12, 0.42, 0.72);
        vec3 col = mix(botCol, midCol, smoothstep(0.0, 0.55, vUv.y));
        col = mix(col, topCol, smoothstep(0.55, 1.0, vUv.y));
        col += vec3(0.35, 0.45, 0.5) * refr;

        float foam = smoothstep(0.92, 1.0, vUv.y) * (0.55 + streak * 0.35);
        col = mix(col, vec3(0.92, 0.97, 1.0), foam);

        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float topFade = smoothstep(0.0, 0.04, vUv.y);
        float botFade = smoothstep(1.0, 0.9, vUv.y);
        float alpha = edge * topFade * botFade * (0.32 + uOpening * 0.48);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  })
}

function splashMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpening: { value: 0.5 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpening;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float ripple = sin(d * 14.0 - uTime * 3.5) * 0.5 + 0.5;
        float foam = smoothstep(0.85, 0.2, d) * (0.4 + ripple * 0.35);
        vec3 col = mix(vec3(0.5, 0.78, 0.95), vec3(0.95, 0.98, 1.0), foam);
        float alpha = foam * (0.25 + uOpening * 0.45) * smoothstep(1.0, 0.3, d);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

export function gateOutletY(openRatio: number, baseY = GATE_LEAF_BASE, lift = GATE_LIFT, halfH = GATE_HALF_H) {
  const r = Math.min(1, Math.max(0, openRatio))
  const leafY = baseY + r * lift
  const scaleY = 1 - r * 0.45
  return leafY - halfH * scaleY
}

export function computeDischargeMetrics(
  openRatio: number,
  downstreamY: number,
  leafBottomY?: number,
): DischargeMetrics {
  const r = Math.min(1, Math.max(0, openRatio))
  if (r < 0.02) return { ...INVISIBLE, opening: r }

  let topY = leafBottomY ?? gateOutletY(r)
  topY = Math.min(topY, LINTEL_BOTTOM_Y - 0.08)

  const bottomY = downstreamY + 0.08
  const fallH = topY - bottomY
  if (fallH < 0.5) return { ...INVISIBLE, opening: r }

  return {
    visible: true,
    topY,
    fallH,
    width: GATE_OPENING_WIDTH,
    thickness: 0.22 + r * 0.42,
    mistSpread: 0.6 + r * 2.2,
    splashSize: 1.2 + r * 1.8,
    opening: r,
  }
}

export interface DischargeJetParts {
  group: THREE.Group
  main: THREE.Mesh
  mist: THREE.Points
  splash: THREE.Mesh
}

export function createDischargeJetGroup(): DischargeJetParts {
  const group = new THREE.Group()

  const mainGeo = new THREE.PlaneGeometry(GATE_OPENING_WIDTH, 12, 1, 40)
  const main = new THREE.Mesh(mainGeo, waterfallMaterial())
  main.rotation.y = Math.PI / 2
  main.name = 'dischargeMain'
  main.userData.baseHeight = 12
  main.userData.baseWidth = GATE_OPENING_WIDTH

  const mistCount = 120
  const mistPos = new Float32Array(mistCount * 3)
  const mistSeeds = new Float32Array(mistCount)
  for (let i = 0; i < mistCount; i++) {
    mistPos[i * 3] = (Math.random() - 0.5) * 2
    mistPos[i * 3 + 1] = Math.random() * 8
    mistPos[i * 3 + 2] = (Math.random() - 0.5) * 1.2
    mistSeeds[i] = Math.random()
  }
  const mistGeo = new THREE.BufferGeometry()
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3))
  mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(mistSeeds, 1))
  const mist = new THREE.Points(
    mistGeo,
    new THREE.PointsMaterial({
      color: 0xb8dff5,
      size: 2.8,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.NormalBlending,
    }),
  )
  mist.name = 'dischargeMist'

  const splash = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2, 1, 1),
    splashMaterial(),
  )
  splash.rotation.x = -Math.PI / 2
  splash.name = 'dischargeSplash'

  group.add(main, mist, splash)
  return { group, main, mist, splash }
}

export function layoutDischargeJet(parts: DischargeJetParts, m: DischargeMetrics, downstreamY: number) {
  const { main, mist, splash } = parts
  if (!m.visible || m.fallH < 0.4) {
    parts.group.visible = false
    return
  }
  parts.group.visible = true

  const baseH = (main.userData.baseHeight as number) || 12
  const baseW = (main.userData.baseWidth as number) || GATE_OPENING_WIDTH
  main.scale.set(m.width / baseW, m.fallH / baseH, 1)
  main.position.set(DISCHARGE_X, m.topY - m.fallH * 0.5, 0)

  splash.scale.set(m.splashSize, m.splashSize * 0.55, 1)
  splash.position.set(DISCHARGE_X + 0.35, downstreamY + 0.12, 0)

  mist.position.set(DISCHARGE_X, m.topY - m.fallH * 0.45, 0)
  mist.scale.set(m.mistSpread * 0.45, m.fallH * 0.35, m.mistSpread * 0.25)
  const mistMat = mist.material as THREE.PointsMaterial
  mistMat.opacity = 0.12 + m.opening * 0.32
  mistMat.size = 1.8 + m.opening * 2.2

  const setUniforms = (mesh: THREE.Mesh, mat: THREE.ShaderMaterial) => {
    mat.uniforms.uOpening.value = m.opening
  }
  if (main.material instanceof THREE.ShaderMaterial) setUniforms(main, main.material)
  if (splash.material instanceof THREE.ShaderMaterial) setUniforms(splash, splash.material)
}

export function animateDischargeJet(parts: DischargeJetParts, t: number, m: DischargeMetrics) {
  if (!parts.group.visible) return
  if (parts.main.material instanceof THREE.ShaderMaterial) {
    parts.main.material.uniforms.uTime.value = t
    parts.main.material.uniforms.uOpening.value = m.opening
  }
  if (parts.splash.material instanceof THREE.ShaderMaterial) {
    parts.splash.material.uniforms.uTime.value = t
    parts.splash.material.uniforms.uOpening.value = m.opening
  }
  const pos = parts.mist.geometry.attributes.position as THREE.BufferAttribute
  const seeds = parts.mist.geometry.attributes.aSeed as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const seed = seeds.getX(i)
    let y = pos.getY(i) - 0.018 - m.opening * 0.012
    if (y < 0) y = m.fallH * 0.35 * Math.random()
    pos.setY(i, y)
    pos.setX(i, pos.getX(i) + Math.sin(t * 1.2 + seed) * 0.006)
  }
  pos.needsUpdate = true
}

/** @deprecated */
export const createDischargeWaterfall = () => createDischargeJetGroup().main
export const layoutDischargeWaterfall = (mesh: THREE.Mesh, m: DischargeMetrics) => {
  layoutDischargeJet({ group: mesh.parent as THREE.Group, main: mesh, mist: mesh.parent?.getObjectByName('dischargeMist') as THREE.Points, splash: mesh.parent?.getObjectByName('dischargeSplash') as THREE.Mesh }, m, m.topY - m.fallH)
}
