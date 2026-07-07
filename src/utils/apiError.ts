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
