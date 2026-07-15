// Normalizes a request-body ids array into positive integers, dropping anything invalid.
// `raw` may be missing or malformed (a bare number/string instead of an array) if the
// client sends a malformed payload, so anything that isn't an array is treated as empty
// rather than crashing on `.map`.
function parseIds(raw) {
  return (Array.isArray(raw) ? raw : []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

module.exports = { parseIds };
