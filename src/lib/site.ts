/**
 * The site's identity, in one place. The title and description appear in the page head, the
 * RSS feed and the meta tags, and they drifted apart when they lived in three files.
 */

export const SITE = {
  title: 'Daily Dev Brief',
  description: 'สรุปวงการ dev รายวัน อ่านจบในราว 10–20 นาที',
  origin: 'https://daily.mlizking.dev',
} as const;

/**
 * The message for a Category with no Items.
 *
 * It is a statement about our Gate, not about the world, so it is fixed here rather than
 * written by the model. The writer once produced "ไม่มีข้อมูลใหม่ในหมวดนี้วันนี้" on its own,
 * which means the wording — and the claim — would have drifted from Run to Run for no reason.
 */
export const EMPTY_CATEGORY_MESSAGE = 'วันนี้ไม่มีอะไรผ่านเกณฑ์ในหมวดนี้';

/** Tags the site knows how to explain, for the tag pages. */
export const TAG_LABELS: Record<string, string> = {
  cncf: 'CNCF',
  cloudnative: 'Cloud Native',
  kubernetes: 'Kubernetes',
  observability: 'Observability',
  devsecops: 'DevSecOps',
  'supply-chain': 'Supply Chain',
  ai: 'AI',
  'ai-technique': 'เทคนิคการใช้ AI',
};
