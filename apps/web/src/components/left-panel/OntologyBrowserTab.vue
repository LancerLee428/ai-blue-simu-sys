<script setup lang="ts">
import { demoForceUnits, demoPlatforms, demoGeoZones } from '@ai-blue-simu-sys/ontology';

const forceUnits = demoForceUnits;
const platforms = demoPlatforms;
const geoZones = demoGeoZones;
</script>

<template>
  <div class="ontology-browser">
    <section class="section">
      <h3 class="section-title">兵力单元</h3>
      <div v-for="unit in forceUnits" :key="unit.id" class="entity-row">
        <span class="entity-row__icon">✦</span>
        <div class="entity-row__body">
          <strong>{{ unit.unitName }}</strong>
          <span>{{ unit.unitType }} · {{ unit.forceSide }}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">平台装备</h3>
      <div v-for="platform in platforms" :key="platform.id" class="entity-row">
        <span class="entity-row__icon">◇</span>
        <div class="entity-row__body">
          <strong>{{ platform.platformName }}</strong>
          <span>{{ platform.platformType }}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">地理区域</h3>
      <div v-for="zone in geoZones" :key="zone.id" class="entity-row">
        <span class="entity-row__icon">▣</span>
        <div class="entity-row__body">
          <strong>{{ zone.zoneName }}</strong>
          <span>{{ zone.zoneType }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ontology-browser {
  display: grid;
  gap: 20px;
}

.section-title {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6bc4ff;
  margin: 0 0 8px;
  font-weight: 500;
}

.entity-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  margin-bottom: 4px;
  transition: background 0.15s;
  cursor: default;
}

.entity-row:hover {
  background: rgba(107, 196, 255, 0.05);
}

.entity-row__icon {
  font-size: 14px;
  color: #8ea4c9;
  flex-shrink: 0;
}

.entity-row__body {
  min-width: 0;
}

.entity-row__body strong {
  display: block;
  font-size: 13px;
  color: #e2ebfb;
  font-weight: 500;
}

.entity-row__body span {
  display: block;
  font-size: 11px;
  color: #8ea4c9;
  margin-top: 2px;
}
</style>
