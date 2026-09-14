const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

async function withServer(handler) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address();

  try {
    await handler(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('GET /api/products returns a product list', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://localhost:${port}/api/products`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(body.products));
  });
});

test('POST /api/admin/login returns a token for valid credentials', async () => {
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'securepass';

  await withServer(async (port) => {
    const res = await fetch(`http://localhost:${port}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'securepass',
      }),
    });

    const body = await res.json();

    assert.equal(res.status, 200);
    assert.ok(body.token);
    assert.equal(body.user.username, 'admin');
  });
});

test('POST /api/admin/products creates a product with a valid admin token', async () => {
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'securepass';

  await withServer(async (port) => {
    const loginRes = await fetch(`http://localhost:${port}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'securepass',
      }),
    });

    const loginBody = await loginRes.json();

    const res = await fetch(`http://localhost:${port}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginBody.token}`,
      },
      body: JSON.stringify({
        name: 'Project Manager Pro',
        description: 'Team workflow dashboard for product teams.',
        url: 'https://example.com/project-manager',
        documentationUrl: 'https://example.com/docs/project-manager',
        imageUrl: 'https://example.com/images/project-manager.jpg',
        category: 'Productivity',
        tags: ['dashboard', 'team'],
      }),
    });

    const body = await res.json();

    assert.equal(res.status, 201);
    assert.equal(body.product.name, 'Project Manager Pro');
    assert.ok(body.product.url.includes('example.com'));
  });
});

test('PUT /api/admin/products/:id updates a product with a valid admin token', async () => {
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'securepass';

  await withServer(async (port) => {
    const loginRes = await fetch(`http://localhost:${port}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'securepass',
      }),
    });

    const loginBody = await loginRes.json();
    const createRes = await fetch(`http://localhost:${port}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginBody.token}`,
      },
      body: JSON.stringify({
        name: 'Editable Product',
        description: 'Original description.',
        url: 'https://example.com/original',
      }),
    });

    const createdBody = await createRes.json();
    const updateRes = await fetch(`http://localhost:${port}/api/admin/products/${createdBody.product.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginBody.token}`,
      },
      body: JSON.stringify({
        name: 'Updated Product',
        description: 'Updated description.',
        url: 'https://example.com/updated',
        category: 'Developer Tools',
        tags: ['updated'],
      }),
    });

    const body = await updateRes.json();

    assert.equal(updateRes.status, 200);
    assert.equal(body.product.name, 'Updated Product');
    assert.equal(body.product.category, 'Developer Tools');
    assert.deepEqual(body.product.tags, ['updated']);
  });
});
