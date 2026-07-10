// 数字孪生 — 闸墩 / 闸叶 / 泄流视觉主题
import * as THREE from 'three'

export const PIER_COLOR = 0x2a323c
export const DAM_BODY_COLOR = 0x343d48
export const GATE_FRAME_COLOR = 0x3d4652

/** 闸墩坝体：哑光深炭灰 */
export const PIER_MAT = {
  color: PIER_COLOR,
  metalness: 0.22,
  roughness: 0.86,
  emissive: 0x080a0e,
  emissiveIntensity: 0.02,
}

export const DAM_BODY_MAT = {
  color: DAM_BODY_COLOR,
  metalness: 0.12,
  roughness: 0.9,
  emissive: 0x0a0c10,
  emissiveIntensity: 0.015,
}

export interface GateLeafVisual {
  color: number
  emissive: number
  emissiveIntensity: number
  edgeOpacity: number
  edgeColor: number
}

/** 关 / 半开 / 全开 明度与描边 */
export function gateLeafVisualForOpening(openRatio: number): GateLeafVisual {
  const r = Math.min(1, Math.max(0, openRatio))
  if (r < 0.04) {
    return {
      color: 0x4a5568,
      emissive: 0x000000,
      emissiveIntensity: 0,
      edgeOpacity: 0.1,
      edgeColor: 0x6a8aaa,
    }
  }
  if (r < 0.55) {
    const t = (r - 0.04) / 0.51
    return {
      color: lerpHex(0x4a5568, 0x6b8fa8, t),
      emissive: 0x1a4060,
      emissiveIntensity: t * 0.18,
      edgeOpacity: 0.18 + t * 0.28,
      edgeColor: 0x7eb8e8,
    }
  }
  const t = (r - 0.55) / 0.45
  return {
    color: lerpHex(0x6b8fa8, 0x8ec8f0, t),
    emissive: 0x2a6090,
    emissiveIntensity: 0.18 + t * 0.38,
    edgeOpacity: 0.42 + t * 0.38,
    edgeColor: 0xa8dcff,
  }
}

function lerpHex(a: number, b: number, t: number) {
  const ca = new THREE.Color(a)
  const cb = new THREE.Color(b)
  return ca.lerp(cb, t).getHex()
}
