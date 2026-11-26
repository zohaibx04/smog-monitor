/**
 * Seeds all 195 UN sovereign world capitals (plus Pakistan starter cities)
 * directly into Firestore `globalCities`.
 *
 * Usage:
 *   node scripts/seed-firestore-capitals.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DASHBOARD_DIR = path.join(ROOT_DIR, 'Air Quality Monitoring Dashboard');

const require = createRequire(path.join(DASHBOARD_DIR, 'package.json'));
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const STARTER_CITIES = [
  { name: 'Islamabad, Pakistan', latitude: 33.72148, longitude: 73.04329 },
  { name: 'Karachi, Pakistan', latitude: 24.8607, longitude: 67.0011 },
  { name: 'Lahore, Pakistan', latitude: 31.5204, longitude: 74.3587 },
  { name: 'Peshawar, Pakistan', latitude: 34.0151, longitude: 71.5249 },
  { name: 'Quetta, Pakistan', latitude: 30.1798, longitude: 66.975 },
];

const STARTER_NAMES = new Set(STARTER_CITIES.map((c) => c.name.toLowerCase()));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadCapitalsDataset() {
  const sourcePath = path.join(__dirname, 'seed-world-capitals.mjs');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const match = source.match(/export const WORLD_CAPITALS\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!match) {
    throw new Error(`Could not parse WORLD_CAPITALS from ${sourcePath}`);
  }
  // Evaluate the static array literal safely without executing seed-world-capitals.mjs main()
  const parsed = new Function(`"use strict"; return (${match[1]});`)();
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Parsed WORLD_CAPITALS dataset is empty.');
  }

  const byNormalized = new Map();
  for (const entry of [...STARTER_CITIES, ...parsed]) {
    const name = String(entry.name).trim();
    const key = name.toLowerCase();
    if (!byNormalized.has(key)) {
      byNormalized.set(key, {
        name,
        latitude: Number(entry.latitude),
        longitude: Number(entry.longitude),
        isStarter: STARTER_NAMES.has(key),
      });
    } else if (STARTER_NAMES.has(key)) {
      byNormalized.get(key).isStarter = true;
    }
  }
  return Array.from(byNormalized.values());
}

function getServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    const jsonText = rawJson.startsWith('{')
      ? rawJson
      : Buffer.from(rawJson, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonText);
    return {
      projectId: parsed.project_id || parsed.projectId,
      clientEmail: parsed.client_email || parsed.clientEmail,
      privateKey: String(parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n'),
    };
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
    );
  }
  return { projectId, clientEmail, privateKey };
}

function slugifyCityId(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  loadEnvFile(path.join(ROOT_DIR, '.env'));
  loadEnvFile(path.join(DASHBOARD_DIR, '.env'));
  loadEnvFile(path.join(DASHBOARD_DIR, '.env.local'));

  const capitals = loadCapitalsDataset();
  console.log(`Loaded ${capitals.length} cities (including 5 Pakistan starters).`);

  if (getApps().length === 0) {
    initializeApp({ credential: cert(getServiceAccount()) });
  }
  const db = getFirestore();
  const citiesCol = db.collection('globalCities');

  const existingSnap = await citiesCol.get();
  const existingByName = new Map();
  for (const doc of existingSnap.docs) {
    const data = doc.data();
    const norm = String(data.normalizedName ?? data.name ?? '').trim().toLowerCase();
    if (norm) existingByName.set(norm, doc);
  }

  const nowIso = new Date().toISOString();
  let created = 0;
  let updated = 0;

  const chunkSize = 400;
  for (let i = 0; i < capitals.length; i += chunkSize) {
    const chunk = capitals.slice(i, i + chunkSize);
    const batch = db.batch();

    for (const city of chunk) {
      const normalizedName = city.name.toLowerCase();
      const existingDoc = existingByName.get(normalizedName);

      if (existingDoc) {
        batch.set(
          existingDoc.ref,
          {
            name: city.name,
            normalizedName,
            latitude: city.latitude,
            longitude: city.longitude,
            active: true,
            isStarter: city.isStarter,
            updatedAt: nowIso,
          },
          { merge: true },
        );
        updated += 1;
      } else {
        const docId = slugifyCityId(city.name);
        batch.set(
          citiesCol.doc(docId),
          {
            name: city.name,
            normalizedName,
            latitude: city.latitude,
            longitude: city.longitude,
            active: true,
            isStarter: city.isStarter,
            customLocation: false,
            watchlistCount: 0,
            latestReading: null,
            stale: true,
            lastError: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          { merge: true },
        );
        created += 1;
      }
    }

    await batch.commit();
  }

  console.log(`Firestore globalCities seed complete: created=${created}, updated=${updated}, total=${capitals.length}.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
