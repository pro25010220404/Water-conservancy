<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const container = ref<HTMLDivElement | null>(null)
let viewer: Cesium.Viewer | null = null

// ═══ 去 ion.cesium.com 免费注册获取 token ═══
const CESIUM_ION_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2N2NlYTdmMC0xZDg5LTQwZjktYmVkMi1lZDdlN2U1ODE3ZGEiLCJpZCI6NDUyMDY0LCJzdWIiOiJwempwemoiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoi5ZCR5a625Z2dIiwiaWF0IjoxNzgzMDY5MzA4fQ.WfziuzFTgpN-fpZAkzKXrdWEVH6m-1ZIhXYJ9pVeggw'

async function init() {
  if (!container.value) return

  Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN

  viewer = new Cesium.Viewer(container.value, {
    baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
    vrButton: false, selectionIndicator: false, infoBox: false,
    terrainProvider: await Cesium.createWorldTerrainAsync(),
  })

  // 先加 ESRI 底图（3D Tiles 加载中也能看到）
  const esri = await Cesium.ArcGisMapServerImageryProvider.fromUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer')
  viewer.imageryLayers.removeAll()
  viewer.imageryLayers.addImageryProvider(esri)

  // 尝试加载 Google 3D 实景
  try {
    const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207)
    viewer.scene.primitives.add(tileset)
    viewer.imageryLayers.removeAll()
    console.log('✅ Google 3D Tiles 加载成功')
  } catch(e: any) {
    console.warn('⚠️ Google 3D Tiles 加载失败:', e?.message || e)
    console.warn('→ 原因：Cesium ion 免费账号需手动开通 Google 3D Tiles')
    console.warn('→ 当前：3D 地形 + ESRI 卫星图（山脉河谷已有立体感）')
  }

  // 向家坝标注
  viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(104.389, 28.644, 390),
    label: { text: '向家坝水电站', font: '16px sans-serif', fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -16) },
  })

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(104.389, 28.644, 2500),
    orientation: { heading: Cesium.Math.toRadians(30), pitch: Cesium.Math.toRadians(-35), roll: 0 },
    duration: 2,
  })
}

onMounted(() => { init() })
onUnmounted(() => { viewer?.destroy() })
</script>

<template>
  <div ref="container" class="sp"/>
</template>

<style scoped>
.sp { width:100%; height:calc(100vh - 56px); }
</style>

<style lang="scss">
.main-layout__content:has(.sp) { padding:0 !important; overflow:hidden !important; }
</style>
