const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer(); 

const SalesController = require('../controllers/saleController');
const verifyToken = require('../middleware/supplierMiddleware'); 


router.post('/add', verifyToken, upload.none(), SalesController.addSales);
router.get('/list', verifyToken, SalesController.getSalesList);
router.get('/search-stock', verifyToken, SalesController.searchStockForSales);
router.get('/view/:id', verifyToken, SalesController.getSalesDetail);
router.put('/update/:id', verifyToken, upload.none(), SalesController.updateSales);
router.delete('/delete/:id', verifyToken, SalesController.deleteSales);

module.exports = router;