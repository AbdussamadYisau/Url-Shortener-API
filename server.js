const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const mongoose = require("mongoose");
// const cors = require("cors");
require("dotenv/config");



// For CORs

// app.use(cors());

app.use((req,res,next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});


// Middlewares
app.use(bodyParser.json()); // application/json
app.use(bodyParser.urlencoded({ extended: true }));


// Define Routes
app.use('/', require('./routes/index'));
app.use('/api/url', require('./routes/url'));


// Conect to Database

const connectDB = async () => {
    try {
        await mongoose.connect(
              process.env.DB_CONNECTION,
              {
                useNewUrlParser: true,
                useUnifiedTopology: true,
              }
            );
        console.log('MongoDB Connected.');
    } catch(err) {
        console.log(err.message);
        process.exit(1);
    }
}

connectDB();


// Listening port
app.listen(process.env.PORT || 8080, () => {
  console.log(
    `This application is running on port ${process.env.PORT || 8080} `
  );
});