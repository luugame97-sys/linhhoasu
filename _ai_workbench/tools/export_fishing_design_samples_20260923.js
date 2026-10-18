'use strict';

/* Export read-only fishing design references; never modifies runtime assets. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const ROOT = path.resolve(__dirname, '../..');
const ASSET_ROOT = path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets');
const CONFIG = path.join(ASSET_ROOT, 'excel/config_fashion_20260909.bin');
const OUT = path.join(ROOT, '_ai_workbench/temp/fishing_design_samples_20260923');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const tables = {};
const configBytes = fs.readFileSync(CONFIG), reader = new ByteArray(configBytes);
while (reader.position < reader.length) {
  const name = reader.readUTFBytes(reader.readUnsignedByte()), size = reader.readUnsignedInt();
  const bytes = configBytes.subarray(reader.position, reader.position + size);
  reader.position += size;
  if (['FishSceneConfig', 'FishConfig', 'AssetsConfig'].includes(name)) {
    tables[name] = BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(bytes)));
  }
}

function cleanDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function walk(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, result);
    else if (/\.(png|jpg|jpeg)$/i.test(entry.name)) result.push(full);
  }
  return result;
}

function findAsset(files, stem, ext = null) {
  const candidates = files.filter((file) => {
    const name = path.basename(file).toLowerCase();
    const wanted = String(stem).toLowerCase();
    const bare = path.basename(name, path.extname(name));
    return (bare === wanted || (bare.startsWith(wanted + '_') && /^[0-9a-f]+$/.test(bare.slice(wanted.length + 1))))
      && (!ext || path.extname(name) === ext);
  });
  if (candidates.length > 1) throw Error('AMBIGUOUS_RESOURCE:' + stem);
  return candidates[0] || null;
}

function dimensions(file) {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png' && buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) { offset += 1; continue; }
      const marker = buf[offset + 1];
      const len = buf.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
      }
      if (!len) break;
      offset += 2 + len;
    }
  }
  return null;
}

function addFile(source, relative, manifest, category) {
  if (!source) {
    manifest.missing.push({ category, relative });
    return null;
  }
  const destination = path.join(OUT, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const original = fs.readFileSync(source);
  if (fs.existsSync(destination)) {
    if (!fs.readFileSync(destination).equals(original)) throw Error('PRESERVE_DESIGN_FILE:' + relative);
  } else fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  const bytes = fs.readFileSync(destination);
  if (!bytes.equals(original)) throw Error('COPY_MISMATCH:' + relative);
  const row = {
    category,
    file: relative.replace(/\\/g, '/'),
    source: path.relative(ROOT, source).replace(/\\/g, '/'),
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    dimensions: dimensions(destination),
  };
  manifest.files.push(row);
  return row;
}

function readTable(name) {
  if (!tables[name]) throw Error('MISSING_CONFIG:' + name);
  return tables[name];
}

function main() {
  cleanDir(OUT);
  const files = walk(path.join(ASSET_ROOT, 'atlas_ui/6_dongfu/diaoyu'));
  walk(path.join(ASSET_ROOT, 'atlas_ui/0_common/icon'), files);
  const scenes = readTable('FishSceneConfig');
  const fish = readTable('FishConfig');
  const assets = readTable('AssetsConfig');
  const manifest = {
    result: 'PASS',
    readOnly: true,
    productionWrites: 0,
    configSource: path.relative(ROOT, CONFIG).replace(/\\/g, '/'),
    configSha256: sha(configBytes),
    purpose: 'Mẫu asset tham chiếu để thiết kế ngư trường mới; không phải gói deploy.',
    referenceScenes: {},
    files: [],
    missing: [],
    fishMapping: [],
    relicMapping: [],
    designChecklist: [
      'Nền map: fishing_scene_N, JPG/PNG 960x1680, kín toàn khung.',
      'Mỗi map: banner ui_dydj_bm_bannerN và thumbnail dy_bm_handbook_N.',
      'Mỗi cá cần icon item icon_ID; cá phẩm chất 9 còn cần illustration dy_icon_ID cho màn câu/kết quả.',
      'Relic 5802/5803 dùng lại icon trang bị; relic 5320–5323 có icon câu cá riêng.',
      'frontBg/backBg map thường hiện đang rỗng; không cần vẽ nếu giữ layout hiện tại.',
      'Cá mới nên dùng type 1..10; type 105 là nhánh Fish King có Spine/contract riêng.',
      'PNG/JPG là nguồn thiết kế; KTX/ASTC là texture runtime rebuild sau, không tự đặt hash suffix.',
    ],
  };

  const referenceIds = [6, 7];
  for (const sceneId of referenceIds) {
    const scene = scenes[String(sceneId)] || scenes[sceneId];
    if (!scene) continue;
    manifest.referenceScenes[String(sceneId)] = {
      id: scene.id,
      requiredLevel: scene.cond,
      nameLanguageId: scene.name,
      picture: scene.picture,
      banner: scene.banner,
      miniBanner: scene.miniBanner,
      fishIds: scene.fishes,
      relicIds: scene.relics,
    };
    addFile(findAsset(files, scene.picture), `scenes/scene_${sceneId}/${scene.picture}.jpg`, manifest, 'scene-background');
    addFile(findAsset(files, scene.banner), `scenes/scene_${sceneId}/${scene.banner}.png`, manifest, 'scene-banner');
    addFile(findAsset(files, scene.miniBanner), `scenes/scene_${sceneId}/${scene.miniBanner}.png`, manifest, 'scene-thumbnail');
  }

  const scene7 = scenes['7'];
  const fishIds = Array.from(new Set([...(scenes['6']?.fishes || []), ...(scene7?.fishes || [])]));
  for (const id of fishIds) {
    const fishRow = fish[String(id)] || fish[id];
    if (!fishRow) { manifest.missing.push({ category: 'fish-config', id }); continue; }
    const itemStem = assets[id].icon;
    const itemFile = `fish/item/${itemStem}.png`;
    const displayFile = fishRow.icon === itemStem ? itemFile : `fish/illustration/${fishRow.icon}.png`;
    addFile(findAsset(files, itemStem), itemFile, manifest, 'fish-item-icon');
    if (fishRow.icon !== itemStem) addFile(findAsset(files, fishRow.icon), displayFile, manifest, 'fish-illustration');
    manifest.fishMapping.push({ id, quality: fishRow.quality, type: fishRow.type, direction: fishRow.direction,
      scale: fishRow.scale, itemResource: itemStem, displayResource: fishRow.icon, itemFile, displayFile,
      scenes: referenceIds.filter(s => scenes[s].fishes.includes(id)) });
  }
  const relicMap = { 5802: 'icon_22005', 5803: 'icon_23005', 5320: 'icon_5320', 5321: 'icon_5321', 5322: 'icon_5322', 5323: 'icon_5323' };
  Object.entries(relicMap).forEach(([id, stem]) => {
    const file = `relics/${stem}.png`;
    addFile(findAsset(files, stem), file, manifest, 'relic-icon');
    manifest.relicMapping.push({ id: Number(id), resourceKey: stem, file, reusedEquipment: Number(id) >= 5800 });
  });
  for (let id = 1; id <= 10; id++) addFile(findAsset(files, `dy_label_${id}`), `common/type-labels/dy_label_${id}.png`, manifest, 'fish-type-label');

  if (manifest.missing.length) throw Error('MISSING_REFERENCES:' + JSON.stringify(manifest.missing));
  for (const folder of ['new_design/source', 'new_design/map', 'new_design/fish_icons', 'new_design/fish_large', 'new_design/relics']) {
    fs.mkdirSync(path.join(OUT, folder), { recursive: true });
  }

  manifest.counts = {
    files: manifest.files.length,
    missing: manifest.missing.length,
    sceneBackgrounds: manifest.files.filter((row) => row.category === 'scene-background').length,
    fishItemIcons: manifest.files.filter((row) => row.category === 'fish-item-icon').length,
    fishIllustrations: manifest.files.filter((row) => row.category === 'fish-illustration').length,
    relicIcons: manifest.files.filter((row) => row.category === 'relic-icon').length,
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  // Designer guide is supplied separately; image exporter only writes manifest.
  process.stdout.write(`${JSON.stringify({ result: 'PASS', output: OUT, counts: manifest.counts, missing: manifest.missing }, null, 2)}\n`);
}

main();
