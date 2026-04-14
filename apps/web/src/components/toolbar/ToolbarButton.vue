<script setup lang="ts">
interface Props {
  active?: boolean;
  icon?: string;
}

withDefaults(defineProps<Props>(), {
  active: false,
  icon: '',
});
</script>

<template>
  <button class="toolbar-btn" :class="{ active }">
    <span v-if="icon" class="toolbar-btn__icon">{{ icon }}</span>
    <slot />
  </button>
</template>

<style scoped>
.toolbar-btn__icon {
  font-size: 15px;
  line-height: 1;
}
</style>
