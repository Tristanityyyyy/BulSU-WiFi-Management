require("dotenv").config();
const express = require("express");

const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/admin/index");
const guestRoutes = require("./routes/guestRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const { startGuestExpirySweeper } = require("./jobs/guestExpiry");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/guest", guestRoutes);
app.use("/api/feedback", feedbackRoutes);

startGuestExpirySweeper();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
