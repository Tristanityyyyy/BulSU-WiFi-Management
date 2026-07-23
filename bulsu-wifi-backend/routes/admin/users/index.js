const router = require('express').Router();

// importExport and transition first: their literal paths (/parse-xlsx,
// /check-existing, /csv-template, /csv-import, /transition/*) must stay ahead of
// crud's parameterized /:id routes.
router.use(require('./importExport'));
router.use(require('./transition'));
router.use(require('./crud'));
router.use(require('./trash'));

module.exports = router;
