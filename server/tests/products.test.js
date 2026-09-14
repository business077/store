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
