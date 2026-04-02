const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();

const supplierController = require('../controllers/supplierController');
const verifyToken = require('../middleware/supplierMiddleware');

router.post('/add', verifyToken, upload.none(), supplierController.addSupplier);
router.get('/list', verifyToken, supplierController.getSuppliers);
router.put('/update-supplier/:id', verifyToken,upload.none(), supplierController.updateSupplier);
router.get('/get-supplier/:id', verifyToken, supplierController.getSupplierById);
router.delete('/delete-supplier/:id', verifyToken, supplierController.deleteSupplier);

module.exports = router;

