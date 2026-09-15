const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const morgan = require('morgan');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const OTP_TTL_MS = 10 * 60 * 1000;
const DATABASE_RETRY_LIMIT = 5;
const DATABASE_RETRY_DELAY_MS = 5000;
let databaseStatus = process.env.MONGO_URI ? 'connecting' : 'fallback';

const inMemoryUsers = [];
const pendingOtps = new Map();

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

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeUsername = (username) => String(username || '').trim();

const normalizeUser = (user) => ({
  id: user._id ? String(user._id) : user.id,
  email: user.email,
  username: user.username,
  role: 'user',
});

const findUserByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (mongoose.connection.readyState === 1) {
    return User.findOne({ email: normalizedEmail });
  }

  return inMemoryUsers.find((user) => user.email === normalizedEmail) || null;
};

const findUserByUsername = async (username) => {
  const normalizedUsername = normalizeUsername(username).toLowerCase();

  if (mongoose.connection.readyState === 1) {
    return User.findOne({ username: new RegExp(`^${normalizedUsername}$`, 'i') });
  }

  return inMemoryUsers.find((user) => user.username.toLowerCase() === normalizedUsername) || null;
};

const createUser = async ({ email, username, passwordHash }) => {
  const payload = { email: normalizeEmail(email), username: normalizeUsername(username), passwordHash };

  if (mongoose.connection.readyState === 1) {
    return User.create(payload);
  }

  const user = { id: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, ...payload };
  inMemoryUsers.push(user);
  return user;
};

const updateUser = async (user, updates) => {
  if (mongoose.connection.readyState === 1) {
    const updated = await User.findByIdAndUpdate(user._id, updates, { new: true, runValidators: true }).lean();
    return updated;
  }

  Object.assign(user, updates);
  return user;
};

const createMailTransport = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

const sendOtpEmail = async (email, otp, action) => {
  const transport = createMailTransport();

  if (!transport) {
    return false;
  }

  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Your DevStore verification code',
    text: `Use ${otp} to ${action === 'username' ? 'change your username' : 'change your password'} on DevStore. This code expires in 10 minutes.`,
  });

  return true;
};

const issueOtp = async (email, action) => {
  const otp = String(crypto.randomInt(100000, 1000000));
  const key = `${normalizeEmail(email)}:${action}`;
  pendingOtps.set(key, {
    codeHash: crypto.createHash('sha256').update(otp).digest('hex'),
    expiresAt: Date.now() + OTP_TTL_MS,
  });
  const delivered = await sendOtpEmail(normalizeEmail(email), otp, action);
  return { delivered, otp };
};

const consumeOtp = (email, action, otp) => {
  const key = `${normalizeEmail(email)}:${action}`;
  const record = pendingOtps.get(key);

  if (!record || record.expiresAt < Date.now()) {
    pendingOtps.delete(key);
    return false;
  }

  const valid = record.codeHash === crypto.createHash('sha256').update(String(otp || '')).digest('hex');
  if (valid) {
    pendingOtps.delete(key);
  }
  return valid;
};

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
  // Authentication uses bearer tokens, so each device can log in independently.
  // No cookies are used, which makes an open API origin safe for this client.
  origin: true,
  credentials: false,
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
    database: databaseStatus,
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

app.post('/api/auth/register', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');

  if (!email || !username || !password) {
    return res.status(400).json({ success: false, message: 'Email, username, and password are required' });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address' });
  }

  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ success: false, message: 'Username must be 3 to 32 characters' });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }

  if (await findUserByEmail(email)) {
    return res.status(409).json({ success: false, message: 'Email is already registered' });
  }

  if (await findUserByUsername(username)) {
    return res.status(409).json({ success: false, message: 'Username is already taken' });
  }

  try {
    const user = await createUser({
      email,
      username,
      passwordHash: await bcrypt.hash(password, 12),
    });
    const token = signToken({ userId: String(user._id || user.id), email, username, role: 'user' });

    return res.status(201).json({ success: true, token, user: normalizeUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email or username is already registered' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const user = await findUserByEmail(email);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const token = signToken({
    userId: String(user._id || user.id),
    email: user.email,
    username: user.username,
    role: 'user',
  });

  return res.status(200).json({ success: true, token, user: normalizeUser(user) });
});

app.post('/api/auth/request-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const action = req.body?.action;

  if (!email || !['username', 'password'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Email and a valid recovery action are required' });
  }

  if (!(await findUserByEmail(email))) {
    return res.status(404).json({ success: false, message: 'No account found for this email' });
  }

  try {
    const { delivered, otp } = await issueOtp(email, action);

    if (!delivered && process.env.NODE_ENV === 'production') {
      return res.status(503).json({ success: false, message: 'Email delivery is not configured. Add SMTP settings on the server.' });
    }

    const response = {
      success: true,
      message: delivered ? 'Verification code sent to your email' : 'Verification code generated for local development',
    };

    if (!delivered) {
      response.devOtp = otp;
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(502).json({ success: false, message: 'Could not send verification email' });
  }
});

app.post('/api/auth/change-username', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const username = normalizeUsername(req.body?.newUsername);

  if (!email || !req.body?.otp || username.length < 3 || username.length > 32) {
    return res.status(400).json({ success: false, message: 'Email, OTP, and a valid new username are required' });
  }

  if (!consumeOtp(email, 'username', req.body.otp)) {
    return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ success: false, message: 'No account found for this email' });
  }

  const existingUser = await findUserByUsername(username);
  if (existingUser && String(existingUser._id || existingUser.id) !== String(user._id || user.id)) {
    return res.status(409).json({ success: false, message: 'Username is already taken' });
  }

  try {
    const updatedUser = await updateUser(user, { username });
    return res.status(200).json({ success: true, user: normalizeUser(updatedUser), message: 'Username updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.newPassword || '');

  if (!email || !req.body?.otp || password.length < 8) {
    return res.status(400).json({ success: false, message: 'Email, OTP, and a password of at least 8 characters are required' });
  }

  if (!consumeOtp(email, 'password', req.body.otp)) {
    return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ success: false, message: 'No account found for this email' });
  }

  try {
    await updateUser(user, { passwordHash: await bcrypt.hash(password, 12) });
    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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

const connectDatabaseWithRetry = async () => {
  if (!process.env.MONGO_URI) {
    console.log('MONGO_URI not found. Running with in-memory fallback storage.');
    return;
  }

  for (let attempt = 1; attempt <= DATABASE_RETRY_LIMIT; attempt += 1) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      databaseStatus = 'connected';
      console.log(`MongoDB connected successfully on attempt ${attempt}`);
      return;
    } catch (error) {
      databaseStatus = attempt === DATABASE_RETRY_LIMIT ? 'fallback' : 'connecting';
      console.error(`MongoDB connection attempt ${attempt} failed: ${error.message}`);

      if (attempt < DATABASE_RETRY_LIMIT) {
        await new Promise((resolve) => setTimeout(resolve, DATABASE_RETRY_DELAY_MS));
      }
    }
  }

  console.log('MongoDB unavailable. Continuing with in-memory fallback storage.');
};

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    connectDatabaseWithRetry();
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
