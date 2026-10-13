import assert from 'node:assert/strict';
import { test } from 'node:test';

const { createGa4RealtimeClient } = await import('../src/lib/ga4');

async function testPrivateKey(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
}

function jsonEscapedPem(pem: string): string {
  return pem.replace(/\r?\n/g, '\\n');
}

test('returns activeUsers from the GA4 realtime report', async () => {
  const calls: string[] = [];
  const client = createGa4RealtimeClient(async (input) => {
    calls.push(String(input));
    if (String(input).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
    }
    return new Response(JSON.stringify({ rows: [{ metricValues: [{ value: '189' }] }] }), { status: 200 });
  });
  const users = await client.getActiveUsers({
    propertyId: '123456789',
    clientEmail: 'reader@example.iam.gserviceaccount.com',
    privateKey: await testPrivateKey(),
  });
  assert.equal(users, 189);
  assert.equal(calls.length, 2);
});

test('accepts a JSON-escaped private key containing literal backslash-n sequences', async () => {
  const client = createGa4RealtimeClient(async (input) => {
    if (String(input).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
    }
    return new Response(JSON.stringify({ rows: [{ metricValues: [{ value: '7' }] }] }), { status: 200 });
  });
  const users = await client.getActiveUsers({
    propertyId: '123456789',
    clientEmail: 'reader@example.iam.gserviceaccount.com',
    privateKey: jsonEscapedPem(await testPrivateKey()),
  });
  assert.equal(users, 7);
});

test('accepts a copied JSON string value with surrounding quotes', async () => {
  const client = createGa4RealtimeClient(async (input) => {
    if (String(input).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
    }
    return new Response(JSON.stringify({ rows: [{ metricValues: [{ value: '3' }] }] }), { status: 200 });
  });
  const users = await client.getActiveUsers({
    propertyId: '123456789',
    clientEmail: 'reader@example.iam.gserviceaccount.com',
    privateKey: JSON.stringify(jsonEscapedPem(await testPrivateKey())),
  });
  assert.equal(users, 3);
});

test('treats a valid empty realtime report as zero active users', async () => {
  const client = createGa4RealtimeClient(async (input) => {
    if (String(input).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
  const users = await client.getActiveUsers({
    propertyId: '123456789',
    clientEmail: 'reader@example.iam.gserviceaccount.com',
    privateKey: await testPrivateKey(),
  });
  assert.equal(users, 0);
});

test('does not call Google when configuration is incomplete', async () => {
  let calls = 0;
  const client = createGa4RealtimeClient(async () => {
    calls += 1;
    return new Response('{}');
  });
  assert.equal(await client.getActiveUsers({ propertyId: '', clientEmail: '', privateKey: '' }), null);
  assert.equal(calls, 0);
});

test('returns null for failed Google responses', async () => {
  const client = createGa4RealtimeClient(async () => new Response('upstream failure', { status: 500 }));
  assert.equal(await client.getActiveUsers({
    propertyId: '123',
    clientEmail: 'reader@example.com',
    privateKey: await testPrivateKey(),
  }), null);
});
