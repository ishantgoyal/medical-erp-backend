const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const app = express();


app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
const cron        = require('node-cron');


const authRoutes = require('./routes/authRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const productRoutes = require('./routes/productRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const suppliersOrderRoutes = require('./routes/supplierOrderRoute');
const saleRoutes = require('./routes/saleRoutes');
const stockRoutes = require('./routes/stockRoutes');
const saleReturnRoutes = require('./routes/saleReturnRoutes');
const paymentRoutes = require('./routes/supplierPaymentRoutes');
const ladgerViewRoutes = require('./routes/supplierLedgerViewRoutes');
const whatsapppdfbillRoutes = require('./routes/billRoutes');
const dashboardStatusRoutes = require('./routes/dashboardRoutes');
const dailyReportRoutes = require('./routes/dailyReportRoute');
const DailyReport = require('./controllers/dailyReportController');




// -------------------Auth ROUTES -----------------------

app.use('/api/auth', authRoutes);

// -------------------Dashboard ROUTES -----------------------

app.use('/api/dashboard', dashboardStatusRoutes);

// -------------------Supplier ROUTES -----------------------

app.use('/api/supplier', supplierRoutes);


// -------------------Supplier Order ROUTES -----------------------
app.use('/api/purchase-order', suppliersOrderRoutes);



// -------------------Product ROUTES -----------------------

app.use('/api/product', productRoutes);

// ------------------- Purchase  ROUTES -----------------------

app.use('/api/purchase', purchaseRoutes);

// ------------------- Sale  ROUTES -----------------------

app.use('/api/sale', saleRoutes);

// ------------------- Stock  ROUTES -----------------------

app.use('/api/stock', stockRoutes);

// ------------------- Stock  ROUTES -----------------------

app.use('/api/sale-return', saleReturnRoutes);


// ------------------- ShopKeepar Payment and Ledger ROUTES -----------------------

app.use('/api/payment', paymentRoutes);
app.use('/api/ledger', ladgerViewRoutes);

// -------------------  scren for sale : whats app pdf and bill download ROUTES -----------------------

app.use('/api/bills', whatsapppdfbillRoutes);

// ------------------- Daily Report ROUTES -----------------------

app.use('/api/daily-report', dailyReportRoutes);




app.get('/', (req, res) => {
  res.status(200).json({
    status: true,
    message: "Medical ERP Backend is running smoothly 🚀",
    version: "1.0.0",
    author: "Eshant Goyal"
  });
});


app.use((req, res) => {
  res.status(404).json({ status: false, message: "Route not found!" });
});

// Step 4 — Cron job — raat 9 baje chalega
// Format: 'second minute hour day month weekday'
// '0 21 * * *' = har din raat 9:00 baje
cron.schedule('0 21 * * *', () => {
    DailyReport.sendDailyReportToAll();
}, {
    timezone: 'Asia/Kolkata' // IST time
});


app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err.stack);
  res.status(500).json({
    status: false,
    message: "Something went wrong on the server!",
    error: err.message
  });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`-------------------------------------------`);
  console.log(`🚀 Server started on port: ${PORT}`);
  console.log(`🏥 Medical ERP: Online`);
  console.log(`-------------------------------------------`);
});


// ─────────────────────────────────────────────
// TEST karna ho toh yeh use karo
// Har 1 minute mein chalega — test ke baad hata dena
// ─────────────────────────────────────────────
// cron.schedule('* * * * *', () => {
//     console.log('Test cron running...');
//     DailyReport.sendDailyReportToAll();
// });