'use strict';

// Read-only investigation: no writes, network, application bootstrap or logger imports.
// node audit_power_formatter_20260913.js; POWER_AUDIT_ROOT=/linhhoasu node < script.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const vm = require('vm');

function decodeFonts(buffer) {
    const bytes = zlib.inflateSync(buffer);
    let pos = 0;
    function byte() {
        if (pos >= bytes.length) throw new Error('Truncated font pack');
        return bytes[pos++];
    }
    function auto(signed) {
        let value = 0, multiplier = 1, first = true, negative = false, raw;
        do {
            raw = byte();
            let part = raw & 127;
            if (signed && first) { negative = !!(part & 64); part &= 63; }
            value += part * multiplier;
            multiplier *= signed && first ? 64 : 128;
            first = false;
            if (!Number.isSafeInteger(value)) throw new Error('Unsafe font integer');
        } while (raw & 128);
        return negative ? -value : value;
    }
    function str() {
        const length = auto(false);
        if (pos + length > bytes.length) throw new Error('Truncated font string');
        const result = bytes.subarray(pos, pos + length).toString('utf8');
        pos += length;
        return result;
    }
    const fonts = {};
    while (pos < bytes.length) {
        const name = str(), count = auto(false), glyphs = [];
        for (let n = 0; n < count; n++) {
            glyphs.push(str());
            for (let k = 0; k < 4; k++) auto(false);
            if (byte()) { auto(true); auto(true); auto(false); auto(false); }
        }
        fonts[name + '_fnt'] = glyphs;
    }
    return fonts;
}

function audit(root) {
    root = path.resolve(root);
    const sources = {};
    function read(relative) {
        const buffer = fs.readFileSync(path.join(root, relative));
        sources[relative] = { bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
        return buffer;
    }
    // Import protocol-only modules, deliberately not ConfigService (which imports logger).
    const { BinJsonUtil, ByteArray } = require(path.join(root, 'lhs/newServer/src/protocol/BinJsonUtil'));
    const assets = 'webgame/game/update/resource/assets/';
    const langBytes = read(assets + 'excel/lang_cn/config_lang_c2fa8585.bin');
    let pos = 0, language;
    while (pos < langBytes.length) {
        const nameLength = langBytes[pos++];
        if (!nameLength || pos + nameLength + 4 > langBytes.length) throw new Error('Invalid language header');
        const name = langBytes.subarray(pos, pos + nameLength).toString();
        pos += nameLength;
        const length = langBytes.readUInt32BE(pos); pos += 4;
        if (!length || pos + length > langBytes.length) throw new Error('Invalid language table length');
        if (name === 'LanguageConfig') language = BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(langBytes.subarray(pos, pos + length))));
        pos += length;
    }
    if (!language) throw new Error('LanguageConfig missing');
    const main = read('webgame/game/js/main.min_a6195824.js').toString();
    read('webgame/game/js/start.min_52ac8d58.js');
    const context = vm.createContext({ wPt: {}, AppInfo: { lang: 'cn' }, B: { ConvertLanguageToText: id => language[id] && language[id].cn } });
    const functions = {};
    for (const name of ['truncateDecimal', 'overLength', 'overLengthEn', 'overLengthPower', 'overLenghPowerEn']) {
        const start = main.indexOf('wPt.' + name + '=function');
        const end = main.indexOf('},wPt.', start);
        if (start < 0 || end < start) throw new Error('Formatter anchor missing: ' + name);
        const source = main.slice(start, end + 1);
        functions[name] = { line: main.slice(0, start).split('\n').length, offset: start, source };
        vm.runInContext(source, context, { timeout: 1000 });
    }
    const fonts = Object.assign({}, decodeFonts(read(assets + 'cfg/fnt_pack_128141c4.bin')),
        decodeFonts(read(assets + 'cfg/lang_cn/fnt_lang_pack_3f07747f.bin')));
    const glyphs = fonts.font_num_zhanli_fnt;
    const supported = new Set(glyphs);
    const samples = [0, 1, 999, 9999, 10000, 12345, 999999, 1000000, 1234567, 99999999, 100000000, 123456789, 1000000000, 1234567890, 1e12].map(raw => {
        const text = String(context.wPt.overLengthPower(raw));
        return { raw, powerText: text, genericText: String(context.wPt.overLength(raw)),
            supportedGlyphText: [...text].filter(c => supported.has(c)).join(''),
            missingGlyphs: [...new Set([...text].filter(c => !supported.has(c)))] };
    });
    context.AppInfo.lang = 'en';
    const englishPowerText = context.wPt.overLengthPower(123456789);
    const allSkins = BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(read(assets + 'cfg/gameEui_18e11b8e.bin'))));
    const skins = {};
    for (const name of ['PowerCell1Skin', 'PowerCell2Skin', 'MainPanelSkin', 'MainPanelNewSkin', 'RoleInfoPanelSkin', 'OtherPlayerInfoPanelSkin', 'ArenaChallengeItemSkin', 'RankItemSkin']) {
        const skin = allSkins[name];
        skins[name] = skin ? (name.startsWith('PowerCell') ? skin : Object.fromEntries(Object.entries(skin).filter(([key]) => ['power', 'powerCell', 'powerLabel'].includes(key)))) : null;
    }
    return { root, sources, units: Object.fromEntries([30020170, 30020171, 30020322].map(id => [id, language[id]])),
        functions, glyphs, samples, englishPowerText, skins,
        caveat: 'Source execution and glyph coverage only; not a screenshot or same-player raw-value comparison.' };
}

module.exports = { audit, decodeFonts };
if (require.main === module || process.argv[1] === '-') {
    const root = process.env.POWER_AUDIT_ROOT || path.resolve(__dirname, '../../linhhoasu');
    process.stdout.write(JSON.stringify(audit(root), null, 2) + '\n');
}
