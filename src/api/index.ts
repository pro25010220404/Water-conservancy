// ============================================================
// API 层统一导出
// ============================================================
export { default as http } from './request'
export * from './auth'
export * from './dashboard'
export * from './equipment'
export * from './settings'
export * from './profile'
export * from './history'
export * from './warning'
export * from './dispatch'
export { startSimulation, pauseSimulation, resumeSimulation, resetSimulation, getSimulationStatus, getModelList, startTraining, generateReport, getReportList, getFaultReviewList, getFaultReviewDetail, importToSimulation, getCockpitKpi } from './simulation'
