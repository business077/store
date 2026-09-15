import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

const CONFIGURED_API_URL = (import.meta.env.VITE_API_URL || '').trim();
const API_URL = (import.meta.env.PROD && (!CONFIGURED_API_URL || /localhost|127\.0\.0\.1/.test(CONFIGURED_API_URL)
  ? ''
  : CONFIGURED_API_URL))
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1200&q=80';
const HEALTH_RETRY_LIMIT = 12;
const HEALTH_RETRY_DELAY_MS = 2500;
const REQUEST_TIMEOUT_MS = 15000;

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const checkBackend = async () => {
  const response = await fetchWithTimeout(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }
  return response.json();
};

async function waitForBackend(onAttempt) {
  for (let attempt = 1; attempt <= HEALTH_RETRY_LIMIT; attempt += 1) {
    onAttempt(attempt);
    try {
      await checkBackend();
      return true;
    } catch {
      if (attempt < HEALTH_RETRY_LIMIT) {
        await wait(HEALTH_RETRY_DELAY_MS);
      }
    }
  }
  return false;
}

function BackendGate({ children }) {
  const [state, setState] = useState({ status: 'checking', attempt: 0 });

  const connect = async () => {
    setState({ status: 'checking', attempt: 0 });
    const connected = await waitForBackend((attempt) => {
      setState({ status: 'checking', attempt });
    });
    setState({ status: connected ? 'connected' : 'offline', attempt: connected ? 0 : HEALTH_RETRY_LIMIT });
  };

  useEffect(() => {
    connect();
  }, []);

  if (state.status === 'checking') {
    return (
      <main className="connection-screen">
        <div className="connection-card">
          <div className="connection-spinner" aria-hidden="true" />
          <span className="badge">Connecting to DevStore</span>
          <h1>Starting the marketplace</h1>
          <p>The server may be waking up. We will keep trying before loading the app.</p>
          <div className="status-box">Connection attempt {state.attempt} of {HEALTH_RETRY_LIMIT}</div>
        </div>
      </main>
    );
  }

  if (state.status === 'offline') {
    return (
      <main className="connection-screen">
        <div className="connection-card">
          <span className="badge">Server unavailable</span>
          <h1>Still waiting for the backend</h1>
          <p>DevStore could not connect after several attempts. Try again when the server has finished deploying or waking up.</p>
          <button type="button" className="primary-btn" onClick={connect}>Try again</button>
        </div>
      </main>
    );
  }

  return children;
}

function Home() {
  const [backendStatus, setBackendStatus] = useState('Checking backend...');

  useEffect(() => {
    fetchWithTimeout(`${API_URL}/health`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Backend not reachable');
        const data = await res.json();
        setBackendStatus(data.message || 'Backend connected');
      })
      .catch(() => setBackendStatus('Backend connection lost'));
  }, []);

  return (
    <section className="hero">
      <div className="badge">Active marketplace</div>
      <h1>DevStore</h1>
      <p>
        Discover premium web apps, developer tools, and digital products built for modern teams.
      </p>
      <div className="status-box">{backendStatus}</div>
      <div className="cta-row">
        <Link to="/products" className="primary-btn">Browse products</Link>
        <Link to="/admin" className="secondary-btn">Admin upload</Link>
      </div>
    </section>
  );
}

function Products({ currentUser }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchWithTimeout(`${API_URL}/api/products`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to fetch products');
        setProducts(data.products || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section>
      <div className="section-header">
        <h2>Featured web apps</h2>
      </div>

      {loading && <div className="status-box">Loading products...</div>}
      {error && <div className="error-box">{error}</div>}

      {!loading && !error && (
        <div className="grid">
          {products.map((product) => (
            <article className="product-card" key={product.id || product.name}>
              <div className="product-image-wrap">
                <img src={product.imageUrl || product.coverImage || FALLBACK_IMAGE} alt={product.name} className="product-image" />
              </div>
              <div className="product-body">
                <span className="chip">{product.category || 'Product'}</span>
                <h3>{product.name}</h3>
                <p>{product.description}</p>
                <div className="meta-row">
                  {product.tags?.slice(0, 3).map((tag) => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
                <div className="action-row">
                  {currentUser ? (
                    <a href={product.url} target="_blank" rel="noreferrer" className="primary-btn small-btn">Open app</a>
                  ) : (
                    <Link to="/auth" className="primary-btn small-btn">Login to use</Link>
                  )}
                  {product.documentationUrl && (
                    <a href={product.documentationUrl} target="_blank" rel="noreferrer" className="secondary-btn small-btn">Docs</a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function UserAuth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [recoveryAction, setRecoveryAction] = useState('password');
  const [form, setForm] = useState({ email: '', username: '', password: '', otp: '', newValue: '' });
  const [otpRequested, setOtpRequested] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const submitCredentials = async (event) => {
    event.preventDefault();
    setLoading(true);
    setStatus('');

    try {
      const response = await fetchWithTimeout(`${API_URL}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, username: form.username, password: form.password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Authentication failed');

      localStorage.setItem('devstore_session', JSON.stringify({ token: data.token, user: data.user }));
      onAuth(data.user);
      setStatus(mode === 'login' ? 'Welcome back' : 'Account created successfully');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async () => {
    setLoading(true);
    setStatus('');

    try {
      const response = await fetchWithTimeout(`${API_URL}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, action: recoveryAction }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not send verification code');
      setOtpRequested(true);
      setStatus(data.devOtp ? `Development OTP: ${data.devOtp}` : data.message);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  const changeCredential = async (event) => {
    event.preventDefault();
    setLoading(true);
    setStatus('');

    try {
      const endpoint = recoveryAction === 'username' ? 'change-username' : 'change-password';
      const body = recoveryAction === 'username'
        ? { email: form.email, otp: form.otp, newUsername: form.newValue }
        : { email: form.email, otp: form.otp, newPassword: form.newValue };
      const response = await fetchWithTimeout(`${API_URL}/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not update account');
      setStatus(data.message);
      setOtpRequested(false);
      setForm((previous) => ({ ...previous, otp: '', newValue: '' }));
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
          <button type="button" className={mode === 'recover' ? 'active' : ''} onClick={() => setMode('recover')}>Recover</button>
        </div>

        {mode !== 'recover' ? (
          <form onSubmit={submitCredentials} className="admin-form">
            <h2>{mode === 'login' ? 'Welcome back' : 'Join DevStore'}</h2>
            {mode === 'register' && <input name="username" value={form.username} onChange={handleChange} placeholder="Username" required />}
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="Email address" required />
            <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Password (8+ characters)" required />
            <button type="submit" className="primary-btn" disabled={loading}>{loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}</button>
          </form>
        ) : (
          <div className="admin-form">
            <h2>Recover your account</h2>
            <div className="auth-tabs recovery-tabs">
              <button type="button" className={recoveryAction === 'password' ? 'active' : ''} onClick={() => { setRecoveryAction('password'); setOtpRequested(false); }}>Password</button>
              <button type="button" className={recoveryAction === 'username' ? 'active' : ''} onClick={() => { setRecoveryAction('username'); setOtpRequested(false); }}>Username</button>
            </div>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="Account email" required />
            {!otpRequested ? (
              <button type="button" className="primary-btn" onClick={requestOtp} disabled={loading}>{loading ? 'Sending...' : 'Send email OTP'}</button>
            ) : (
              <form onSubmit={changeCredential} className="admin-form">
                <input name="otp" value={form.otp} onChange={handleChange} placeholder="6-digit email OTP" inputMode="numeric" required />
                <input type={recoveryAction === 'password' ? 'password' : 'text'} name="newValue" value={form.newValue} onChange={handleChange} placeholder={recoveryAction === 'password' ? 'New password (8+ characters)' : 'New username'} required />
                <button type="submit" className="primary-btn" disabled={loading}>{loading ? 'Updating...' : `Update ${recoveryAction}`}</button>
              </form>
            )}
          </div>
        )}
        {status && <div className="status-box">{status}</div>}
      </div>
    </section>
  );
}

function AdminUpload() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState('');
  const [products, setProducts] = useState([]);
  const [editingProductId, setEditingProductId] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [form, setForm] = useState({
    name: '',
    description: '',
    url: '',
    documentationUrl: '',
    imageUrl: '',
    category: 'Productivity',
    tags: 'dashboard,webapp',
  });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchProducts = async () => {
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/products`);
      const data = await response.json();
      if (response.ok) {
        setProducts(data.products || []);
      }
    } catch {
      // no-op for dashboard summary
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchProducts();
    }
  }, [isLoggedIn]);

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setEditingProductId('');
    setForm({
      name: '',
      description: '',
      url: '',
      documentationUrl: '',
      imageUrl: '',
      category: 'Productivity',
      tags: 'dashboard,webapp',
    });
  };

  const handleEdit = (product) => {
    setEditingProductId(product.id);
    setForm({
      name: product.name || '',
      description: product.description || '',
      url: product.url || '',
      documentationUrl: product.documentationUrl || '',
      imageUrl: product.imageUrl || product.coverImage || '',
      category: product.category || 'General',
      tags: Array.isArray(product.tags) ? product.tags.join(',') : '',
    });
    setStatus(`Editing ${product.name}`);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setStatus('');

    try {
      const response = await fetchWithTimeout(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginForm),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      setToken(data.token);
      setIsLoggedIn(true);
      setStatus('Admin login successful');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isLoggedIn || !token) {
      setStatus('Please log in first');
      return;
    }

    setLoading(true);
    setStatus('');

    try {
      const endpoint = editingProductId
        ? `${API_URL}/api/admin/products/${editingProductId}`
        : `${API_URL}/api/admin/products`;
      const response = await fetchWithTimeout(endpoint, {
        method: editingProductId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          imageUrl: form.imageUrl || FALLBACK_IMAGE,
          tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      setStatus(editingProductId ? 'Product updated successfully' : 'Product created successfully');
      resetForm();
      await fetchProducts();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="admin-shell">
      {!isLoggedIn ? (
        <div className="login-card">
          <h2>Admin login</h2>
          <form onSubmit={handleLogin} className="admin-form">
            <input name="username" value={loginForm.username} onChange={handleLoginChange} placeholder="Username" required />
            <input type="password" name="password" value={loginForm.password} onChange={handleLoginChange} placeholder="Password" required />
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      ) : (
        <div className="dashboard-grid">
          <div className="dashboard-panel form-panel">
            <div className="panel-header">
              <h3>{editingProductId ? 'Edit product' : 'New product'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="admin-form">
              <input name="name" value={form.name} onChange={handleChange} placeholder="Product name" required />
              <textarea name="description" value={form.description} onChange={handleChange} placeholder="Short description" rows="4" required />
              <input name="url" value={form.url} onChange={handleChange} placeholder="Live app URL" required />
              <input name="documentationUrl" value={form.documentationUrl} onChange={handleChange} placeholder="Documentation URL" />
              <input name="imageUrl" value={form.imageUrl} onChange={handleChange} placeholder="Image URL" />
              <input name="category" value={form.category} onChange={handleChange} placeholder="Category" />
              <input name="tags" value={form.tags} onChange={handleChange} placeholder="Tags comma separated" />
              <div className="form-actions">
                <button type="submit" className="primary-btn" disabled={loading}>
                  {loading ? 'Saving...' : editingProductId ? 'Save changes' : 'Publish product'}
                </button>
                {editingProductId && (
                  <button type="button" className="secondary-btn" onClick={resetForm} disabled={loading}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="dashboard-panel summary-panel">
            <div className="panel-header">
              <h3>Dashboard</h3>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <span>Total</span>
                <strong>{products.length}</strong>
              </div>
              <div className="stat-card">
                <span>Categories</span>
                <strong>{new Set(products.map((item) => item.category || 'General')).size}</strong>
              </div>
              <div className="stat-card">
                <span>Status</span>
                <strong>Live</strong>
              </div>
            </div>

            <div className="mini-list">
              {products.map((product) => (
                <div key={product.id || product.name} className="mini-item">
                  <img src={product.imageUrl || product.coverImage || FALLBACK_IMAGE} alt={product.name} />
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.category || 'General'}</span>
                  </div>
                  <button type="button" className="secondary-btn small-btn" onClick={() => handleEdit(product)}>
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {status && <div className="status-box">{status}</div>}
    </section>
  );
}

function About() {
  return (
    <section className="about-box">
      <h2>About DevStore</h2>
      <p>
        DevStore is a digital marketplace for web apps, creator tools, and premium digital products that teams can browse and launch directly from the browser.
      </p>
    </section>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('devstore_session'))?.user || null;
    } catch {
      return null;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('devstore_session');
    setCurrentUser(null);
  };

  return (
    <BrowserRouter>
      <header className="topbar">
        <div className="brand">DevStore</div>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/products">Products</Link>
          {currentUser ? (
            <>
              <Link to="/account">{currentUser.username}</Link>
              <button type="button" className="nav-button" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <Link to="/auth">User login</Link>
          )}
          <Link to="/admin">Admin</Link>
          <Link to="/about">About</Link>
        </nav>
      </header>

      <BackendGate>
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products currentUser={currentUser} />} />
            <Route path="/auth" element={<UserAuth onAuth={setCurrentUser} />} />
            <Route path="/account" element={<UserAuth onAuth={setCurrentUser} />} />
            <Route path="/admin" element={<AdminUpload />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
      </BackendGate>
    </BrowserRouter>
  );
}
