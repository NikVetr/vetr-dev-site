// A restore must wait for every write before beginning rollback, including writes
// grouped inside another store operation. Promise.all rejects too early for that.
/** @param {Promise<unknown>[]} jobs @returns {Promise<void>} */
export async function settleWrites(jobs) {
  const results = await Promise.allSettled(jobs);
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, 'Multiple storage writes failed');
}
