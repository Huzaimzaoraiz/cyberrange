const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const settings = require('./config');
const { connect } = require('./db');
const database = require('./database');
const orchestrator = require('./orchestrator');

const app = express();

// Middleware
app.use(cors({
  origin: settings.corsOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routers
const authRouter = require('./routes/auth');
const challengesRouter = require('./routes/challenges');
const labsRouter = require('./routes/labs');
const adminRouter = require('./routes/admin');

app.use('/api', authRouter);
app.use('/api', challengesRouter);
app.use('/api', labsRouter);
app.use('/api', adminRouter);

const PORT = process.env.PORT || 8000;

async function startServer() {
  try {
    // Connect to MongoDB
    const mongoDb = await connect();
    
    // Initialize database layer
    database.setDb(mongoDb);
    await database.initDb(mongoDb);
    
    // Clean up any stale docker containers
    await orchestrator.cleanupStaleResources();

    // Start listening
    app.listen(PORT, () => {
      console.log(`Express server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
