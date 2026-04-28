import { ref, shallowRef, onBeforeUnmount } from 'vue';
import * as Cesium from 'cesium';

export function useCesium() {
  const viewer = shallowRef<Cesium.Viewer | null>(null);
  const isReady = ref(false);

  async function initViewer(container: HTMLElement) {
    if (viewer.value) return;

    viewer.value = new Cesium.Viewer(container, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      // 使用 OpenStreetMap 作为底图（不需要 API Key）
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.OpenStreetMapImageryProvider({
          url: 'https://a.tile.openstreetmap.org/',
        })
      ),
    });

    // 禁用光照效果
    viewer.value.scene.globe.enableLighting = false;

    // 飞向台湾
    viewer.value.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(121.0, 23.8, 900000),
      duration: 0,
    });

    isReady.value = true;
  }

  function destroyViewer() {
    viewer.value?.destroy();
    viewer.value = null;
    isReady.value = false;
  }

  function flyTo(longitude: number, latitude: number, altitude = 50000) {
    viewer.value?.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude),
      duration: 1.0,
    });
  }

  onBeforeUnmount(destroyViewer);

  return { viewer, isReady, initViewer, destroyViewer, flyTo };
}
