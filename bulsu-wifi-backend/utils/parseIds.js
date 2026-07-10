// Normalizes a request-body ids array into positive integers, dropping anything invalid.
function parseIds(raw) {
  return (raw || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

module.exports = { parseIds };
