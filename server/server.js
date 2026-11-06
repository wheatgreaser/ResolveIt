const express = require('express');
const app = express();


const cors = require("cors");

app.use(cors({
    origin: "http://localhost:5173"
}));


const authRoutes = require('./auth');

app.use(express.json());

app.use('/auth', authRoutes);

app.listen(8080, () => {
    console.log('Server listening on port 8080');
});
