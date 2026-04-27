// routes/dailyReportRoutes.js
const express    = require('express');
const router     = express.Router();
const DailyReport = require('../controllers/dailyReportController');
const verifyToken = require('../middleware/supplierMiddleware');

// Manual report — owner kabhi bhi le sakta hai
router.get('/send', verifyToken, DailyReport.sendManualReport);

// Sirf data — frontend dashboard ke liye
router.get('/data', verifyToken, DailyReport.getReportData);

module.exports = router;