const router = require('express').Router();

// importExport first: its literal paths (/parse-xlsx, /check-existing, /csv-template,
// /csv-import) must stay ahead of crud's parameterized /:id routes.
router.use(require('./importExport'));
router.use(require('./crud'));
router.use(require('./trash'));

module.exports = router;
