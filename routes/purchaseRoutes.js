const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer(); 

const PurchaseController = require('../controllers/purchaseController');
const verifyToken = require('../middleware/supplierMiddleware'); 


router.post('/add', verifyToken, upload.none(), PurchaseController.addPurchase);
router.get('/list', verifyToken, PurchaseController.getPurchaseList);
router.get('/search-med', verifyToken, PurchaseController.searchMedicine);
router.put('/update/:id', verifyToken, upload.none(), PurchaseController.updatePurchase);
router.get('/view/:id', verifyToken, PurchaseController.getPurchaseById);
router.delete('/delete/:id', verifyToken, PurchaseController.deletePurchase);

module.exports = router;
