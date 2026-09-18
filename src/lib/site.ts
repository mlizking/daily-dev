/**
 * The site's identity, in one place. The title and description appear in the page head, the
 * RSS feed and the meta tags, and they drifted apart when they lived in three files.
 */

export const SITE = {
  title: 'Daily Dev Brief',
  description: 'สรุปวงการ dev รายวัน อ่านจบในราว 10–20 นาที',
  origin: 'https://daily.mlizking.dev',
} as const;
