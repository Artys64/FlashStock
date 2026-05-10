export function shouldArchiveBatch(input: {
  quantityCurrent: number;
  updatedAt: string;
  now?: Date;
}): boolean {
  if (input.quantityCurrent > 0) return false;

  const now = input.now ?? new Date();
  const updatedAt = new Date(input.updatedAt);
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

  return now.getTime() - updatedAt.getTime() >= sevenDaysInMs;
}
