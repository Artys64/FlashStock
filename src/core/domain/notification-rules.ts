const LONG_SHELF_LIFE_THRESHOLD_DAYS = 180;
const MEDIUM_SHELF_LIFE_THRESHOLD_DAYS = 61;

const LONG_MILESTONES = [30, 15, 7, 1] as const;
const MEDIUM_MILESTONES = [15, 7, 3, 1] as const;
const SHORT_MILESTONES = [7, 3, 1] as const;

export function resolveAutoMilestones(totalShelfLifeDays: number): readonly number[] {
  if (!Number.isFinite(totalShelfLifeDays) || totalShelfLifeDays < MEDIUM_SHELF_LIFE_THRESHOLD_DAYS) {
    return SHORT_MILESTONES;
  }

  if (totalShelfLifeDays >= LONG_SHELF_LIFE_THRESHOLD_DAYS) {
    return LONG_MILESTONES;
  }

  return MEDIUM_MILESTONES;
}

export function shouldTriggerAlertMilestone(input: {
  daysUntilExpiry: number;
  totalShelfLifeDays: number;
}): boolean {
  if (!Number.isInteger(input.daysUntilExpiry) || input.daysUntilExpiry <= 0) return false;
  const milestones = resolveAutoMilestones(input.totalShelfLifeDays);
  return milestones.includes(input.daysUntilExpiry);
}
