# 向家坝大坝 3D 模型

## 当前模型

- **文件**: `xiangjiaba-dam.glb`（**程序化实体大坝**，`npm run generate:dam`）
- **特性**: 5 组闸门 `gateLeaf_0…4` 可开度动画，与水面/泄洪粒子对齐
- **混元备份**: `hunyuan-raw.glb`（待 Blender 精修后可替换）
- **回退备份**: `xiangjiaba-dam.glb.bak`（与当前程序化模型相同）

## 混元模型接入（可选）

1. 从混元 3D 资源库下载 GLB，放到 `public/models/hunyuan-raw.glb`
2. 运行 `npm run process:hunyuan`（快速减面 + 对齐场景高度）
3. 启动 `npm run dev` 预览；若位置偏移，调整 `src/constants/damModel.ts` 中的 `DAM_MODEL_OFFSET`

## 替换为公开素材

1. 从以下来源下载 **glb/glTF** 格式大坝模型（推荐 CC0 或可商用许可）：
   - [Sketchfab — hydroelectric](https://sketchfab.com/tags/hydroelectric)（筛选 Downloadable）
   - [Meshy — dam CC0](https://www.meshy.ai/tags/dam)
   - [Poly Haven Models](https://polyhaven.com/models)

2. 在 **Blender** 中打开，检查/重命名闸门叶为 `gateLeaf_0` … `gateLeaf_N`

3. 重命名为 `xiangjiaba-dam.glb` 覆盖本目录文件

4. 若模型过大/过小，调整 `src/constants/damModel.ts` 中的 `DAM_MODEL_SCALE`

## 回退

若 GLB 加载失败，场景自动回退到程序化 `buildDamBody()` 模型。
