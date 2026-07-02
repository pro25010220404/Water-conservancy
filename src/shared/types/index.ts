// ============================================================
// 全局 TypeScript 类型定义
// ============================================================

// ---------- API 通用响应结构 ----------
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// ---------- 分页请求参数 ----------
export interface PageParams {
  pageNum: number
  pageSize: number
}

// ---------- 分页响应数据 ----------
export interface PageResult<T> {
  list: T[]
  total: number
  pageNum: number
  pageSize: number
}

// ---------- 通用下拉选项 ----------
export interface DictOption {
  label: string
  value: string | number
  color?: string
}

// ---------- 字典映射表 ----------
export type DictMap = Record<string | number, DictOption>
