const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer(); 

const SalesReturnController = require('../controllers/saleReturnController');
const verifyToken = require('../middleware/supplierMiddleware'); 

// 1. Bill Details fetch karna (Return page par Bill No se search ke liye)
router.get('/get-bill/:bill_no', verifyToken, SalesReturnController.getBillForReturn);

// 2. Sales Return Add karna (JSON data aayega isliye upload.none() ki shayad zaroorat na pade, par consistency ke liye rakha hai)
router.post('/add', verifyToken, upload.none(), SalesReturnController.addSalesReturn);

// 3. Saari Sales Returns ki list/history dekhna
router.get('/list', verifyToken, SalesReturnController.getReturnList);

// 4. Kisi specific Return ki detail dekhna (View purpose)
router.get('/view/:id', verifyToken, SalesReturnController.getReturnDetail);

module.exports = router;