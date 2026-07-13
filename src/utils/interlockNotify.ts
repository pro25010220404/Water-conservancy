import { ElMessageBox } from 'element-plus'
import type { GatePrecheckViolation } from '@/types/gateControl'

let modalBusy = false

function violationHtml(items: GatePrecheckViolation[]) {
  return items
    .map((v) => `<p class="interlock-modal__item"><strong>${v.ruleName}</strong><span>${v.message}</span></p>`)
    .join('')
}

/** 存在阻断项：居中提示，不可继续执行 */
async function showBlocked(violations: GatePrecheckViolation[]) {
  const blocks = violations.filter((v) => v.severity === 'block')
  if (!blocks.length || modalBusy) return

  modalBusy = true
  try {
    await ElMessageBox.alert(
      `<p class="interlock-modal__lead">以下规则未通过，请修改开度后重试：</p>${violationHtml(blocks)}`,
      '无法执行',
      {
        type: 'error',
        confirmButtonText: '返回修改',
        center: true,
        dangerouslyUseHTMLString: true,
        closeOnClickModal: false,
        closeOnPressEscape: false,
        showClose: true,
        customClass: 'interlock-modal-box interlock-modal-box--block',
      },
    )
  } catch {
    /* 关闭 */
  } finally {
    modalBusy = false
  }
}

export type InterlockConfirmOptions = {
  title: string
  actionSummary: string
  confirmText?: string
  violations: GatePrecheckViolation[]
}

/**
 * 执行/提交前统一确认：
 * - 有阻断 → 仅提示，返回 false
 * - 有警告 → 同一弹窗内展示风险 + 操作摘要，确认后继续
 * - 无问题 → 普通确认
 */
export async function confirmInterlockAction(opts: InterlockConfirmOptions): Promise<boolean> {
  const { title, actionSummary, violations } = opts
  const blocks = violations.filter((v) => v.severity === 'block')
  if (blocks.length) {
    await showBlocked(violations)
    return false
  }

  const warns = violations.filter((v) => v.severity === 'warn')
  const confirmText = opts.confirmText ?? (warns.length ? '仍要继续' : '确认')

  let html = `<p class="interlock-confirm__action">${actionSummary}</p>`
  if (warns.length) {
    html += `<div class="interlock-confirm__warns">
      <p class="interlock-confirm__warn-title">风险提示（可继续，请谨慎操作）</p>
      ${violationHtml(warns)}
    </div>`
  }

  if (modalBusy) return false
  modalBusy = true
  try {
    await ElMessageBox.confirm(html, title, {
      type: warns.length ? 'warning' : 'info',
      confirmButtonText: confirmText,
      cancelButtonText: '取消',
      center: true,
      dangerouslyUseHTMLString: true,
      closeOnClickModal: false,
      closeOnPressEscape: false,
      distinguishCancelAndClose: true,
      customClass: warns.length
        ? 'interlock-modal-box interlock-confirm-box'
        : 'interlock-confirm-box interlock-confirm-box--plain',
    })
    return true
  } catch {
    return false
  } finally {
    modalBusy = false
  }
}
