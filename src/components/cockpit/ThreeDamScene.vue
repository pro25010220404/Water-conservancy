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
import {
  buildValleyTerrain,
  buildRiverbed,
  buildDistantRidgeline,
  buildForestHillside,
  buildFoamZone,
} from '@/utils/terrainBuilder'
import {
  loadDamModel,
  getDamHeroCamera,
  getTwinCinematicCamera,
  getPanoramaCamera,
  getSimulationFocusCamera,
  collectDamMeshes,
  applyTwinLightBackgroundMaterials,
  type DamModelInstance,
} from '@/utils/damModelLoader'
import {
  XIANGJIABA_HYDRO,
  upstreamLevelToSceneY,
  getLevelStatus,
  levelGaugePercent,
} from '@/constants/xiangjiaba'
import type { SimulationScene } from '@/types/simulation'

const props = withDefaults(
  defineProps<{
    waterLevel?: number
    downstreamLevel?: number
    gateOpening?: number
    flowRate?: number
    autoRotate?: boolean
    simScene?: SimulationScene
    /** twin = 数字孪生驾驶舱；panorama = 全景弹窗 */
    visualMode?: 'default' | 'twin' | 'panorama'
    /** 仿真运行中 — 触发镜头近景聚焦 */
    simRunning?: boolean
  }>(),
  {
    waterLevel: XIANGJIABA_HYDRO.normalPoolLevel,
    downstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
    gateOpening: 45,
    flowRate: XIANGJIABA_HYDRO.normalInflow,
    autoRotate: false,
    simScene: 'normal',
    visualMode: 'twin',
    simRunning: false,
  },
)

const levelStatus = computed(() => getLevelStatus(props.waterLevel))
const gaugePct = computed(() => levelGaugePercent(props.waterLevel))
const levelDelta = computed(() => props.waterLevel - XIANGJIABA_HYDRO.normalPoolLevel)

const emit = defineEmits<{
  'device-hover': [payload: { name: string; detail: string } | null]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const damModelLabel = ref('加载中…')
const tooltip = ref<{ name: string; detail: string; x: number; y: number; visible: boolean }>({
  name: '',
  detail: '',
  x: 0,
  y: 0,
  visible: false,
})

const DEFAULT_CAMERA = {
  pos: new THREE.Vector3(52, 18, 42),
  target: new THREE.Vector3(4, 14, 0),
}
const TWIN_CAMERA = {
  pos: new THREE.Vector3(48, 32, 58),
  target: new THREE.Vector3(4, 10, 0),
}
const PANORAMA_CAMERA = {
  pos: new THREE.Vector3(72, 38, 78),
  target: new THREE.Vector3(2, 12, 0),
}

const pierScreenLabels = ref<Array<{ name: string; x: number; y: number; visible: boolean }>>([])
const waterLevelScreenLabel = ref({ x: 0, y: 0, visible: false, text: '', color: '#1890ff' })
let pierObjects: THREE.Object3D[] = []
let waterLevelGroup: THREE.Group | null = null
let pipelineGroup: THREE.Group | null = null

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
let rimLight: THREE.DirectionalLight | null = null
let damFillLight: THREE.DirectionalLight | null = null
let upstreamWater: THREE.Mesh | null = null
let downstreamWater: THREE.Mesh | null = null
let upstreamMat: THREE.ShaderMaterial | null = null
let downstreamMat: THREE.ShaderMaterial | null = null
let damGroup: THREE.Group | null = null
let damInstance: DamModelInstance | null = null
let damOutlineMeshes: THREE.Object3D[] = []
let dischargeGroup: THREE.Group | null = null
let dataStreamGroup: THREE.Group | null = null
let mistGroup: THREE.Group | null = null
let raycaster = new THREE.Raycaster()
let mouse = new THREE.Vector2()
let hoverables: THREE.Object3D[] = []
let hoveredObject: THREE.Object3D | null = null
let cameraAnim: {
  fromPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toPos: THREE.Vector3
  toTarget: THREE.Vector3
  t: number
  duration: number
} | null = null

function initScene() {
  const el = containerRef.value
  if (!el) return

  const w = el.clientWidth
  const h = el.clientHeight
  const isTwin = props.visualMode === 'twin'
  const isPanorama = props.visualMode === 'panorama'
  const isTwinStyle = isTwin || isPanorama
  const isHolo = isTwinStyle
  const hasTerrain = props.visualMode === 'default'

  scene = new THREE.Scene()
  scene.background = new THREE.Color(isTwinStyle ? 0xf7fbff : 0x0a1628)
  scene.fog = new THREE.FogExp2(isTwinStyle ? 0xf0f4f8 : 0x1a2838, isTwinStyle ? 0.0005 : 0.0038)

  camera = new THREE.PerspectiveCamera(36, w / h, 0.5, 600)
  const camPreset = isTwin ? TWIN_CAMERA : isPanorama ? PANORAMA_CAMERA : DEFAULT_CAMERA
  if (isHolo) {
    const aspect = w / h
    camera.fov = aspect > 1.6 ? 32 : aspect > 1.2 ? 36 : 40
  }
  camera.position.copy(camPreset.pos)

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = isTwinStyle ? 1.06 : 0.9
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const canvas = renderer.domElement
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  canvas.style.zIndex = '1'
  el.appendChild(canvas)

  cinematicSky = createCinematicSky(
    renderer,
    isTwinStyle ? 'twin' : simulationSceneToWeather(props.simScene),
  )
  scene.add(cinematicSky.mesh)
  if (isTwinStyle) cinematicSky.mesh.visible = false
  scene.environment = isTwinStyle ? null : cinematicSky.envMap

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.045
  controls.maxPolarAngle = Math.PI / 2.06
  controls.minDistance = isPanorama ? 22 : 18
  controls.maxDistance = isPanorama ? 120 : 85
  controls.target.copy(camPreset.target)
  controls.autoRotate = props.autoRotate
  controls.autoRotateSpeed = isHolo ? 0.04 : 0.22
  if (isPanorama) {
    controls.enablePan = true
    controls.screenSpacePanning = false
  }

  ambientLight = new THREE.AmbientLight(
    isTwinStyle ? 0xe8eef4 : 0x2a3850,
    isTwinStyle ? 0.72 : 0.42,
  )
  scene.add(ambientLight)
  hemiLight = new THREE.HemisphereLight(
    isTwinStyle ? 0xffffff : 0x5588aa,
    isTwinStyle ? 0xe2e8f0 : 0x1a2838,
    isTwinStyle ? 0.58 : 0.52,
  )
  scene.add(hemiLight)

  sunLight = new THREE.DirectionalLight(
    isTwinStyle ? 0xfff5eb : 0xffcc88,
    isTwinStyle ? 0.92 : 0.65,
  )
  sunLight.position.set(isTwinStyle ? -65 : 55, isTwinStyle ? 82 : 75, isTwinStyle ? 48 : 35)
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

  const fill = new THREE.DirectionalLight(
    isTwinStyle ? 0xd0dce8 : 0x6699cc,
    isTwinStyle ? 0.32 : 0.38,
  )
  fill.position.set(-50, 30, -40)
  scene.add(fill)

  rimLight = new THREE.DirectionalLight(0x1890ff, isTwinStyle ? 0.12 : 0.18)
  rimLight.position.set(20, 15, -60)
  scene.add(rimLight)

  damFillLight = new THREE.DirectionalLight(
    isTwinStyle ? 0xfff0e0 : 0xffeedd,
    isTwinStyle ? 0.22 : 0.35,
  )
  damFillLight.position.set(isTwinStyle ? -40 : 30, isTwinStyle ? 55 : 20, isTwinStyle ? 30 : 50)
  scene.add(damFillLight)

  damSpotTarget = new THREE.Object3D()
  damSpotTarget.position.set(0, 14, 0)
  scene.add(damSpotTarget)

  damSpotLight = new THREE.SpotLight(
    0xffffff,
    isTwinStyle ? 0.6 : 3.2,
    160,
    Math.PI / 5.5,
    0.35,
    1.2,
  )
  damSpotLight.position.set(18, 38, 28)
  damSpotLight.target = damSpotTarget
  damSpotLight.castShadow = false
  scene.add(damSpotLight)

  if (hasTerrain) {
    const ridge = buildDistantRidgeline(cinematicSky.envMap)
    scene.add(ridge)
    scene.add(buildValleyTerrain(cinematicSky.envMap))
    scene.add(buildForestHillside(cinematicSky.envMap))
    scene.add(buildRiverbed(cinematicSky.envMap))
  }

  upstreamMat = createWaterMaterial({
    color: isTwinStyle ? 0x1890ff : 0x1a5080,
    deepColor: isTwinStyle ? 0x0d6eaa : 0x0a2540,
    opacity: isTwinStyle ? 0.88 : 0.92,
    envMap: isTwinStyle ? null : cinematicSky.envMap,
    waveScale: isTwinStyle ? 0.32 : 0.42,
    specIntensity: isTwinStyle ? 0.48 : 1.0,
    reflectivity: isTwinStyle ? 0.35 : 0.72,
    gridStrength: isTwinStyle ? 0.08 : 0,
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
    color: isTwinStyle ? 0x22b8cf : 0x124870,
    deepColor: isTwinStyle ? 0x0e7490 : 0x081830,
    opacity: isTwinStyle ? 0.85 : 0.88,
    envMap: isTwinStyle ? null : cinematicSky.envMap,
    waveScale: isTwinStyle ? 0.38 : 0.48,
    specIntensity: isTwinStyle ? 0.55 : 1.0,
    reflectivity: isTwinStyle ? 0.4 : 0.72,
    gridStrength: isTwinStyle ? 0.24 : 0,
  })
  downstreamWater = new THREE.Mesh(new THREE.PlaneGeometry(50, 30, 128, 64), downstreamMat)
  downstreamWater.rotation.x = -Math.PI / 2
  downstreamWater.position.set(24, 0.2, 0)
  downstreamWater.name = '下游水面'
  downstreamWater.userData.detail = '泄洪尾水 · 湍流泡沫与生态流量'
  downstreamWater.receiveShadow = true
  scene.add(downstreamWater)
  hoverables.push(downstreamWater)

  if (isTwinStyle) buildWaterLevelMarkers()

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
  if (isHolo) {
    outlinePass.edgeStrength = 3.2
    outlinePass.edgeGlow = 1.2
    outlinePass.edgeThickness = 1.4
    outlinePass.visibleEdgeColor.set('#1890ff')
    outlinePass.hiddenEdgeColor.set('#64748b')
  } else {
    outlinePass.edgeStrength = 5.5
    outlinePass.edgeGlow = 2.2
    outlinePass.edgeThickness = 2.4
    outlinePass.visibleEdgeColor.set('#00d4ff')
    outlinePass.hiddenEdgeColor.set('#006688')
  }
  outlinePass.selectedObjects = []
  composer.addPass(outlinePass)

  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), isTwinStyle ? 0.04 : 0.16, 0.62, 0.92)
  composer.addPass(bloomPass)

  if (!isTwinStyle) {
    bokehPass = new BokehPass(scene, camera, {
      focus: 42,
      aperture: 0.00012,
      maxblur: 0.008,
    })
    composer.addPass(bokehPass)
  }

  composer.addPass(new OutputPass())

  updateScene()
  animate()

  renderer.domElement.addEventListener('mousemove', onMouseMove)
  renderer.domElement.addEventListener('mouseleave', onMouseLeave)
}

async function mountDamModel() {
  if (!scene || !cinematicSky) return
  const twinStyle = props.visualMode === 'twin' || props.visualMode === 'panorama'
  damInstance = await loadDamModel(twinStyle ? null : cinematicSky.envMap)
  damModelLabel.value =
    damInstance.gateLeaves.length > 0
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
    const holo = props.visualMode === 'twin' || props.visualMode === 'panorama'
    if (holo) {
      const pierMeshes: THREE.Object3D[] = []
      damInstance.root.traverse((obj) => {
        if (obj.name.startsWith('pier_') && obj instanceof THREE.Mesh) pierMeshes.push(obj)
      })
      outlinePass.selectedObjects = pierMeshes.length > 0 ? pierMeshes : []
    } else {
      outlinePass.selectedObjects = damOutlineMeshes
    }
  }
  if (damSpotTarget && damInstance.heroCenter) {
    damSpotTarget.position.copy(damInstance.heroCenter)
    damSpotTarget.position.y += 6
  }
  frameCameraOnDam()
  const holo = props.visualMode === 'twin' || props.visualMode === 'panorama'
  if (holo) {
    applyTwinLightBackgroundMaterials(damInstance.root)
    addTwinWireframeOverlay(damInstance.root)
    addTwinPierGlow(damInstance.root)
    addTwinInternalPipeline(damInstance.root)
    collectPierObjects(damInstance.root)
  }
  buildDataStreams()
  updateScene()
  if (props.simRunning) focusSimulationView()
}

function animateCameraTo(position: THREE.Vector3, target: THREE.Vector3, duration = 1.3) {
  if (!camera || !controls) return
  cameraAnim = {
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos: position.clone(),
    toTarget: target.clone(),
    t: 0,
    duration,
  }
}

function updateCameraAnim(dt: number) {
  if (!cameraAnim || !camera || !controls) return
  cameraAnim.t += dt
  const p = Math.min(1, cameraAnim.t / cameraAnim.duration)
  const ease = 1 - Math.pow(1 - p, 3)
  camera.position.lerpVectors(cameraAnim.fromPos, cameraAnim.toPos, ease)
  controls.target.lerpVectors(cameraAnim.fromTarget, cameraAnim.toTarget, ease)
  controls.update()
  if (p >= 1) cameraAnim = null
}

function focusSimulationView() {
  if (!damInstance || !camera || !controls) return
  const { position, target } = getSimulationFocusCamera(damInstance.root, damInstance.heroCenter)
  animateCameraTo(position, target, props.visualMode === 'panorama' ? 1.5 : 1.2)
}

function buildWaterLevelMarkers() {
  if (!scene) return
  if (waterLevelGroup) {
    scene.remove(waterLevelGroup)
    waterLevelGroup.traverse((c) => {
      if (c instanceof THREE.Line || c instanceof THREE.Mesh) {
        c.geometry?.dispose()
        const m = c.material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else m?.dispose()
      }
    })
  }
  waterLevelGroup = new THREE.Group()
  waterLevelGroup.name = 'waterLevelMarkers'

  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-6, 0, -22),
    new THREE.Vector3(-6, 0, 22),
  ])
  const lineMat = new THREE.LineDashedMaterial({
    color: 0x1890ff,
    dashSize: 1.2,
    gapSize: 0.6,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  })
  const levelLine = new THREE.Line(lineGeo, lineMat)
  levelLine.name = 'upstreamLevelLine'
  levelLine.computeLineDistances()
  waterLevelGroup.add(levelLine)

  const stripGeo = new THREE.PlaneGeometry(0.12, 44)
  const stripMat = new THREE.MeshBasicMaterial({
    color: 0x1890ff,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const strip = new THREE.Mesh(stripGeo, stripMat)
  strip.name = 'levelGlowStrip'
  strip.rotation.y = Math.PI / 2
  waterLevelGroup.add(strip)

  for (const z of [-22, 22]) {
    const postGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8)
    const postMat = new THREE.MeshBasicMaterial({
      color: 0x1890ff,
      transparent: true,
      opacity: 0.85,
    })
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(-6, 0, z)
    post.name = 'levelPost'
    waterLevelGroup.add(post)
  }

  scene.add(waterLevelGroup)
  updateWaterLevelMarkers()
}

function updateWaterLevelMarkers() {
  if (!waterLevelGroup) return
  const y = upstreamLevelToSceneY(props.waterLevel)
  waterLevelGroup.position.y = y
  const col = new THREE.Color(levelStatus.value.color)
  waterLevelGroup.traverse((obj) => {
    if (obj instanceof THREE.Line) {
      ;(obj.material as THREE.LineDashedMaterial).color.copy(col)
    }
    if (obj instanceof THREE.Mesh) {
      ;(obj.material as THREE.MeshBasicMaterial).color.copy(col)
    }
  })
}

function updateWaterLevelScreenLabel() {
  if (!waterLevelGroup || !camera || !containerRef.value) return
  const holo = props.visualMode === 'twin' || props.visualMode === 'panorama'
  if (!holo) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  const v = new THREE.Vector3(-9, waterLevelGroup.position.y, 0)
  v.project(camera)
  waterLevelScreenLabel.value = {
    x: (v.x * 0.5 + 0.5) * w,
    y: (-v.y * 0.5 + 0.5) * h,
    visible: v.z < 1 && v.z > -1,
    text: `上游水位 ${props.waterLevel.toFixed(2)} m · ${levelStatus.value.label}`,
    color: levelStatus.value.color,
  }
}

function buildDataStreams() {
  if (!scene || props.visualMode === 'default') return
  if (dataStreamGroup) {
    scene.remove(dataStreamGroup)
    dataStreamGroup.traverse((c) => {
      if (c instanceof THREE.Line) {
        c.geometry.dispose()
        ;(c.material as THREE.Material).dispose()
      }
    })
  }
  dataStreamGroup = new THREE.Group()
  dataStreamGroup.name = 'dataStreams'
  const gateZs = [-14.25, -6.75, 0.75, 8.25, 16.0]
  const origin = new THREE.Vector3(-28, 3, -12)
  gateZs.forEach((z, i) => {
    const end = new THREE.Vector3(6, 12, z)
    const mid = new THREE.Vector3(-10 + i * 1.5, 8 + Math.sin(i) * 2, z * 0.35)
    const curve = new THREE.CatmullRomCurve3([origin, mid, end])
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40))
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x40c8ff,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    line.userData.phase = i * 1.1
    dataStreamGroup!.add(line)
  })
  scene.add(dataStreamGroup)
}

function addTwinWireframeOverlay(root: THREE.Object3D) {
  root.traverse((obj) => {
    const existing = obj.getObjectByName('twinWire')
    if (existing) obj.remove(existing)
  })
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return
    const n = obj.name
    if (!n.includes('坝') && !n.startsWith('pier_') && !n.startsWith('gateLeaf_')) return
    const edges = new THREE.EdgesGeometry(obj.geometry, 14)
    const lines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0x1890ff,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    lines.name = 'twinWire'
    lines.userData.scanPhase = obj.id * 0.1
    lines.renderOrder = 1
    obj.add(lines)
  })
}

function addTwinPierGlow(root: THREE.Object3D) {
  root.traverse((obj) => {
    const existing = obj.getObjectByName('twinPierGlow')
    if (existing) obj.remove(existing)
  })
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.name.startsWith('pier_')) return
    const edges = new THREE.EdgesGeometry(obj.geometry, 12)
    const glow = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0x40c8ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    glow.name = 'twinPierGlow'
    glow.renderOrder = 2
    obj.add(glow)
  })
}

function addTwinInternalPipeline(root: THREE.Object3D) {
  if (pipelineGroup) {
    pipelineGroup.traverse((c) => {
      if (c instanceof THREE.Line) {
        c.geometry.dispose()
        ;(c.material as THREE.Material).dispose()
      }
    })
    root.remove(pipelineGroup)
  }
  pipelineGroup = new THREE.Group()
  pipelineGroup.name = 'twinPipeline'
  const body = root.getObjectByName('向家坝大坝')
  if (body) {
    const box = new THREE.Box3().setFromObject(body)
    const cx = box.getCenter(new THREE.Vector3()).x
    for (let i = 0; i < 8; i++) {
      const t = i / 7
      const y = box.min.y + (box.max.y - box.min.y) * t
      const z = box.min.z + (box.max.z - box.min.z) * (0.2 + t * 0.6)
      const pts = [
        new THREE.Vector3(cx - 3, y, z - 6),
        new THREE.Vector3(cx - 1.5, y + 1, z),
        new THREE.Vector3(cx - 3, y, z + 6),
      ]
      const curve = new THREE.CatmullRomCurve3(pts)
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(16))
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: 0x1890ff,
          transparent: true,
          opacity: 0.12,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      line.userData.phase = i * 0.7
      pipelineGroup.add(line)
    }
  }
  root.add(pipelineGroup)
}

function collectPierObjects(root: THREE.Object3D) {
  pierObjects = []
  for (let i = 1; i <= 5; i++) {
    const p = root.getObjectByName(`pier_${i}`)
    if (p) pierObjects.push(p)
  }
}

function updatePierScreenLabels() {
  const holo = props.visualMode === 'twin' || props.visualMode === 'panorama'
  if (!holo || !camera || !containerRef.value || pierObjects.length === 0) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  const v = new THREE.Vector3()
  pierScreenLabels.value = pierObjects.map((obj, i) => {
    obj.getWorldPosition(v)
    v.y += 9
    v.project(camera!)
    return {
      name: `pier_${i + 1}`,
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
      visible: v.z < 1 && v.z > -1,
    }
  })
}

function frameCameraOnDam() {
  if (!damInstance || !camera || !controls) return
  const getter =
    props.visualMode === 'panorama'
      ? getPanoramaCamera
      : props.visualMode === 'twin'
        ? getTwinCinematicCamera
        : getDamHeroCamera
  const { position, target } = getter(damInstance.root, damInstance.heroCenter)
  camera.position.copy(position)
  controls.target.copy(target)
  controls.update()
  if (props.visualMode === 'twin') {
    TWIN_CAMERA.pos.copy(position)
    TWIN_CAMERA.target.copy(target)
  } else if (props.visualMode === 'panorama') {
    PANORAMA_CAMERA.pos.copy(position)
    PANORAMA_CAMERA.target.copy(target)
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

    const sheet = createDischargeSheet(3.8, 16)
    sheet.position.set(7.5, 4, 0)
    jetGroup.add(sheet)

    const sheet2 = createDischargeSheet(2.6, 11)
    sheet2.position.set(9, 1.2, 0.4)
    sheet2.rotation.z = 0.06
    jetGroup.add(sheet2)

    const sheet3 = createDischargeSheet(1.8, 6)
    sheet3.position.set(10.5, -1.5, -0.2)
    sheet3.rotation.z = 0.12
    jetGroup.add(sheet3)

    const count = 360
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
        color: 0xf0f8ff,
        size: 0.52,
        transparent: true,
        opacity: 0.9,
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

  for (let i = 0; i < 16; i++) {
    const z = -20 + i * 2.8
    const count = 200
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
        color: 0xffe8c8,
        size: 3.2,
        transparent: true,
        opacity: 0.38,
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
      g.scale.setScalar(0.4 + openRatio * 1.05)
      g.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
          child.material.uniforms.uIntensity.value = openRatio
        }
        if (child instanceof THREE.Points) {
          ;(child.material as THREE.PointsMaterial).opacity = openRatio * 0.92
        }
      })
    })
  }
  if (mistGroup) {
    const twinStyle = props.visualMode === 'twin' || props.visualMode === 'panorama'
    mistGroup.visible = !twinStyle && openRatio > 0.05
    const spread = 0.65 + openRatio * 0.85
    mistGroup.scale.set(spread, 0.8 + openRatio * 0.6, spread)
  }
  updateWaterLevelMarkers()
}

function applyWeatherFromScene() {
  if (props.visualMode === 'twin' || props.visualMode === 'panorama') {
    cinematicSky?.setWeather('twin')
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
  if (props.visualMode === 'twin' || props.visualMode === 'panorama') return
  if (!mistGroup || !cinematicSky || !mistGroup.visible) return
  const openRatio = props.gateOpening / 100
  const mistMul = cinematicSky.currentWeather.mistMultiplier

  mistGroup.children.forEach((mist, idx) => {
    const pts = mist as THREE.Points
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute
    const mat = pts.material as THREE.PointsMaterial
    const seeds = pts.userData.seeds as Float32Array
    const base = 0.22 + openRatio * 0.48
    mat.opacity = base * mistMul
    mat.color.setHex(0xffe8c8)
    mat.size = 3.0 + Math.sin(t * 0.6 + idx) * 0.55

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

function animateDataStreams(t: number) {
  if (!dataStreamGroup) return
  dataStreamGroup.children.forEach((line) => {
    const mat = (line as THREE.Line).material as THREE.LineBasicMaterial
    const phase = (line.userData.phase as number) ?? 0
    mat.opacity = 0.18 + Math.sin(t * 1.6 + phase) * 0.14
  })
}

function animateHoloWireframe(t: number) {
  const holo = props.visualMode === 'twin' || props.visualMode === 'panorama'
  if (!holo || !damGroup) return
  const scanBand = (Math.sin(t * 0.45) + 1) * 0.5
  damGroup.traverse((obj) => {
    if (obj.name === 'twinWire') {
      const mat = (obj as THREE.LineSegments).material as THREE.LineBasicMaterial
      const phase = (obj.userData.scanPhase as number) ?? 0
      const base = 0.12
      mat.opacity = base + Math.sin(t * 0.8 + phase) * 0.08 + scanBand * 0.14
    }
    if (obj.name === 'twinPierGlow') {
      const mat = (obj as THREE.LineSegments).material as THREE.LineBasicMaterial
      mat.opacity = 0.38 + Math.sin(t * 1.2 + obj.id * 0.05) * 0.18
    }
  })
  if (pipelineGroup) {
    pipelineGroup.children.forEach((line) => {
      const mat = (line as THREE.Line).material as THREE.LineBasicMaterial
      const phase = (line.userData.phase as number) ?? 0
      mat.opacity = 0.08 + Math.sin(t * 1.4 + phase) * 0.06
    })
  }
}

function syncSunLight(dt: number) {
  if (!cinematicSky || !sunLight || !scene || !renderer) return
  const t = clock.getElapsedTime()
  cinematicSky.update(t, dt)
  cinematicSky.applyToScene(
    scene,
    { sun: sunLight, ambient: ambientLight, hemi: hemiLight },
    renderer,
  )
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

  updateCameraAnim(dt)
  syncSunLight(dt)
  animateDataStreams(t)
  animateHoloWireframe(t)

  if (upstreamMat) upstreamMat.uniforms.uTime.value = t
  if (downstreamMat) downstreamMat.uniforms.uTime.value = t

  animateDischarge(t)
  animateMist(t)
  updatePierScreenLabels()
  updateWaterLevelScreenLabel()
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
    if (
      cur.name &&
      cur.name !== '坝顶' &&
      (cur.name.includes('坝') ||
        cur.name.includes('闸门') ||
        cur.name.includes('站') ||
        cur.name.includes('厂房') ||
        cur.name.includes('水面') ||
        cur.name.startsWith('pier_'))
    ) {
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
      tooltip.value = {
        name: root.name,
        detail,
        x: e.clientX - rect.left + 14,
        y: e.clientY - rect.top - 10,
        visible: true,
      }
      emit('device-hover', { name: root.name, detail })
      containerRef.value.style.cursor = 'pointer'
      return
    }
  }

  hoveredObject = null
  const holo = props.visualMode === 'twin' || props.visualMode === 'panorama'
  outlinePass.selectedObjects = holo ? [] : damOutlineMeshes.length ? damOutlineMeshes : []
  tooltip.value.visible = false
  emit('device-hover', null)
  containerRef.value.style.cursor = 'grab'
}

function onMouseLeave() {
  tooltip.value.visible = false
  emit('device-hover', null)
  if (outlinePass) {
    const holo = props.visualMode === 'twin' || props.visualMode === 'panorama'
    outlinePass.selectedObjects = holo ? [] : damOutlineMeshes.length ? damOutlineMeshes : []
  }
  hoveredObject = null
  if (containerRef.value) containerRef.value.style.cursor = 'default'
}

function handleResize() {
  const el = containerRef.value
  if (!el || !camera || !renderer) return
  const w = el.clientWidth
  const h = el.clientHeight
  camera.aspect = w / h
  if (props.visualMode === 'twin' || props.visualMode === 'panorama') {
    const aspect = w / h
    camera.fov = aspect > 1.6 ? 32 : aspect > 1.2 ? 36 : 40
  }
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer?.setSize(w, h)
  outlinePass?.setSize(w, h)
  bloomPass?.setSize(w, h)
}

function zoomTowardTarget(factor: number) {
  if (!camera || !controls) return
  const offset = camera.position.clone().sub(controls.target)
  const dist = offset.length()
  const next = THREE.MathUtils.clamp(dist * factor, controls.minDistance, controls.maxDistance)
  offset.setLength(next)
  camera.position.copy(controls.target).add(offset)
}

function resetView() {
  if (!camera || !controls) return
  if (props.visualMode === 'panorama') {
    camera.position.copy(PANORAMA_CAMERA.pos)
    controls.target.copy(PANORAMA_CAMERA.target)
  } else if (props.visualMode === 'twin') {
    camera.position.copy(TWIN_CAMERA.pos)
    controls.target.copy(TWIN_CAMERA.target)
  } else {
    camera.position.copy(DEFAULT_CAMERA.pos)
    controls.target.copy(DEFAULT_CAMERA.target)
  }
  controls.update()
}

function zoomIn() {
  zoomTowardTarget(0.88)
}
function zoomOut() {
  zoomTowardTarget(1.12)
}
function setAutoRotate(v: boolean) {
  if (controls) controls.autoRotate = v
}

defineExpose({ resetView, zoomIn, zoomOut, setAutoRotate, focusSimulationView })

watch(
  () => [props.waterLevel, props.downstreamLevel, props.gateOpening, props.flowRate],
  updateScene,
)
watch(
  () => props.autoRotate,
  (v) => setAutoRotate(v),
)
watch(
  () => props.simScene,
  () => applyWeatherFromScene(),
)
watch(
  () => props.simRunning,
  (running) => {
    if (running) focusSimulationView()
    else resetView()
  },
)

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
  if (containerRef.value && renderer?.domElement)
    containerRef.value.removeChild(renderer.domElement)
})
</script>

<template>
  <div
    ref="containerRef"
    class="three-scene"
    :class="{
      'three-scene--twin': visualMode === 'twin',
      'three-scene--panorama': visualMode === 'panorama',
    }"
  >
    <div v-if="visualMode === 'default'" class="three-scene__data-panel">
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
          <div
            class="three-scene__gauge-marker three-scene__gauge-marker--warn"
            style="bottom: 75%"
            title="预警 381.5m"
          />
        </div>
        <div class="three-scene__gauge-labels">
          <span>{{ XIANGJIABA_HYDRO.crestElevation }}m 坝顶</span>
          <span>{{ XIANGJIABA_HYDRO.normalPoolLevel }}m 正常</span>
          <span>{{ XIANGJIABA_HYDRO.deadLevel }}m 死水位</span>
        </div>
      </div>
      <div class="three-scene__data-ref">
        较正常蓄水 {{ levelDelta >= 0 ? '+' : '' }}{{ levelDelta.toFixed(2) }}m · 汛限
        {{ XIANGJIABA_HYDRO.floodLimitLevel }}m
      </div>
    </div>
    <div
      v-if="visualMode === 'default'"
      class="three-scene__badge"
      :class="{ 'is-fallback': damModelLabel === '程序化回退模型' }"
    >
      {{ damModelLabel }}
    </div>
    <div
      v-if="visualMode === 'twin' || visualMode === 'panorama'"
      class="three-scene__holo-overlay"
    >
      <div class="three-scene__digital-particles" />
      <div class="three-scene__scan-strips" />
      <div class="three-scene__silk-streams" />
      <svg
        class="three-scene__flow-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="geoFlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="rgba(64,200,255,0.15)" />
            <stop offset="45%" stop-color="rgba(64,200,255,0.75)" />
            <stop offset="100%" stop-color="rgba(64,200,255,0.2)" />
          </linearGradient>
        </defs>
        <path
          class="three-scene__flow-path"
          d="M 6 88 Q 18 68 34 52 T 58 38"
          fill="none"
          stroke="url(#geoFlowGrad)"
          stroke-width="0.35"
        />
        <path
          class="three-scene__flow-path three-scene__flow-path--d2"
          d="M 6 88 Q 16 64 30 46 T 52 34"
          fill="none"
          stroke="url(#geoFlowGrad)"
          stroke-width="0.25"
        />
        <path
          class="three-scene__flow-path three-scene__flow-path--d3"
          d="M 6 88 Q 14 60 28 42 T 48 30"
          fill="none"
          stroke="url(#geoFlowGrad)"
          stroke-width="0.2"
        />
      </svg>
      <div class="three-scene__scan-sweep" />
    </div>
    <div v-if="visualMode === 'twin' || visualMode === 'panorama'" class="three-scene__title-tag">
      <div class="three-scene__title-ring" aria-hidden="true" />
      <div>
        <strong>向家坝大坝</strong>
        <em>向家坝水电站 BIM 工程构件</em>
      </div>
    </div>
    <div v-if="visualMode === 'twin' || visualMode === 'panorama'" class="three-scene__geo-tag">
      <span class="three-scene__geo-tag-icon" />
      <div>
        <strong>四川省宜宾市 · 向家坝水电站</strong>
        <small>东经 {{ XIANGJIABA_HYDRO.longitude }}，北纬 {{ XIANGJIABA_HYDRO.latitude }}</small>
      </div>
    </div>
    <div
      v-show="waterLevelScreenLabel.visible"
      class="three-scene__level-label"
      :style="{
        left: waterLevelScreenLabel.x + 'px',
        top: waterLevelScreenLabel.y + 'px',
        '--level-color': waterLevelScreenLabel.color,
      }"
    >
      <span class="three-scene__level-label-dot" />
      {{ waterLevelScreenLabel.text }}
    </div>
    <div
      v-for="pl in pierScreenLabels"
      v-show="pl.visible"
      :key="pl.name"
      class="three-scene__pier-label"
      :style="{ left: pl.x + 'px', top: pl.y + 'px' }"
    >
      {{ pl.name }}
    </div>
    <div
      v-if="tooltip.visible"
      class="three-scene__tooltip"
      :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
    >
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
  min-height: 0;
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(180deg, #0a1628 0%, #1a3050 50%, #0d2137 100%);
  border: 1px solid rgba(0, 212, 255, 0.22);
  box-shadow:
    inset 0 0 40px rgba(0, 80, 140, 0.25),
    0 4px 28px rgba(0, 40, 80, 0.35);

  &--twin {
    border-radius: 10px;
    border: 1px solid rgba(24, 144, 255, 0.15);
    box-shadow: 0 2px 12px rgba(24, 144, 255, 0.08);
    background: linear-gradient(180deg, #ffffff 0%, #f7fbff 50%, #eef6fc 100%);
  }

  &--panorama {
    border-radius: 0;
    border: none;
    box-shadow: none;
    background: linear-gradient(180deg, #ffffff 0%, #f7fbff 50%, #eef6fc 100%);
  }

  &__digital-particles {
    position: absolute;
    inset: 0;
    opacity: 0.35;
    background-image:
      radial-gradient(1px 1px at 15% 25%, rgba(24, 144, 255, 0.25), transparent),
      radial-gradient(1px 1px at 45% 65%, rgba(24, 144, 255, 0.18), transparent),
      radial-gradient(1px 1px at 72% 18%, rgba(24, 144, 255, 0.15), transparent),
      radial-gradient(1px 1px at 88% 78%, rgba(24, 144, 255, 0.15), transparent),
      radial-gradient(1px 1px at 32% 82%, rgba(24, 144, 255, 0.12), transparent);
    animation: particle-drift 14s ease-in-out infinite;
  }

  &__scan-strips {
    position: absolute;
    inset: 0;
    opacity: 0.4;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 5px,
      rgba(24, 144, 255, 0.025) 5px,
      rgba(24, 144, 255, 0.025) 6px
    );
    animation: holo-scan 10s linear infinite;
  }

  &__silk-streams {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(105deg, transparent 40%, rgba(64, 200, 255, 0.04) 50%, transparent 60%),
      linear-gradient(75deg, transparent 30%, rgba(64, 200, 255, 0.03) 42%, transparent 54%);
    background-size: 200% 100%;
    animation: silk-drift 8s linear infinite;
  }

  @keyframes silk-drift {
    0% {
      background-position:
        0% 0,
        100% 0;
    }
    100% {
      background-position:
        200% 0,
        -100% 0;
    }
  }

  @keyframes particle-drift {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes holo-scan {
    0% {
      transform: translateY(0);
    }
    100% {
      transform: translateY(6px);
    }
  }

  &__holo-overlay {
    position: absolute;
    inset: 0;
    z-index: 4;
    pointer-events: none;
    overflow: hidden;
  }

  &__flow-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0.85;
  }

  &__flow-path {
    stroke-dasharray: 8 12;
    animation: flow-dash 3s linear infinite;

    &--d2 {
      animation-delay: 0.6s;
      opacity: 0.7;
    }
    &--d3 {
      animation-delay: 1.2s;
      opacity: 0.5;
    }
  }

  &__scan-sweep {
    position: absolute;
    left: 0;
    right: 0;
    height: 30%;
    background: linear-gradient(180deg, transparent, rgba(64, 200, 255, 0.07), transparent);
    animation: scan-sweep 6s ease-in-out infinite;
  }

  &__title-tag {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(24, 144, 255, 0.25);
    border-radius: 10px;
    backdrop-filter: blur(14px);
    pointer-events: none;
    box-shadow: 0 2px 12px rgba(24, 144, 255, 0.1);

    strong {
      display: block;
      font-size: 14px;
      font-weight: 700;
      color: #1890ff;
      text-align: center;
    }

    em {
      display: block;
      font-style: normal;
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
      text-align: center;
    }
  }

  &__title-ring {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border: 2px solid rgba(64, 200, 255, 0.35);
    border-top-color: #40c8ff;
    border-radius: 50%;
    animation: ring-spin 3s linear infinite;
    box-shadow: 0 0 12px rgba(64, 200, 255, 0.35);
  }

  @keyframes ring-spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  &__geo-tag {
    position: absolute;
    bottom: 16px;
    left: 14px;
    z-index: 9;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    max-width: 300px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(24, 144, 255, 0.22);
    border-radius: 8px;
    backdrop-filter: blur(14px);
    pointer-events: none;
    box-shadow: 0 2px 10px rgba(24, 144, 255, 0.08);
    animation: geo-float 4s ease-in-out infinite;

    strong {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: #1e4976;
      letter-spacing: 0.03em;
    }

    small {
      display: block;
      margin-top: 4px;
      font-size: 10px;
      color: #64748b;
      letter-spacing: 0.05em;
    }
  }

  &__geo-tag-icon {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    margin-top: 4px;
    border-radius: 50%;
    background: #40c8ff;
    box-shadow: 0 0 12px #1890ff;
  }

  &__pier-label {
    position: absolute;
    z-index: 8;
    transform: translate(-50%, -100%);
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    font-family: 'SF Mono', 'Consolas', monospace;
    color: #1890ff;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(24, 144, 255, 0.3);
    border-radius: 4px;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(24, 144, 255, 0.12);
    animation: pier-float 3s ease-in-out infinite;
  }

  &__level-label {
    position: absolute;
    z-index: 9;
    transform: translate(-100%, -50%);
    margin-left: -10px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 700;
    font-family: 'SF Mono', 'Consolas', monospace;
    color: var(--level-color, #1890ff);
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid color-mix(in srgb, var(--level-color, #1890ff) 45%, transparent);
    border-radius: 6px;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 2px 12px color-mix(in srgb, var(--level-color, #1890ff) 25%, transparent);
    animation: level-pulse 2.5s ease-in-out infinite;
  }

  &__level-label-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--level-color, #1890ff);
    box-shadow: 0 0 8px var(--level-color, #1890ff);
  }

  @keyframes level-pulse {
    0%,
    100% {
      opacity: 0.92;
    }
    50% {
      opacity: 1;
    }
  }

  &--panorama &__pier-label {
    color: #1890ff;
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(24, 144, 255, 0.3);
    box-shadow: 0 2px 8px rgba(24, 144, 255, 0.12);
    text-shadow: none;
  }

  @keyframes pier-float {
    0%,
    100% {
      margin-top: 0;
    }
    50% {
      margin-top: -4px;
    }
  }

  @keyframes geo-float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-4px);
    }
  }

  @keyframes flow-dash {
    0% {
      stroke-dashoffset: 0;
    }
    100% {
      stroke-dashoffset: -40;
    }
  }

  @keyframes scan-sweep {
    0% {
      top: -30%;
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    100% {
      top: 100%;
      opacity: 0;
    }
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
