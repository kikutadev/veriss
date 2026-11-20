// A missing oracle input is a test failure, not an empty or successful observation.
export function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

// The migration baseline's LayoutSummary declaration predates the warning rows.
// Check the fields the oracle consumes, rather than asserting an unchecked type.
export function layoutWarnings(report: object): {code: string; box?: string}[] {
  if (!('layoutWarnings' in report) || report.layoutWarnings === undefined) return [];
  if (!Array.isArray(report.layoutWarnings)) throw new Error('Invalid layout warnings');
  const rows: unknown[] = report.layoutWarnings;
  return rows.map(row => {
    if (!row || typeof row !== 'object' || !('code' in row) || typeof row.code !== 'string') throw new Error('Invalid layout warning');
    const box = 'box' in row ? row.box : undefined;
    if (box !== undefined && typeof box !== 'string') throw new Error('Invalid layout warning box');
    return {code: row.code, ...(box === undefined ? {} : {box})};
  });
}
