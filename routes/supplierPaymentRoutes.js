const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/supplierPaymentController');
const verifyToken = require('../middleware/supplierMiddleware');

router.post('/add', verifyToken, paymentController.addPayment);

module.exports = router;