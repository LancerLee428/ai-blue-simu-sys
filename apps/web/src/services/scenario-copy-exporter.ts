import type { TacticalScenario } from '../types/tactical-scenario';
import { XmlScenarioExporter } from './xml-scenario-exporter';

export interface ScenarioXmlCopyExport {
  fileName: string;
  content: string;
}

function sanitizeFileNameSegment(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'scenario';
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    '-',
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join('');
}

export function getScenarioCopyBaseName(scenario: TacticalScenario): string {
  return sanitizeFileNameSegment(
    scenario.scenarioMetadata?.name
      ?? scenario.summary
      ?? scenario.id
      ?? 'scenario',
  );
}

export function createScenarioXmlCopyExport(
  scenario: TacticalScenario,
  savedAt = new Date(),
  exporter = new XmlScenarioExporter(),
): ScenarioXmlCopyExport {
  const baseName = getScenarioCopyBaseName(scenario);
  return {
    fileName: `${baseName}-edited-copy-${formatTimestamp(savedAt)}.xml`,
    content: exporter.export(scenario),
  };
}
