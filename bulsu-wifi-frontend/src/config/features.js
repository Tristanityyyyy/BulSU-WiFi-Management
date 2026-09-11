// Flags for features whose code we keep but whose UI we don't show.
//
// A flag here hides entry points only — the page, its modal and hooks, the
// settings key and every backend route stay exactly as they are. Flip a flag
// back to true and the feature returns with nothing else to change.

// Emergency priority, retired 2026-09-11: the team stopped using it but chose
// to keep the implementation in the project. This hides the admin nav item,
// the /admin/emergency page and the Emergency Priority setting.
export const SHOW_EMERGENCY = false;
