const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const morgan = require('morgan');
const path = require('path');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const inMemoryProducts = [
  {
    id: 'demo-product-1',
    name: 'LaunchFlow',
    description: 'A no-code launch dashboard for campaigns, product updates, and analytics.',
    url: 'https://example.com/launchflow',
    documentationUrl: 'https://example.com/docs/launchflow',
    category: 'Productivity',
    tags: ['dashboard', 'saas', 'marketing'],
    coverImage: '',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-product-2',
    name: 'DevBoard',
    description: 'Project planning workspace for engineering teams and product managers.',
    url: 'https://example.com/devboard',
    documentationUrl: 'https://example.com/docs/devboard',
    category: 'Developer Tools',
    tags: ['workflow', 'team', 'planning'],
    coverImage: '',
    createdAt: new Date().toISOString(),
  },
];

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    url: { type: String, required: true },
    documentationUrl: { type: String, default: '' },
    category: { type: String, default: 'General' },
    tags: { type: [String], default: [] },
    coverImage: { type: String, default: '' },
  },
  { timestamps: true }
);

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

const signToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};

const verifyToken = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const [header, payload, signature] = token.split('.');

  if (!header || !payload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (expectedSignature !== signature) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const corsOptions = {
  origin: CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

const normalizeProduct = (product) => ({
  id: product._id ? String(product._id) : product.id,
  name: product.name,
  description: product.description,
  url: product.url,
  documentationUrl: product.documentationUrl || '',
  category: product.category || 'General',
  tags: Array.isArray(product.tags) ? product.tags : [],
  coverImage: product.coverImage || '',
  imageUrl: product.coverImage || product.imageUrl || '',
  createdAt: product.createdAt || new Date().toISOString(),
});

const getProductsFromStore = async () => {
  if (mongoose.connection.readyState === 1) {
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    return products.map(normalizeProduct);
  }

  return [...inMemoryProducts].reverse().map(normalizeProduct);
};

const saveProductToStore = async (productData) => {
  const payload = {
    name: productData.name,
    description: productData.description,
    url: productData.url,
    documentationUrl: productData.documentationUrl || '',
    category: productData.category || 'General',
    tags: Array.isArray(productData.tags) ? productData.tags : [],
    coverImage: productData.coverImage || '',
  };

  if (mongoose.connection.readyState === 1) {
    const product = await Product.create(payload);
    return normalizeProduct(product.toObject());
  }

  const newProduct = {
    id: `product-${Date.now()}`,
    ...payload,
    createdAt: new Date().toISOString(),
  };

  inMemoryProducts.unshift(newProduct);
  return normalizeProduct(newProduct);
};

const updateProductInStore = async (productId, productData) => {
  const payload = {
    name: productData.name,
    description: productData.description,
    url: productData.url,
    documentationUrl: productData.documentationUrl || '',
    category: productData.category || 'General',
    tags: Array.isArray(productData.tags) ? productData.tags : [],
    coverImage: productData.coverImage || '',
  };

  if (mongoose.connection.readyState === 1) {
    if (!mongoose.isValidObjectId(productId)) {
      return null;
    }

    const product = await Product.findByIdAndUpdate(productId, payload, {
      new: true,
      runValidators: true,
    }).lean();

    return product ? normalizeProduct(product) : null;
  }

  const productIndex = inMemoryProducts.findIndex((product) => product.id === productId);

  if (productIndex === -1) {
    return null;
  }

  inMemoryProducts[productIndex] = {
    ...inMemoryProducts[productIndex],
    ...payload,
  };

  return normalizeProduct(inMemoryProducts[productIndex]);
};

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Devstore server is running',
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Devstore API',
  });
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await getProductsFromStore();
    res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required',
    });
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: 'Invalid admin credentials',
    });
  }

  const token = signToken({ username, role: 'admin' });

  return res.status(200).json({
    success: true,
    token,
    user: {
      username: ADMIN_USERNAME,
      role: 'admin',
    },
  });
});

app.post('/api/admin/products', async (req, res) => {
  const authHeader = req.headers.authorization;
  const decoded = verifyToken(authHeader);

  if (!decoded || decoded.role !== 'admin' || decoded.username !== ADMIN_USERNAME) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Please log in as admin.',
    });
  }

  const { name, description, url, documentationUrl, category, tags, coverImage, imageUrl } = req.body || {};

  if (!name || !description || !url) {
    return res.status(400).json({
      success: false,
      message: 'Name, description, and URL are required',
    });
  }

  try {
    const product = await saveProductToStore({
      name,
      description,
      url,
      documentationUrl,
      category,
      tags,
      coverImage: coverImage || imageUrl || '',
    });

    return res.status(201).json({
      success: true,
      product,
      message: 'Product uploaded successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.put('/api/admin/products/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  const decoded = verifyToken(authHeader);

  if (!decoded || decoded.role !== 'admin' || decoded.username !== ADMIN_USERNAME) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Please log in as admin.',
    });
  }

  const { name, description, url, documentationUrl, category, tags, coverImage, imageUrl } = req.body || {};

  if (!name || !description || !url) {
    return res.status(400).json({
      success: false,
      message: 'Name, description, and URL are required',
    });
  }

  try {
    const product = await updateProductInStore(req.params.id, {
      name,
      description,
      url,
      documentationUrl,
      category,
      tags,
      coverImage: coverImage || imageUrl || '',
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    return res.status(200).json({
      success: true,
      product,
      message: 'Product updated successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
  });
});

const startServer = async () => {
  try {
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('MongoDB connected successfully');
    } else {
      console.log('MONGO_URI not found. Starting without database connection.');
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    console.log('Server still booted for local testing.');
    app.listen(PORT, () => {
      console.log(`Fallback server running on http://localhost:${PORT}`);
    });
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;
