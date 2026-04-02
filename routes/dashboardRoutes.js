const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const verifyToken = require('../middleware/supplierMiddleware');

// Isme verifyToken zaroori hai
router.get('/stats', verifyToken, dashboardController.getDashboardStats);

module.exports = router;