<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createWaterMaterial } from '@/utils/waterShader'
import { createCinematicSky } from '@/utils/cinematicSky'
import { simulationSceneToWeather } from '@/utils/weatherSystem'
import { createDischargeSheet } from '@/utils/dischargeShader'
import { buildValleyTerrain, buildRiverbed, buildDistantRidgeline, buildForestHillside, buildFoamZone } from '@/utils/terrainBuilder'
import { loadDamModel, getDamHeroCamera, getTwinAerialCamera, collectDamMeshes, type DamModelInstance } from '@/utils/damModelLoader'
import { XIANGJIABA_HYDRO, upstreamLevelToSceneY, getLevelStatus, levelGaugePercent } from '@/constants/xiangjiaba'
import type { SimulationScene } from '@/types/simulation'

const props = withDefaults(defineProps<{
  waterLevel?: number
  downstreamLevel?: number
  gateOpening?: number
  flowRate?: number
  autoRotate?: boolean
  simScene?: SimulationScene
  /** twin = 数字孪生驾驶舱俯视风格 */
  visualMode?: 'default' | 'twin'
}>(), {
  waterLevel: XIANGJIABA_HYDRO.normalPoolLevel,
  downstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
  gateOpening: 45,
  flowRate: XIANGJIABA_HYDRO.normalInflow,
  autoRotate: false,
  simScene: 'normal',
  visualMode: 'twin',
})

const levelStatus = computed(() => getLevelStatus(props.waterLevel))
const gaugePct = computed(() => levelGaugePercent(props.waterLevel))
const levelDelta = computed(() => props.waterLevel - XIANGJIABA_HYDRO.normalPoolLevel)

const emit = defineEmits<{
  'device-hover': [payload: { name: string; detail: string } | null]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const damModelLabel = ref('加载中…')
const tooltip = ref<{ name: string; detail: string; x: number; y: number; visible: boolean }>({
  name: '', detail: '', x: 0, y: 0, visible: false,
})

const DEFAULT_CAMERA = {
  pos: new THREE.Vector3(52, 18, 42),
  target: new THREE.Vector3(4, 14, 0),
}
const TWIN_CAMERA = {
  pos: new THREE.Vector3(48, 52, 56),
  target: new THREE.Vector3(2, 12, 0),
}

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let composer: EffectComposer | null = null
let outlinePass: OutlinePass | null = null
let bokehPass: BokehPass | null = null
let bloomPass: UnrealBloomPass | null = null
let animId = 0
let clock = new THREE.Clock()
let cinematicSky: ReturnType<typeof createCinematicSky> | null = null
let sunLight: THREE.DirectionalLight | null = null
let damSpotLight: THREE.SpotLight | null = null
let damSpotTarget: THREE.Object3D | null = null
let ambientLight: THREE.AmbientLight | null = null
let hemiLight: THREE.HemisphereLight | null = null
let godRayGroup: THREE.Group | null = null
let godRayBaseOpacity: number[] = []

let upstreamWater: THREE.Mesh | null = null
let downstreamWater: THREE.Mesh | null = null
let upstreamMat: THREE.ShaderMaterial | null = null
let downstreamMat: THREE.ShaderMaterial | null = null
let damGroup: THREE.Group | null = null
let damInstance: DamModelInstance | null = null
let damOutlineMeshes: THREE.Object3D[] = []
let dischargeGroup: THREE.Group | null = null
let mistGroup: THREE.Group | null = null
let raycaster = new THREE.Raycaster()
let mouse = new THREE.Vector2()
let hoverables: THREE.Object3D[] = []
let hoveredObject: THREE.Object3D | null = null

function initScene() {
  const el = containerRef.value
  if (!el) return

  const w = el.clientWidth
  const h = el.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(props.visualMode === 'twin' ? 0x050a14 : 0x0a1628)
  scene.fog = new THREE.FogExp2(props.visualMode === 'twin' ? 0x0a1828 : 0x1a2838, props.visualMode === 'twin' ? 0.0018 : 0.0038)

  camera = new THREE.PerspectiveCamera(36, w / h, 0.5, 600)
  const camPreset = props.visualMode === 'twin' ? TWIN_CAMERA : DEFAULT_CAMERA
  camera.position.copy(camPreset.pos)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.9
  renderer.outputColorSpace = THREE.SRGBColorSpace
  el.appendChild(renderer.domElement)

  cinematicSky = createCinematicSky(renderer, simulationSceneToWeather(props.simScene))
  scene.add(cinematicSky.mesh)
  scene.environment = cinematicSky.envMap

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.045
  controls.maxPolarAngle = Math.PI / 2.06
  controls.minDistance = 18
  controls.maxDistance = 85
  controls.target.copy(camPreset.target)
  controls.autoRotate = props.autoRotate || props.visualMode === 'twin'
  controls.autoRotateSpeed = props.visualMode === 'twin' ? 0.12 : 0.22

  ambientLight = new THREE.AmbientLight(0x2a3850, 0.42)
  scene.add(ambientLight)
  hemiLight = new THREE.HemisphereLight(0x5588aa, 0x1a2838, 0.52)
  scene.add(hemiLight)

  sunLight = new THREE.DirectionalLight(0xffcc88, 0.65)
  sunLight.position.set(55, 75, 35)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.set(4096, 4096)
  sunLight.shadow.bias = -0.0008
  sunLight.shadow.normalBias = 0.02
  sunLight.shadow.camera.near = 10
  sunLight.shadow.camera.far = 250
  sunLight.shadow.camera.left = -70
  sunLight.shadow.camera.right = 70
  sunLight.shadow.camera.top = 70
  sunLight.shadow.camera.bottom = -70
  scene.add(sunLight)

  const fill = new THREE.DirectionalLight(0x6699cc, 0.38)
  fill.position.set(-50, 30, -40)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0x00d4ff, 0.18)
  rim.position.set(20, 15, -60)
  scene.add(rim)

  const damFill = new THREE.DirectionalLight(0xffeedd, 0.35)
  damFill.position.set(30, 20, 50)
  scene.add(damFill)

  damSpotTarget = new THREE.Object3D()
  damSpotTarget.position.set(0, 14, 0)
  scene.add(damSpotTarget)

  damSpotLight = new THREE.SpotLight(0xffffff, 3.2, 160, Math.PI / 5.5, 0.35, 1.2)
  damSpotLight.position.set(18, 38, 28)
  damSpotLight.target = damSpotTarget
  damSpotLight.castShadow = false
  scene.add(damSpotLight)

  godRayGroup = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    const baseOpacity = 0.004 + i * 0.001
    const ray = new THREE.Mesh(
      new THREE.ConeGeometry(12 + i * 4, 70 + i * 10, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffcc66,
        transparent: true,
        opacity: baseOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    ray.position.set(6 + i * 3, 42 + i * 6, 8 + i * 2)
    ray.rotation.x = -0.48 - i * 0.025
    ray.rotation.z = -0.12 + (i - 2) * 0.05
    godRayGroup.add(ray)
    godRayBaseOpacity.push(baseOpacity)
  }
  scene.add(godRayGroup)
  if (props.visualMode === 'twin') godRayGroup.visible = false

  scene.add(buildDistantRidgeline(cinematicSky.envMap))
  scene.add(buildValleyTerrain(cinematicSky.envMap))
  scene.add(buildForestHillside(cinematicSky.envMap))
  scene.add(buildRiverbed(cinematicSky.envMap))

  upstreamMat = createWaterMaterial({
    color: 0x1a5080,
    deepColor: 0x0a2540,
    opacity: 0.92,
    envMap: cinematicSky.envMap,
    waveScale: 0.42,
  })
  upstreamWater = new THREE.Mesh(new THREE.PlaneGeometry(48, 38, 128, 96), upstreamMat)
  upstreamWater.rotation.x = -Math.PI / 2
  upstreamWater.position.set(-16, 0, 0)
  upstreamWater.name = '上游水面'
  upstreamWater.userData.detail = '库区水位实时监测 · 物理流体动态'
  upstreamWater.receiveShadow = true
  scene.add(upstreamWater)
  hoverables.push(upstreamWater)

  downstreamMat = createWaterMaterial({
    color: 0x124870,
    deepColor: 0x081830,
    opacity: 0.88,
    envMap: cinematicSky.envMap,
    waveScale: 0.48,
  })
  downstreamWater = new THREE.Mesh(new THREE.PlaneGeometry(50, 30, 128, 64), downstreamMat)
  downstreamWater.rotation.x = -Math.PI / 2
  downstreamWater.position.set(24, 0.2, 0)
  downstreamWater.name = '下游水面'
  downstreamWater.userData.detail = '泄洪尾水 · 湍流泡沫与生态流量'
  downstreamWater.receiveShadow = true
  scene.add(downstreamWater)
  hoverables.push(downstreamWater)

  const foamZone = buildFoamZone(cinematicSky.envMap)
  scene.add(foamZone)
  hoverables.push(foamZone)

  void mountDamModel()

  dischargeGroup = new THREE.Group()
  scene.add(dischargeGroup)
  buildDischargeJets()

  mistGroup = new THREE.Group()
  scene.add(mistGroup)
  buildMist()

  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  outlinePass = new OutlinePass(new THREE.Vector2(w, h), scene, camera)
  outlinePass.edgeStrength = 5.5
  outlinePass.edgeGlow = 2.2
  outlinePass.edgeThickness = 2.4
  outlinePass.visibleEdgeColor.set('#00d4ff')
  outlinePass.hiddenEdgeColor.set('#006688')
  outlinePass.selectedObjects = []
  composer.addPass(outlinePass)

  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), props.visualMode === 'twin' ? 0.08 : 0.16, 0.55, 0.88)
  composer.addPass(bloomPass)

  bokehPass = new BokehPass(scene, camera, {
    focus: 42,
    aperture: props.visualMode === 'twin' ? 0 : 0.00012,
    maxblur: props.visualMode === 'twin' ? 0 : 0.008,
  })
  composer.addPass(bokehPass)

  composer.addPass(new OutputPass())

  updateScene()
  animate()

  renderer.domElement.addEventListener('mousemove', onMouseMove)
  renderer.domElement.addEventListener('mouseleave', onMouseLeave)
}

async function mountDamModel() {
  if (!scene || !cinematicSky) return
  damInstance = await loadDamModel(cinematicSky.envMap)
  damModelLabel.value = damInstance.gateLeaves.length > 0
    ? '向家坝实体大坝'
    : damInstance.fromGltf
      ? '混元 GLB 模型'
      : '程序化回退模型'
  damGroup = damInstance.root
  scene.add(damGroup)
  damInstance.hoverables.forEach((obj) => {
    if (!hoverables.includes(obj)) hoverables.push(obj)
  })
  if (outlinePass) {
    damOutlineMeshes = collectDamMeshes(damInstance.root)
    outlinePass.selectedObjects = damOutlineMeshes
  }
  if (damSpotTarget && damInstance.heroCenter) {
    damSpotTarget.position.copy(damInstance.heroCenter)
    damSpotTarget.position.y += 6
  }
  frameCameraOnDam()
  updateScene()
}

function frameCameraOnDam() {
  if (!damInstance || !camera || !controls) return
  const getter = props.visualMode === 'twin' ? getTwinAerialCamera : getDamHeroCamera
  const { position, target } = getter(damInstance.root, damInstance.heroCenter)
  camera.position.copy(position)
  controls.target.copy(target)
  controls.update()
  if (props.visualMode === 'twin') {
    TWIN_CAMERA.pos.copy(position)
    TWIN_CAMERA.target.copy(target)
  } else {
    DEFAULT_CAMERA.pos.copy(position)
    DEFAULT_CAMERA.target.copy(target)
  }
}

function buildDischargeJets() {
  if (!dischargeGroup) return
  dischargeGroup.clear()

  const bayZs = [-14.25, -6.75, 0.75, 8.25, 16.0]
  for (let i = 0; i < bayZs.length; i++) {
    const z = bayZs[i]
    const jetGroup = new THREE.Group()
    jetGroup.name = `jetGroup_${i}`

    const sheet = createDischargeSheet(3.6, 15)
    sheet.position.set(7.5, 4, 0)
    jetGroup.add(sheet)

    const sheet2 = createDischargeSheet(2.4, 10)
    sheet2.position.set(9, 1.2, 0.4)
    sheet2.rotation.z = 0.06
    jetGroup.add(sheet2)

    const count = 280
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    for (let j = 0; j < count; j++) {
      positions[j * 3] = 5 + Math.random() * 2.5
      positions[j * 3 + 1] = 6 + Math.random() * 3
      positions[j * 3 + 2] = (Math.random() - 0.5) * 3.2
      velocities[j * 3] = 0.28 + Math.random() * 0.32
      velocities[j * 3 + 1] = -0.12 - Math.random() * 0.22
      velocities[j * 3 + 2] = (Math.random() - 0.5) * 0.08
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xe8f4ff,
        size: 0.45,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    )
    pts.userData = { z, velocities, count }
    pts.name = `jet_${i}`
    jetGroup.position.set(0, 0, z)
    jetGroup.add(pts)
    dischargeGroup.add(jetGroup)
  }
}

function buildMist() {
  if (!mistGroup) return
  mistGroup.clear()

  for (let i = 0; i < 12; i++) {
    const z = -18 + i * 3.2
    const count = 160
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let j = 0; j < count; j++) {
      positions[j * 3] = 10 + Math.random() * 16
      positions[j * 3 + 1] = Math.random() * 7
      positions[j * 3 + 2] = z + (Math.random() - 0.5) * 8
      seeds[j] = Math.random() * Math.PI * 2
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

    const mist = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffeedd,
        size: 2.8,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    )
    mist.name = `mist_${i}`
    mist.userData.seeds = seeds
    mistGroup.add(mist)
  }
}

function updateScene() {
  if (!upstreamWater) return

  const waterY = upstreamLevelToSceneY(props.waterLevel)
  upstreamWater.position.y = waterY
  if (downstreamWater) {
    const dsNorm = (props.downstreamLevel - 277) / 3
    downstreamWater.position.y = 0.8 + dsNorm * 1.5
  }

  const openRatio = props.gateOpening / 100
  if (damInstance) {
    damInstance.applyGateOpening(openRatio)
  } else if (damGroup) {
    damGroup.traverse((obj) => {
      if (obj.name.startsWith('gateLeaf_')) {
        obj.position.y = 6 + openRatio * 7
        obj.scale.y = 1 - openRatio * 0.45
      }
    })
  }

  const flowFactor = props.flowRate / 2000
  if (upstreamMat) upstreamMat.uniforms.uFlowSpeed.value = 0.75 + flowFactor * 0.75
  if (downstreamMat) downstreamMat.uniforms.uFlowSpeed.value = 0.95 + flowFactor * 0.95

  if (dischargeGroup) {
    dischargeGroup.visible = openRatio > 0.03
    dischargeGroup.children.forEach((g) => {
      g.scale.setScalar(0.35 + openRatio * 0.9)
      g.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
          child.material.uniforms.uIntensity.value = openRatio
        }
        if (child instanceof THREE.Points) {
          (child.material as THREE.PointsMaterial).opacity = openRatio * 0.88
        }
      })
    })
  }
  if (mistGroup) mistGroup.visible = true
}

function applyWeatherFromScene() {
  if (props.visualMode === 'twin') {
    cinematicSky?.setWeather('clear')
    return
  }
  cinematicSky?.setWeather(simulationSceneToWeather(props.simScene))
}

function animateDischarge(t: number) {
  if (!dischargeGroup || props.gateOpening <= 0) return
  const speed = (props.flowRate / 2000) * 1.9
  const openRatio = props.gateOpening / 100

  dischargeGroup.children.forEach((g) => {
    g.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        child.material.uniforms.uTime.value = t
        child.material.uniforms.uIntensity.value = openRatio
      }
      if (child instanceof THREE.Points && child.name.startsWith('jet_')) {
        const ud = child.userData
        const pos = child.geometry.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < ud.count; i++) {
          let x = pos.getX(i) + ud.velocities[i * 3] * speed
          let y = pos.getY(i) + ud.velocities[i * 3 + 1] * speed
          let z = pos.getZ(i) + ud.velocities[i * 3 + 2]
          if (x > 24 || y < -0.5) {
            x = 6 + Math.random() * 1.5
            y = 5 + Math.random() * 2.2
            z = (Math.random() - 0.5) * 2.8
          }
          pos.setXYZ(i, x, y, z)
        }
        pos.needsUpdate = true
      }
    })
  })
}

function animateMist(t: number) {
  if (!mistGroup || !cinematicSky) return
  const openRatio = props.gateOpening / 100
  const mistMul = cinematicSky.currentWeather.mistMultiplier

  mistGroup.children.forEach((mist, idx) => {
    const pts = mist as THREE.Points
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute
    const mat = pts.material as THREE.PointsMaterial
    const seeds = pts.userData.seeds as Float32Array
    const base = 0.14 + openRatio * 0.32
    mat.opacity = base * mistMul
    mat.color.setHex(0xffeedd)
    mat.size = 2.6 + Math.sin(t * 0.6 + idx) * 0.45

    for (let i = 0; i < pos.count; i++) {
      const bx = pos.getX(i)
      const seed = seeds[i]
      let by = pos.getY(i) + Math.sin(t * 0.7 + seed + idx) * 0.012 + 0.003
      const bz = pos.getZ(i) + Math.cos(t * 0.45 + seed) * 0.006 + t * 0.004
      by = Math.max(0, Math.min(8, by))
      pos.setXYZ(i, bx, by, bz)
    }
    pos.needsUpdate = true
  })
}

function animateGodRays(t: number) {
  if (!godRayGroup || !cinematicSky) return
  const rayMul = cinematicSky.currentWeather.rayStrength
  godRayGroup.children.forEach((ray, i) => {
    const mat = (ray as THREE.Mesh).material as THREE.MeshBasicMaterial
    const base = godRayBaseOpacity[i] ?? 0.03
    mat.opacity = (base + Math.sin(t * 0.35 + i * 1.2) * 0.002) * rayMul * 0.08
    mat.color.copy(cinematicSky!.currentWeather.sunColor)
    ray.rotation.z = (i - 1) * 0.08 + Math.sin(t * 0.15 + i) * 0.03
  })
}

function syncSunLight(dt: number) {
  if (!cinematicSky || !sunLight || !scene || !renderer) return
  const t = clock.getElapsedTime()
  cinematicSky.update(t, dt)
  cinematicSky.applyToScene(scene, { sun: sunLight, ambient: ambientLight, hemi: hemiLight }, renderer)
  const dir = cinematicSky.uniforms.uSunDir.value
  const sunCol = cinematicSky.currentWeather.sunColor
  if (upstreamMat) {
    upstreamMat.uniforms.uSunDirection.value.copy(dir)
    upstreamMat.uniforms.uSunColor.value.copy(sunCol)
  }
  if (downstreamMat) {
    downstreamMat.uniforms.uSunDirection.value.copy(dir)
    downstreamMat.uniforms.uSunColor.value.copy(sunCol)
  }
}

function updateBokehFocus() {
  if (!bokehPass || !camera || !controls) return
  const dist = camera.position.distanceTo(controls.target)
  ;(bokehPass.uniforms as { focus: { value: number } }).focus.value = dist
}

function animate() {
  animId = requestAnimationFrame(animate)
  const dt = clock.getDelta()
  const t = clock.getElapsedTime()
  controls?.update()

  syncSunLight(dt)
  animateGodRays(t)

  if (upstreamMat) upstreamMat.uniforms.uTime.value = t
  if (downstreamMat) downstreamMat.uniforms.uTime.value = t

  animateDischarge(t)
  animateMist(t)
  updateBokehFocus()

  scene?.traverse((obj) => {
    if (obj.name.startsWith('gateLed_')) {
      const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial
      const pulse = 0.6 + Math.sin(t * 3 + parseInt(obj.name.split('_')[1]) * 0.8) * 0.4
      mat.emissiveIntensity = pulse * 1.5
    }
    if (obj.name.startsWith('phWindow_')) {
      const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial
      const flicker = 0.85 + Math.sin(t * 1.2 + obj.name.length) * 0.15
      mat.emissiveIntensity = 1.2 * flicker
    }
  })

  if (composer) composer.render()
  else if (renderer && scene && camera) renderer.render(scene, camera)
}

function findNamedRoot(obj: THREE.Object3D): THREE.Object3D | null {
  let cur: THREE.Object3D | null = obj
  while (cur) {
    if (cur.name === '向家坝电站厂房') return cur
    if (cur.name?.startsWith('phWindow_')) {
      let p: THREE.Object3D | null = cur.parent
      while (p) {
        if (p.name === '向家坝电站厂房') return p
        p = p.parent
      }
    }
    if (cur.name && cur.name !== '坝顶' && (
      cur.name.includes('坝') || cur.name.includes('闸门') || cur.name.includes('站')
      || cur.name.includes('厂房') || cur.name.includes('水面') || cur.name.startsWith('pier_')
    )) {
      return cur
    }
    cur = cur.parent
  }
  return obj.name ? obj : null
}

function getOutlineTarget(root: THREE.Object3D): THREE.Object3D {
  if (root.name === '向家坝电站厂房') return root
  return root
}

function onMouseMove(e: MouseEvent) {
  if (!containerRef.value || !camera || !scene || !outlinePass) return
  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(hoverables, true)

  if (hits.length > 0) {
    const root = findNamedRoot(hits[0].object)
    if (root?.name) {
      const outlineTarget = getOutlineTarget(root)
      if (hoveredObject !== outlineTarget) {
        hoveredObject = outlineTarget
        outlinePass.selectedObjects = [outlineTarget]
      }
      const detail = (root.userData.detail as string) || '向家坝水电站 BIM 工程构件'
      tooltip.value = { name: root.name, detail, x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 10, visible: true }
      emit('device-hover', { name: root.name, detail })
      containerRef.value.style.cursor = 'pointer'
      return
    }
  }

  hoveredObject = null
  outlinePass.selectedObjects = damOutlineMeshes.length ? damOutlineMeshes : []
  tooltip.value.visible = false
  emit('device-hover', null)
  containerRef.value.style.cursor = 'grab'
}

function onMouseLeave() {
  tooltip.value.visible = false
  emit('device-hover', null)
  if (outlinePass) outlinePass.selectedObjects = damOutlineMeshes.length ? damOutlineMeshes : []
  hoveredObject = null
  if (containerRef.value) containerRef.value.style.cursor = 'default'
}

function handleResize() {
  const el = containerRef.value
  if (!el || !camera || !renderer) return
  const w = el.clientWidth
  const h = el.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer?.setSize(w, h)
  outlinePass?.setSize(w, h)
  bloomPass?.setSize(w, h)
}

function resetView() {
  camera?.position.copy(DEFAULT_CAMERA.pos)
  controls?.target.copy(DEFAULT_CAMERA.target)
  controls?.update()
}

function zoomIn() { if (camera) camera.position.multiplyScalar(0.88) }
function zoomOut() { if (camera) camera.position.multiplyScalar(1.12) }
function setAutoRotate(v: boolean) { if (controls) controls.autoRotate = v }

defineExpose({ resetView, zoomIn, zoomOut, setAutoRotate })

watch(() => [props.waterLevel, props.downstreamLevel, props.gateOpening, props.flowRate], updateScene)
watch(() => props.autoRotate, (v) => setAutoRotate(v))
watch(() => props.simScene, () => applyWeatherFromScene())

onMounted(() => {
  initScene()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', handleResize)
  renderer?.domElement.removeEventListener('mousemove', onMouseMove)
  renderer?.domElement.removeEventListener('mouseleave', onMouseLeave)
  controls?.dispose()
  composer?.dispose()
  cinematicSky?.dispose()
  damInstance?.dispose()
  renderer?.dispose()
  if (containerRef.value && renderer?.domElement) containerRef.value.removeChild(renderer.domElement)
})
</script>

<template>
  <div ref="containerRef" class="three-scene" :class="{ 'three-scene--twin': visualMode === 'twin' }">
    <div v-if="visualMode !== 'twin'" class="three-scene__data-panel">
      <div class="three-scene__data-title">{{ XIANGJIABA_HYDRO.name }} · 实时水情</div>
      <div class="three-scene__data-row three-scene__data-row--main">
        <span>上游水位</span>
        <strong :style="{ color: levelStatus.color }">{{ waterLevel.toFixed(2) }} m</strong>
        <em :style="{ color: levelStatus.color }">{{ levelStatus.label }}</em>
      </div>
      <div class="three-scene__data-row">
        <span>下游尾水</span>
        <strong>{{ downstreamLevel.toFixed(2) }} m</strong>
      </div>
      <div class="three-scene__data-row">
        <span>入库流量</span>
        <strong>{{ flowRate }} m³/s</strong>
      </div>
      <div class="three-scene__data-row">
        <span>闸门开度</span>
        <strong>{{ gateOpening }}%</strong>
      </div>
      <div class="three-scene__gauge">
        <div class="three-scene__gauge-track">
          <div class="three-scene__gauge-fill" :style="{ height: gaugePct + '%' }" />
          <div class="three-scene__gauge-marker" style="bottom: 60%" title="正常蓄水 380m" />
          <div class="three-scene__gauge-marker three-scene__gauge-marker--warn" style="bottom: 75%" title="预警 381.5m" />
        </div>
        <div class="three-scene__gauge-labels">
          <span>{{ XIANGJIABA_HYDRO.crestElevation }}m 坝顶</span>
          <span>{{ XIANGJIABA_HYDRO.normalPoolLevel }}m 正常</span>
          <span>{{ XIANGJIABA_HYDRO.deadLevel }}m 死水位</span>
        </div>
      </div>
      <div class="three-scene__data-ref">
        较正常蓄水 {{ levelDelta >= 0 ? '+' : '' }}{{ levelDelta.toFixed(2) }}m · 汛限 {{ XIANGJIABA_HYDRO.floodLimitLevel }}m
      </div>
    </div>
    <div v-if="visualMode !== 'twin'" class="three-scene__badge" :class="{ 'is-fallback': damModelLabel === '程序化回退模型' }">
      {{ damModelLabel }}
    </div>
    <div v-if="tooltip.visible" class="three-scene__tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      <strong>{{ tooltip.name }}</strong>
      <span>{{ tooltip.detail }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.three-scene {
  width: 100%;
  height: 100%;
  min-height: 420px;
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(180deg, #0a1628 0%, #1a3050 50%, #0d2137 100%);
  border: 1px solid rgba(0, 212, 255, 0.22);
  box-shadow:
    inset 0 0 40px rgba(0, 80, 140, 0.25),
    0 4px 28px rgba(0, 40, 80, 0.35);

  &--twin {
    border: none;
    border-radius: 0;
    box-shadow: inset 0 0 80px rgba(0, 40, 80, 0.35);
    background: #050a14;
  }

  &__badge {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 9;
    padding: 4px 10px;
    font-size: 11px;
    color: #7efcff;
    background: rgba(0, 40, 60, 0.82);
    border: 1px solid rgba(0, 212, 255, 0.45);
    border-radius: 6px;
    pointer-events: none;

    &.is-fallback {
      color: #ffb86c;
      border-color: rgba(255, 160, 60, 0.55);
    }
  }

  &__data-panel {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 9;
    width: 196px;
    padding: 12px 14px;
    background: rgba(6, 14, 28, 0.9);
    border: 1px solid rgba(0, 212, 255, 0.42);
    border-radius: 10px;
    backdrop-filter: blur(12px);
    pointer-events: none;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  }

  &__data-title {
    font-size: 12px;
    font-weight: 700;
    color: #7efcff;
    margin-bottom: 10px;
    letter-spacing: 0.04em;
  }

  &__data-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 11px;
    color: rgba(200, 220, 240, 0.75);

    strong {
      margin-left: auto;
      font-size: 13px;
      color: #fff;
      font-weight: 700;
    }

    em {
      font-style: normal;
      font-size: 10px;
      font-weight: 600;
    }

    &--main strong {
      font-size: 16px;
    }
  }

  &__data-ref {
    margin-top: 8px;
    font-size: 10px;
    color: rgba(160, 190, 220, 0.65);
    line-height: 1.4;
  }

  &__gauge {
    display: flex;
    gap: 8px;
    margin: 10px 0 4px;
    align-items: stretch;
  }

  &__gauge-track {
    position: relative;
    width: 14px;
    height: 88px;
    border-radius: 7px;
    background: rgba(20, 40, 60, 0.8);
    border: 1px solid rgba(0, 180, 255, 0.3);
    overflow: hidden;
  }

  &__gauge-fill {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(0deg, #1a5080 0%, #00d4ff 100%);
    border-radius: 0 0 6px 6px;
    transition: height 0.6s ease;
  }

  &__gauge-marker {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: #2ed573;
    z-index: 1;

    &--warn {
      background: #ffa502;
    }
  }

  &__gauge-labels {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 9px;
    color: rgba(160, 190, 220, 0.7);
    line-height: 1.3;
    padding: 2px 0;
  }

  &__tooltip {
    position: absolute;
    z-index: 10;
    pointer-events: none;
    padding: 12px 16px;
    background: rgba(8, 14, 24, 0.88);
    border: 1px solid rgba(0, 180, 255, 0.55);
    border-radius: 8px;
    box-shadow:
      0 0 24px rgba(0, 160, 255, 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(10px);
    max-width: 280px;

    strong {
      display: block;
      font-size: 17px;
      font-weight: 700;
      color: #00d4ff;
      margin-bottom: 6px;
      text-shadow: 0 0 12px rgba(0, 212, 255, 0.45);
    }

    span {
      display: block;
      font-size: 13px;
      color: rgba(200, 220, 240, 0.78);
      line-height: 1.45;
    }
  }
}
</style>
