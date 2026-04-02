const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const app = express();


app.use(cors());
app.use(express.json());
app.use(morgan('dev'));


const authRoutes = require('./routes/authRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const productRoutes = require('./routes/productRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const saleRoutes = require('./routes/saleRoutes');
const stockRoutes = require('./routes/stockRoutes');
const saleReturnRoutes = require('./routes/saleReturnRoutes');
const paymentRoutes = require('./routes/supplierPaymentRoutes');
const ladgerViewRoutes = require('./routes/supplierLedgerViewRoutes');
const dashboardStatusRoutes = require('./routes/dashboardRoutes');


// -------------------Auth ROUTES -----------------------

app.use('/api/auth', authRoutes);

// -------------------Dashboard ROUTES -----------------------

app.use('/api/dashboard', dashboardStatusRoutes);

// -------------------Supplier ROUTES -----------------------

app.use('/api/supplier', supplierRoutes);

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



app.get('/', (req, res) => {
  res.status(200).json({
    status: true,
    message: "Medical ERP Backend is running smoothly 🚀",
    version: "1.0.0",
    author: "Esant Goyal"
  });
});


app.use((req, res) => {
  res.status(404).json({ status: false, message: "Route not found!" });
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