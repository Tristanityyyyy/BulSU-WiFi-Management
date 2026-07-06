const router = require('express').Router();
const db = require('../../db');

// GET /api/admin/settings
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM settings');
    const result = {};
    rows.forEach((r) => { result[r.setting_key] = r.setting_value; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch settings.' });
  }
});

// PUT /api/admin/settings
router.put('/', async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    if (entries.length === 0)
      return res.status(400).json({ message: 'No settings provided.' });
    for (const [key, value] of entries) {
      await db.query(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
        [key, value]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save settings.' });
  }
});

module.exports = router;
