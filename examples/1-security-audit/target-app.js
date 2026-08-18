// target-app.js
// DUMMY VULNERABLE FILE FOR TESTING GRAY UNITS

const express = require('express');
const app = express();

// Fake hardcoded API key for Threat Intel (GRAY-5) to find
const AWS_SECRET_ACCESS_KEY = "AKIA1234567890FAKEKEY";

app.get('/user', (req, res) => {
    // Fake SQL injection vulnerability for Injection Sifter (GRAY-2) to find
    const userId = req.query.id;
    const query = "SELECT * FROM users WHERE id = " + userId;
    
    // Fake XSS vulnerability 
    res.send("<h1>Hello " + req.query.name + "</h1>");
});

// Buffer logic that might trigger Memory & Logic Guardian (GRAY-1)
function handleBuffer(input) {
    let buf = Buffer.allocUnsafe(10);
    input.copy(buf);
}

app.listen(3000, () => console.log('Vulnerable app running on port 3000'));
