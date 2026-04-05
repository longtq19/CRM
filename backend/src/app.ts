import './env';
import express, { type Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import apiRoutes from './routes/api';
import webhookRoutes from './routes/webhookRoutes';
import { apiErrorHandler } from './middleware/apiErrorHandler';
import { getRootDir } from './utils/pathHelper';
import { auditLog } from './middleware/auditLogMiddleware';

console.log('[ZENO] Backend loading...');

const app = express();

/** Đặt IP thật khi sau reverse proxy (cookie secure, rate limit, v.v.). */
app.set('trust proxy', 1);

// Middleware
app.use(compression());
/** Helmet mặc định: img-src 'self' data: — mở rộng https/blob cho ảnh ngoài / map. */
const cspDefaults = helmet.contentSecurityPolicy.getDefaultDirectives();
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        ...cspDefaults,
        'img-src': [...cspDefaults['img-src'], 'https:', 'blob:'],
        'script-src': [...cspDefaults['script-src'], 'https://analytics.kagri.tech'],
        'connect-src': ["'self'", 'https:', 'wss:'],
        'frame-src': ["'self'", 'https:'],
      },
    },
  }),
);
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

const rootDir = getRootDir();
const staticCacheOptions = { maxAge: '7d', etag: true, lastModified: true };

/** Ảnh đại diện ghi đè cùng URL — không cache dài để mọi máy thấy bản mới nhất sau khi đổi ảnh. */
const avatarStaticOptions = {
  etag: true,
  lastModified: true,
  setHeaders: (res: Response) => {
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
  },
};

// Compat fallback: map legacy `/uploads/images/:filename` to avatars if present
app.get('/uploads/images/:filename', (req, res, next) => {
  const avatars = path.join(rootDir, 'uploads/avatars', req.params.filename);
  fs.access(avatars, fs.constants.F_OK, (err) => {
    if (!err) {
      res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
      return res.sendFile(avatars);
    }
    next();
  });
});

// Serve static files with cache headers
app.use('/uploads/images', express.static(path.join(rootDir, 'uploads/images'), staticCacheOptions));
app.use('/uploads/avatars', express.static(path.join(rootDir, 'uploads/avatars'), avatarStaticOptions));
app.use('/uploads/chat', express.static(path.join(rootDir, 'uploads/chat'), staticCacheOptions));
app.use('/uploads/marketing-costs', express.static(path.join(rootDir, 'uploads/marketing-costs'), staticCacheOptions));
app.use('/uploads/products', express.static(path.join(rootDir, 'uploads/products'), staticCacheOptions));
app.use('/uploads/contracts', express.static(path.join(rootDir, 'uploads/contracts'), staticCacheOptions));
app.use('/uploads/support-tickets', express.static(path.join(rootDir, 'uploads/support-tickets'), staticCacheOptions));

// Webhook routes (public, no auth required) - must be before audit middleware
app.use('/api/webhook', webhookRoutes);

// Apply Audit Log Middleware to all API routes (logs write operations)
app.use('/api', auditLog);

// Apply API routes
app.use('/api', apiRoutes);
app.use(apiErrorHandler);

// Production: serve frontend SPA (built files in ../frontend/dist)
const frontendDist = path.join(rootDir, '..', 'frontend', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(frontendDist, 'index.html'))) {
  const noStoreHtml =
    'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
  // index.html không cache: sau deploy Vite đổi tên chunk; nếu HTML cũ còn cache → lỗi import động.
  // Chỉ /assets/* (tên có hash) mới cache dài + immutable; file public gốc (logo, …) cache ngắn.
  app.use(
    express.static(frontendDist, {
      etag: true,
      lastModified: true,
      setHeaders: (res, filepath) => {
        const base = path.basename(filepath);
        if (filepath.endsWith(`${path.sep}index.html`) || base === 'index.html') {
          res.setHeader('Cache-Control', noStoreHtml);
          return;
        }
        const norm = filepath.split(path.sep).join('/');
        if (norm.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return;
        }
        res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    }),
  );
  // path-to-regexp v7+ không chấp nhận '*'; dùng regex cho SPA fallback
  app.get(/(.*)/, (_req, res) => {
    res.setHeader('Cache-Control', noStoreHtml);
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Zeno ERP Backend Server');
  });
}

export default app;
