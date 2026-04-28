import { ref, type ShallowRef } from 'vue';
import * as Cesium from 'cesium';

export function useEntitySelection(viewerRef: ShallowRef<Cesium.Viewer | null>) {
  const selectedEntityId = ref<string | null>(null);
  let handler: Cesium.ScreenSpaceEventHandler | null = null;

  function initSelectionHandler(onSelect: (id: string | null) => void) {
    const viewer = viewerRef.value;
    if (!viewer) return;

    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(
      (movement: { position: Cesium.Cartesian2 }) => {
        const picked = viewer.scene.pick(movement.position);
        if (picked && 'id' in picked && picked.id && typeof picked.id.id === 'string') {
          selectedEntityId.value = picked.id.id;
          onSelect(picked.id.id);
        } else {
          selectedEntityId.value = null;
          onSelect(null);
        }
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );
  }

  function destroySelectionHandler() {
    handler?.destroy();
    handler = null;
  }

  return { selectedEntityId, initSelectionHandler, destroySelectionHandler };
}
