import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';
import { staffRouter } from './routes/staff.routes.js';
import { productRouter } from './routes/product.routes.js';
import { rateRouter } from './routes/rate.routes.js';
import { machineRouter } from './routes/machine.routes.js';
import { nozzleRouter } from './routes/nozzle.routes.js';
import { creditRouter } from './routes/credit.routes.js';
import { sheetRouter } from './routes/sheet.routes.js';
import { dayClosingRouter } from './routes/dayClosing.routes.js';
import { auditRouter } from './routes/audit.routes.js';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: [env.WEB_APP_ORIGIN, 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

// Routes
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/staff', staffRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/rates', rateRouter);
app.use('/api/v1/machines', machineRouter);
app.use('/api/v1/nozzles', nozzleRouter);
app.use('/api/v1/credit-customers', creditRouter);
app.use('/api/v1/sheets', sheetRouter);
app.use('/api/v1/day-closing', dayClosingRouter);
app.use('/api/v1/audit-logs', auditRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
});

// Central Error Handler
app.use(errorHandler);

