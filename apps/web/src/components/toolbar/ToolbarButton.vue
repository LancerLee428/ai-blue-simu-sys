<script setup lang="ts">
interface Props {
  active?: boolean;
  icon?: string;
  iconSrc?: string;
  disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
  active: false,
  icon: "",
  iconSrc: "",
  disabled: false,
});
</script>

<template>
  <button class="toolbar-btn" :class="{ active }" :disabled="disabled">
    <img v-if="iconSrc" class="toolbar-btn__image" :src="iconSrc" alt="" />
    <span v-if="icon" class="toolbar-btn__icon">{{ icon }}</span>
    <slot />
  </button>
</template>

<style scoped>
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100px;
  height: 40px;
  padding: 0 13px;
  border: 1px solid rgba(43, 126, 255, 0.68);
  border-radius: 4px;
  color: #9fc9ff;
  background: linear-gradient(
    180deg,
    rgba(13, 48, 105, 0.82),
    rgba(4, 22, 52, 0.84)
  );
  box-shadow:
    inset 0 0 12px rgba(31, 120, 255, 0.16),
    0 6px 18px rgba(0, 0, 0, 0.22);
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease,
    color 0.16s ease;
}

.toolbar-btn:hover,
.toolbar-btn.active {
  color: #ffffff;
  border-color: rgba(56, 145, 255, 0.95);
  background: linear-gradient(
    180deg,
    rgba(18, 102, 223, 0.96),
    rgba(8, 58, 147, 0.96)
  );
  box-shadow:
    inset 0 0 14px rgba(125, 197, 255, 0.22),
    0 8px 22px rgba(19, 96, 221, 0.28);
}

.toolbar-btn.contextual:not(.active) {
  color: #d6e8ff;
  border-color: rgba(56, 145, 255, 0.72);
  box-shadow:
    inset 0 0 12px rgba(31, 120, 255, 0.2),
    0 6px 18px rgba(19, 96, 221, 0.16);
}

.toolbar-btn:disabled {
  cursor: not-allowed;
  color: rgba(159, 201, 255, 0.42);
  border-color: rgba(43, 126, 255, 0.24);
  background: rgba(4, 22, 52, 0.52);
  box-shadow: none;
}

.toolbar-btn__image {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.toolbar-btn__icon {
  font-size: 15px;
  line-height: 1;
}
</style>
