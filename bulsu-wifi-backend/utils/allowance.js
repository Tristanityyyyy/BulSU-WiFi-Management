const db = require("../db");
const { getSettings } = require("./settings");
const { CAPPED_ROLES } = require("./constants");
const { activePriorityGrant, emergencyDataCapGb } = require("./emergency");

// data_usage rows are keyed by CURDATE(), so an allowance resets at the database
// server's local midnight. Compute it the same way rather than in UTC, or the
// countdown shown to a student would be hours out.
function secondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.floor((midnight - now) / 1000);
}

// Today's data position for one account, in the shape every client-facing
// allowance view renders: the password-checked lookup on the usage page, and
// the device-recognised one that needs no password at all. Shared so the two
// can never disagree about what "remaining" means.
//
// Deliberately states no opinion on whether the account may connect — being
// over the cap, blocked or unenrolled all gate connecting, not looking, and
// those are exactly the people who most need to see this number.
async function getAllowance(user) {
  const capSettings = CAPPED_ROLES.includes(user.role)
    ? await getSettings([`data_cap_gb_${user.role}`])
    : {};
  const capGb = Number(capSettings[`data_cap_gb_${user.role}`]) || 0;

  // An active emergency priority raises this account's cutoff, so it has to
  // raise the figure the account is shown. Being told 1 GB while the meter is
  // enforcing 4 is not a cosmetic mismatch: the ring, the remaining figure and
  // the low-data warning are the only way anyone finds out a grant arrived, and
  // quoting the role's number makes an emergency look like it did nothing.
  //
  // `undefined` = no priority; `null` back from emergencyDataCapGb = no cutoff
  // at all, which is the same "unlimited" the 0 case below already renders.
  const grant = CAPPED_ROLES.includes(user.role)
    ? await activePriorityGrant(user.id)
    : undefined;
  const effectiveCapGb = grant === undefined ? capGb : emergencyDataCapGb(capGb, grant);

  const [[usage]] = await db.query(
    "SELECT bytes_used FROM data_usage WHERE user_id=? AND usage_date=CURDATE()",
    [user.id]
  );
  const dataUsedMB = Math.round((usage?.bytes_used || 0) / (1024 * 1024));
  const dataLimitMB = effectiveCapGb > 0 ? effectiveCapGb * 1024 : null; // null = unlimited

  return {
    role: user.role,
    dataUsedMB,
    dataLimitMB,
    remainingMB: dataLimitMB === null ? null : Math.max(0, dataLimitMB - dataUsedMB),
    resetsInSec: secondsUntilMidnight(),
  };
}

module.exports = { getAllowance, secondsUntilMidnight };
