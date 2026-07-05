/** 将 BIM 模型内部英文名映射为界面展示用中文名 */

const PIER_RE = /^pier_(\d+)$/
const GATE_LEAF_RE = /^gateLeaf_(\d+)$/
const PH_WINDOW_RE = /^phWindow_(\d+)_(\d+)$/

export function getBimDisplayName(internalName: string): string {
  if (!internalName) return '工程构件'

  const pier = internalName.match(PIER_RE)
  if (pier) return `${pier[1]}号闸墩`

  const gate = internalName.match(GATE_LEAF_RE)
  if (gate) return `${Number(gate[1]) + 1}号闸门`

  const win = internalName.match(PH_WINDOW_RE)
  if (win) return `厂房窗格 ${win[1]}-${win[2]}`

  return internalName
}

export function getBimDefaultDetail(internalName: string): string {
  if (PIER_RE.test(internalName)) return '混凝土闸墩 · 分隔泄洪孔 · 承力结构'
  if (GATE_LEAF_RE.test(internalName)) return '钢制泄洪闸叶 · 液压启闭 · 开度联动'
  if (PH_WINDOW_RE.test(internalName)) return '厂房外立面采光窗'
  return '向家坝水电站 BIM 工程构件'
}
