import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [
    vue(),
    cesium({
      cesiumBuildRootPath: '../../node_modules/cesium/Build',
      cesiumBuildPath: '../../node_modules/cesium/Build/Cesium/',
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api/llm': {
        target: 'https://api.apimart.ai/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm/, ''),
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
