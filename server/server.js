const express = require('express');
const app = express();
const cors = require("cors");
app.use(cors({
    origin: "http://localhost:5173"
}));
const pool = require("./db");


const authRoutes = require('./auth');
const incidentRoutes = require('./incidents');
const chatbotRoutes = require('./chatbot');
const { runSlaChecks } = require("./slaMonitor");

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/incidents', incidentRoutes);
app.use('/chatbot', chatbotRoutes);
app.listen(8080, () => {
    console.log('Server listening on port 8080');
});
const SLA_CHECK_INTERVAL = 60 * 1000;

runSlaChecks(pool);

setInterval(() => {
    runSlaChecks(pool);
}, SLA_CHECK_INTERVAL);
