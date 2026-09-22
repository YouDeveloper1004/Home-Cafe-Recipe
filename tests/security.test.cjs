const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('production build disables test-only and unverified upload features', () => {
  const eas = JSON.parse(read('eas.json'));
  const env = eas.build.production.env;
  assert.equal(env.EXPO_PUBLIC_SEED_CONTENT_ENABLED, 'false');
  assert.equal(env.EXPO_PUBLIC_LOCAL_PROFILE_ENABLED, 'false');
  assert.equal(env.EXPO_PUBLIC_VIDEO_UPLOAD_ENABLED, 'false');
  assert.match(read('CafeApp.tsx'), /EXPO_PUBLIC_LOCAL_PROFILE_ENABLED==='true'/);
});

test('Android backup and unnecessary high-risk permissions are blocked', () => {
  const app = JSON.parse(read('app.json')).expo;
  assert.equal(app.android.allowBackup, false);
  assert.ok(app.android.blockedPermissions.includes('android.permission.SYSTEM_ALERT_WINDOW'));
  assert.ok(app.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
});

test('new recipe media uses private storage and signed URLs', () => {
  const cloud = read('cloud.ts');
  assert.match(cloud, /PRIVATE_MEDIA_BUCKET='recipe-media-private'/);
  assert.match(cloud, /createSignedUrl\(location\.path,SIGNED_MEDIA_TTL_SECONDS\)/);
  assert.doesNotMatch(cloud, /from\('recipe-media-private'\)\.getPublicUrl/);
  const sql = read('supabase/migrations/20260921_private_media_hardening.sql');
  assert.match(sql, /'recipe-media-private'[\s\S]*false/);
  assert.match(sql, /is_approved_recipe_media/);
  assert.match(sql, /update storage\.buckets set public=false where id='recipe-images'/);
  assert.match(sql, /drop policy if exists "own image upload"/);
  assert.match(sql, /jsonb_array_length\(next_state->'recipes'\)>100/);
});

test('account deletion covers legacy and private media buckets', () => {
  for (const file of ['cloud.ts', 'supabase/functions/delete-account/index.ts', 'supabase/migrations/20260921_private_media_hardening.sql']) {
    const source = read(file);
    assert.match(source, /recipe-images/);
    assert.match(source, /recipe-media-private/);
  }
});

test('legal and provenance records ship with a support contact', () => {
  assert.match(read('legal/privacy-policy.md'), /seungmuny1004@gmail\.com/);
  assert.match(read('legal/terms-of-service.md'), /신고/);
  assert.match(read('THIRD_PARTY_NOTICES.md'), /Supabase JavaScript/);
  assert.match(read('docs/asset-provenance.md'), /출처/);
  assert.match(read('docs/development-provenance.md'), /인간/);
});
