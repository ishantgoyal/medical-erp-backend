const express = require('express');
const router = express.Router();
const PO = require('../controllers/supplierOrderController');
const verifyToken = require('../middleware/supplierMiddleware');

router.post('/create', verifyToken, PO.createOrder);
router.get('/list', verifyToken, PO.getOrderList);
router.get('/detail/:id', verifyToken, PO.getOrderDetail);


module.exports = router;