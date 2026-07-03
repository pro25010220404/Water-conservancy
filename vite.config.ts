import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  // @ts-ignore - vite-plugin-cesium type issue
  plugins: [vue(), cesium()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 全局注入设计 Token 变量文件
        additionalData: `@use "@/assets/styles/design-tokens.scss" as *;`,
      },
    },
  },
})
