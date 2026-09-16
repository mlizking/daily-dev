/**
 * The six fixed Categories of an Issue (ADR-0008).
 *
 * Shared by the site and the Run: the site renders them, the Editorial Gate
 * enforces that every one of them is present in every Issue — including the
 * empty ones, which are recorded as empty rather than omitted.
 */

export const CATEGORIES = [
  { id: 'security', labelTh: 'ความปลอดภัย', labelEn: 'Security & Vulnerabilities' },
  { id: 'ai-for-dev', labelTh: 'AI สำหรับนักพัฒนา', labelEn: 'AI for Developers' },
  { id: 'web-frontend', labelTh: 'เว็บและฟรอนต์เอนด์', labelEn: 'Web & Frontend' },
  { id: 'backend-infra', labelTh: 'แบ็กเอนด์และโครงสร้างพื้นฐาน', labelEn: 'Backend & Infra' },
  { id: 'industry-trends', labelTh: 'วงการและทิศทาง', labelEn: 'Industry & Trends' },
  { id: 'technique', labelTh: 'เทคนิคประจำวัน', labelEn: 'Technique of the Day' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as unknown as [
  CategoryId,
  ...CategoryId[],
];

export function categoryById(id: string) {
  return CATEGORIES.find((c) => c.id === id);
}
