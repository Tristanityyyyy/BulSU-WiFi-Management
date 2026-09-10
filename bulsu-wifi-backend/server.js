require("dotenv").config();
const express = require("express");

const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/admin/index");
const guestRoutes = require("./routes/guestRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const { startGuestExpirySweeper } = require("./jobs/guestExpiry");
const { startTrashPurgeSweeper } = require("./jobs/userTrashPurge");
const { startDataUsageMeter } = require("./jobs/dataUsageMeter");
const { startSessionPresenceSweeper } = require("./jobs/sessionPresence");
const { startOrphanGrantSweeper } = require("./jobs/orphanGrants");
const { startSessionNoticeSweeper } = require("./jobs/sessionNotices");
const { ensureParentQueue } = require("./utils/routeros");
const { getUplinkTotalMbps } = require("./utils/settings");

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173,http://192.168.88.5:5173").split(",");
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/guest", guestRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/session", sessionRoutes);

startGuestExpirySweeper();
startTrashPurgeSweeper();
startDataUsageMeter();
startSessionPresenceSweeper();
startOrphanGrantSweeper();
startSessionNoticeSweeper();

// Put the parent queue up before the first client connects, so a session opened
// seconds after a restart is already hanging under it. Deliberately not awaited:
// a router that is slow or unreachable must not hold the port closed, and the
// orphan sweeper re-asserts this every 15 minutes regardless.
getUplinkTotalMbps()
  .then(ensureParentQueue)
  .catch((err) => console.error("Parent queue setup failed at startup:", err.message));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
