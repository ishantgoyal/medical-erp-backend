const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();

const ProductController = require('../controllers/stockController');
const verifyToken = require('../middleware/supplierMiddleware');



router.get('/status', verifyToken, ProductController.getStockStatus);
module.exports = router;