import { ref, shallowRef, onBeforeUnmount } from 'vue';
import * as Cesium from 'cesium';

export function useCesium() {
  const viewer = shallowRef<Cesium.Viewer | null>(null);
  const isReady = ref(false);

  async function createOfflineBaseLayer() {
    const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
    );
    return new Cesium.ImageryLayer(provider);
  }

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
      // 使用 Cesium 内置 NaturalEarthII 离线底图，避免内网环境请求外部瓦片导致地球黑屏。
      baseLayer: await createOfflineBaseLayer(),
    });

    // 禁用光照效果
    viewer.value.scene.globe.enableLighting = false;

    // 让时钟持续运行，粒子系统依赖时钟 tick 来更新粒子
    viewer.value.clock.shouldAnimate = true;
    viewer.value.clock.canAnimate = true;
    viewer.value.clock.multiplier = 1;
    viewer.value.clock.clockRange = Cesium.ClockRange.UNBOUNDED;

    // 强制每帧推进时钟，防止 Cesium 内部逻辑停止时钟
    const v = viewer.value;
    v.scene.preRender.addEventListener(() => {
      if (!v.clock.shouldAnimate || !v.clock.canAnimate) {
        v.clock.shouldAnimate = true;
        v.clock.canAnimate = true;
      }
    });

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
