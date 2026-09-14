import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1200&q=80';

function Home() {
  const [backendStatus, setBackendStatus] = useState('Checking backend...');

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Backend not reachable');
        const data = await res.json();
        setBackendStatus(data.message || 'Backend connected');
      })
      .catch(() => setBackendStatus('Backend offline or not running yet'));
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

function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/products`)
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
                  <a href={product.url} target="_blank" rel="noreferrer" className="primary-btn small-btn">Open app</a>
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

function AdminUpload() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState('');
  const [products, setProducts] = useState([]);
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
      const response = await fetch(`${API_URL}/api/products`);
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

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setStatus('');

    try {
      const response = await fetch(`${API_URL}/api/admin/login`, {
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
      const response = await fetch(`${API_URL}/api/admin/products`, {
        method: 'POST',
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

      setStatus('Product created successfully');
      setForm({
        name: '',
        description: '',
        url: '',
        documentationUrl: '',
        imageUrl: '',
        category: 'Productivity',
        tags: 'dashboard,webapp',
      });
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
              <h3>New product</h3>
            </div>
            <form onSubmit={handleSubmit} className="admin-form">
              <input name="name" value={form.name} onChange={handleChange} placeholder="Product name" required />
              <textarea name="description" value={form.description} onChange={handleChange} placeholder="Short description" rows="4" required />
              <input name="url" value={form.url} onChange={handleChange} placeholder="Live app URL" required />
              <input name="documentationUrl" value={form.documentationUrl} onChange={handleChange} placeholder="Documentation URL" />
              <input name="imageUrl" value={form.imageUrl} onChange={handleChange} placeholder="Image URL" />
              <input name="category" value={form.category} onChange={handleChange} placeholder="Category" />
              <input name="tags" value={form.tags} onChange={handleChange} placeholder="Tags comma separated" />
              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Uploading...' : 'Publish product'}
              </button>
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
              {products.slice(0, 4).map((product) => (
                <div key={product.id || product.name} className="mini-item">
                  <img src={product.imageUrl || product.coverImage || FALLBACK_IMAGE} alt={product.name} />
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.category || 'General'}</span>
                  </div>
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
  return (
    <BrowserRouter>
      <header className="topbar">
        <div className="brand">DevStore</div>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/products">Products</Link>
          <Link to="/admin">Admin</Link>
          <Link to="/about">About</Link>
        </nav>
      </header>

      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/admin" element={<AdminUpload />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
