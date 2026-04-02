const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();

const ProductController = require('../controllers/productController');
const verifyToken = require('../middleware/supplierMiddleware');


router.post('/add', verifyToken, upload.none(), ProductController.addProduct);
router.get('/list', verifyToken, ProductController.getProducts);
router.put('/update/:id', verifyToken, upload.none(), ProductController.updateProduct);
router.get('/view/:id', verifyToken, ProductController.getProductById);
router.delete('/delete/:id', verifyToken, ProductController.deleteProduct);

module.exports = router;