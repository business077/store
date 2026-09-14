import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const products = [
  { title: 'UI Kit', description: 'Modern design system for startups and SaaS products.', price: '$29' },
  { title: 'Dashboard Pack', description: 'High-converting analytics views for product teams.', price: '$49' },
  { title: 'Brand Assets', description: 'Ready-to-use templates and marketing graphics.', price: '$19' },
  { title: 'Launch Toolkit', description: 'Growth assets for product launches and marketing sprints.', price: '$39' },
];

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
        Discover premium digital products, creator tools, and downloadable assets built for modern teams.
      </p>
      <div className="status-box">{backendStatus}</div>
      <div className="cta-row">
        <Link to="/products" className="primary-btn">Browse products</Link>
        <Link to="/about" className="secondary-btn">About</Link>
      </div>
    </section>
  );
}

function Products() {
  return (
    <section className="grid">
      {products.map((product) => (
        <div className="card" key={product.title}>
          <span className="chip">Product</span>
          <h3>{product.title}</h3>
          <p>{product.description}</p>
          <strong>{product.price}</strong>
        </div>
      ))}
    </section>
  );
}

function About() {
  return (
    <section className="about-box">
      <h2>About DevStore</h2>
      <p>
        DevStore is a digital storefront designed for creators, developers, and product teams who want fast access to premium creative assets.
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
          <Link to="/about">About</Link>
        </nav>
      </header>

      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
