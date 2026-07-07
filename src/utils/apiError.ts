/** 业务错误 — 保留 code / data 供登录页等场景解析 */
export class ApiBusinessError extends Error {
  code: number
  data: unknown

  constructor(code: number, msg: string, data?: unknown) {
    super(msg)
    this.name = 'ApiBusinessError'
    this.code = code
    this.data = data ?? null
  }
}

export function isApiBusinessError(err: unknown): err is ApiBusinessError {
  return err instanceof ApiBusinessError
}

/** HTTP 404 或业务码 30001「接口不存在」 */
export function isApiNotFoundError(err: unknown): boolean {
  if (isApiBusinessError(err)) {
    return err.code === 30001 || /接口不存在|not found/i.test(err.message)
  }
  if (err && typeof err === 'object' && 'response' in err) {
    return (err as { response?: { status?: number } }).response?.status === 404
  }
  return false
}
