const mysql = require("mysql2"); 

// Create a connection
const conn = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl : {
    rejectUnauthorized : true
  }
});


// Connect to the database

conn.connect((err) => {
  if (err) {
    console.log("Error connecting to the database", err);
    return;
  }
  console.log("Connection established");
});

module.exports = conn;