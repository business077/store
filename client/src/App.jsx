import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

function Home() {
  return (
    <section className="hero">
      <div className="badge">Active marketplace</div>
      <h1>DevStore</h1>
      <p>
        Discover premium digital products, creator tools, and downloadable assets built for modern teams.
      </p>
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
      <div className="card">
        <span className="chip">Product</span>
        <h3>UI Kit</h3>
        <p>Modern design system for startups and SaaS products.</p>
        <strong>$29</strong>
      </div>
      <div className="card">
        <span className="chip">Product</span>
        <h3>Dashboard Pack</h3>
        <p>High-converting analytics views for product teams.</p>
        <strong>$49</strong>
      </div>
      <div className="card">
        <span className="chip">Product</span>
        <h3>Brand Assets</h3>
        <p>Ready-to-use brand templates and marketing graphics.</p>
        <strong>$19</strong>
      </div>
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
