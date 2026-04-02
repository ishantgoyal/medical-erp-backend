const express = require('express');
const router = express.Router();
const ledgerController = require('../controllers/supplierLedgerViewController');
const verifyToken = require('../middleware/supplierMiddleware');

router.post('/supplier', verifyToken, ledgerController.getSupplierLedger);

module.exports = router;