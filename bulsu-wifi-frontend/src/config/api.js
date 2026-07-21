// Talk to the backend on whatever host this page was loaded from (localhost,
// a LAN IP, etc.) so the same build works from any device without rebuilding.
// VITE_API_URL still overrides this when set, for cases that need a fixed target.
export const API_BASE =
  import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000/api`;
