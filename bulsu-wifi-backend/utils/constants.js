const TRASH_RETENTION_DAYS = 30;

// Every account number — a student's student number and a faculty/staff member's ID —
// is exactly 10 digits. Enforced wherever an account is created (the Add User form and
// the roster import), but never on lookups: accounts predating the rule can still carry
// shorter legacy numbers and must stay editable, transitionable and able to log in.
const ACCOUNT_NUMBER_LENGTH = 10;
const ACCOUNT_NUMBER_PATTERN = /^\d{10}$/;
const ACCOUNT_NUMBER_MESSAGE = `Student number / ID must be exactly ${ACCOUNT_NUMBER_LENGTH} digits.`;

// Per-role session window (minutes) used until an admin saves Settings → Network.
// Shared because three places need the same fallback: login (which decides whether
// an old session still holds a device slot), the dashboard countdown, and the
// sweeper that actually ends a session once the window closes.
const DEFAULT_SESSION_TIMEOUT_MIN = { student: 120, faculty: 240, staff: 240, admin: 240 };

module.exports = {
  TRASH_RETENTION_DAYS,
  DEFAULT_SESSION_TIMEOUT_MIN,
  ACCOUNT_NUMBER_LENGTH,
  ACCOUNT_NUMBER_PATTERN,
  ACCOUNT_NUMBER_MESSAGE,
};
