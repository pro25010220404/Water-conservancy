// ============================================================
// 大坝 GLB 加载器 — 保持原始坐标，PBR 烘焙，闸门开度绑定
// ============================================================
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  DAM_MODEL_URL, DAM_MODEL_SCALE, DAM_MODEL_OFFSET, DAM_MODEL_ROTATION_Y,
  DAM_GATE_NAME_PREFIX, DAM_HERO_ANCHOR,
} from '@/constants/damModel'
import { buildDamBody } from './terrainBuilder'
import { createConcreteTextures, createMetalTextures } from './proceduralTextures'

export interface GateLeafState {
  object: THREE.Object3D
  baseY: number
  baseScaleY: number
}

export interface DamModelInstance {
  root: THREE.Group
  gateLeaves: GateLeafState[]
  powerhouse: THREE.Object3D | null
  hoverables: THREE.Object3D[]
  fromGltf: boolean
  heroCenter: THREE.Vector3
  applyGateOpening: (ratio: number) => void
  dispose: () => void
}

function enhanceMaterials(root: THREE.Object3D, envMap?: THREE.Texture | null) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.castShadow = true
    obj.receiveShadow = true
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach((m) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return
      if (envMap) {
        m.envMap = envMap
        m.envMapIntensity = m.metalness > 0.5 ? 0.95 : 0.75
      }
      m.needsUpdate = true
    })
  })
}

function collectGateLeaves(root: THREE.Object3D): GateLeafState[] {
  const gates: GateLeafState[] = []
  root.traverse((obj) => {
    if (!obj.name.startsWith(DAM_GATE_NAME_PREFIX)) return
    gates.push({
      object: obj,
      baseY: obj.position.y,
      baseScaleY: obj.scale.y || 1,
    })
  })
  gates.sort((a, b) => a.object.name.localeCompare(b.object.name))
  return gates
}

function collectHoverables(root: THREE.Object3D): THREE.Object3D[] {
  const list: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (!obj.name || obj.name === '坝顶') return
    if (
      obj.name.includes('坝') || obj.name.includes('闸门') || obj.name.includes('厂房')
      || obj.name.startsWith(DAM_GATE_NAME_PREFIX) || obj.name.startsWith('pier_')
    ) {
      list.push(obj)
    }
  })
  const ph = root.getObjectByName('向家坝电站厂房')
  if (ph && !list.includes(ph)) list.push(ph)
  return list
}

function applyGateOpeningToLeaves(gates: GateLeafState[], ratio: number) {
  gates.forEach((g) => {
    g.object.position.y = g.baseY + ratio * 7
    g.object.scale.y = g.baseScaleY * (1 - ratio * 0.45)
  })
}

function computeHeroCenter(root: THREE.Object3D): THREE.Vector3 {
  const body = root.getObjectByName('向家坝大坝')
  if (body) {
    const box = new THREE.Box3().setFromObject(body)
    return box.getCenter(new THREE.Vector3())
  }
  const box = new THREE.Box3().setFromObject(root)
  return box.getCenter(new THREE.Vector3())
}

function buildFallbackInstance(envMap?: THREE.Texture | null): DamModelInstance {
  const root = buildDamBody(envMap)
  const gateLeaves = collectGateLeaves(root)
  rebakeDamPBR(root, envMap)
  return {
    root,
    gateLeaves,
    powerhouse: root.getObjectByName('向家坝电站厂房') ?? null,
    hoverables: collectHoverables(root),
    fromGltf: false,
    heroCenter: computeHeroCenter(root),
    applyGateOpening(ratio) {
      applyGateOpeningToLeaves(gateLeaves, ratio)
    },
    dispose() {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m) => m.dispose())
        }
      })
    },
  }
}

/** 加载 GLB；失败时回退程序化模型。不居中变换，保持与水面/泄洪对齐。 */
export function loadDamModel(
  envMap?: THREE.Texture | null,
  url = DAM_MODEL_URL,
): Promise<DamModelInstance> {
  const loader = new GLTFLoader()

  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene as THREE.Group
        root.name = '向家坝大坝场景'
        root.position.set(
          DAM_HERO_ANCHOR.x + DAM_MODEL_OFFSET.x,
          DAM_HERO_ANCHOR.y + DAM_MODEL_OFFSET.y,
          DAM_HERO_ANCHOR.z + DAM_MODEL_OFFSET.z,
        )
        root.scale.setScalar(DAM_MODEL_SCALE)
        root.rotation.y = DAM_MODEL_ROTATION_Y
        root.renderOrder = 1

        enhanceMaterials(root, envMap)
        // 混元 GLB 保留导出材质；程序化 pier/闸门才重烘焙 PBR
        const gateLeaves = collectGateLeaves(root)
        if (gateLeaves.length === 0) {
          enhanceGltfDamVisibility(root, envMap)
        } else {
          rebakeDamPBR(root, envMap)
        }

        let triCount = 0
        root.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.geometry) {
            triCount += obj.geometry.index
              ? obj.geometry.index.count / 3
              : obj.geometry.attributes.position.count / 3
          }
        })
        console.info(
          `[damModelLoader] 混元 GLB 已加载 (${Math.round(triCount).toLocaleString()} 面)`,
          url,
        )
        const powerhouse = root.getObjectByName('向家坝电站厂房') ?? null
        if (powerhouse) {
          powerhouse.userData.detail = '向家坝水电站 BIM 工程构件'
        }

        resolve({
          root,
          gateLeaves,
          powerhouse,
          hoverables: collectHoverables(root),
          fromGltf: true,
          heroCenter: computeHeroCenter(root),
          applyGateOpening(ratio) {
            applyGateOpeningToLeaves(gateLeaves, ratio)
          },
          dispose() {
            root.traverse((obj) => {
              if (obj instanceof THREE.Mesh) obj.geometry?.dispose()
            })
          },
        })
      },
      undefined,
      (err) => {
        console.warn('[damModelLoader] GLB 加载失败，使用程序化回退模型。请 Ctrl+F5 强刷或检查 public/models/xiangjiaba-dam.glb', err)
        resolve(buildFallbackInstance(envMap))
      },
    )
  })
}

/** 混元/外部 GLB 坝体 — 提亮材质便于在暗色场景中辨认 */
export function enhanceGltfDamVisibility(root: THREE.Object3D, envMap?: THREE.Texture | null) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.castShadow = true
    obj.receiveShadow = true
    obj.material = new THREE.MeshStandardMaterial({
      color: 0xc8d0d8,
      emissive: 0x445566,
      emissiveIntensity: 0.22,
      roughness: 0.68,
      metalness: 0.12,
      envMap: envMap ?? null,
      envMapIntensity: 1.15,
    })
  })
}

/** 收集坝体全部 mesh（用于描边高亮） */
export function collectDamMeshes(root: THREE.Object3D): THREE.Object3D[] {
  const meshes: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj)
  })
  return meshes
}

/** 为坝体全部网格烘焙 PBR（含 pier / 闸墩 / 坝体） */
export function rebakeDamPBR(root: THREE.Object3D, envMap?: THREE.Texture | null) {
  const concreteTex = createConcreteTextures(1024)
  const metalTex = createMetalTextures(1024)

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (obj.name.startsWith('phWindow_')) return

    const isSteel = obj.name.startsWith(DAM_GATE_NAME_PREFIX)
      || obj.name.includes('闸门')
      || obj.name.startsWith('pier_')

    if (isSteel) {
      obj.material = new THREE.MeshStandardMaterial({
        map: metalTex.map,
        normalMap: metalTex.normalMap,
        roughnessMap: metalTex.roughnessMap,
        roughness: metalTex.roughness,
        metalness: metalTex.metalness,
        envMap: envMap ?? null,
        envMapIntensity: 0.95,
      })
    } else {
      obj.material = new THREE.MeshStandardMaterial({
        map: concreteTex.map,
        normalMap: concreteTex.normalMap,
        roughnessMap: concreteTex.roughnessMap,
        roughness: concreteTex.roughness,
        metalness: concreteTex.metalness,
        envMap: envMap ?? null,
        envMapIntensity: 0.78,
      })
    }
  })
}

/** 数字孪生俯视视角（参考 EasyV / 水利驾驶舱） */
export function getTwinAerialCamera(root: THREE.Object3D, heroCenter: THREE.Vector3) {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  return {
    position: new THREE.Vector3(
      center.x + Math.max(size.x, 40) * 0.95,
      center.y + Math.max(size.y, 28) * 1.05,
      center.z + Math.max(size.z, 20) * 1.15,
    ),
    target: new THREE.Vector3(center.x, heroCenter.y + size.y * 0.28, center.z),
  }
}

/** 相机对准大坝主体（泄洪面） */
export function getDamHeroCamera(root: THREE.Object3D, heroCenter: THREE.Vector3) {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const spillFace = new THREE.Vector3(box.max.x, heroCenter.y + size.y * 0.08, heroCenter.z)
  const dist = Math.max(size.x, size.y, size.z) * 1.35
  return {
    position: new THREE.Vector3(
      spillFace.x + dist * 0.55,
      heroCenter.y + size.y * 0.55,
      spillFace.z + dist * 0.72,
    ),
    target: new THREE.Vector3(spillFace.x - size.x * 0.12, heroCenter.y + size.y * 0.35, spillFace.z),
  }
}
