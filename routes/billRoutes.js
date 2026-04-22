const express = require('express');
const router = express.Router();

const BillController = require('../controllers/billController');
const verifyToken = require('../middleware/supplierMiddleware');

router.get('/pdf/:sale_id', verifyToken, BillController.generateA4PDF);
router.get('/whatsapp/:sale_id', verifyToken, BillController.getWhatsAppLink);

module.exports = router;