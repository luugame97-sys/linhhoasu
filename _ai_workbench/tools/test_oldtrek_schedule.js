const assert = require('assert');
const path = require('path');

const servicePath = path.resolve(__dirname, '../../linhhoasu/lhs/newServer/src/services/OldTrekScheduleService');
const scheduleService = require(servicePath);
const handlerPath = path.resolve(__dirname, '../../linhhoasu/lhs/newServer/src/handlers/old-trek');
const { ensureOldTrekInfo } = require(handlerPath);

console.log('=== TEST 1: KIỂM TRA LỊCH TRÌNH TẠI THỜI ĐIỂM HIỆN TẠI ===');
const now = Date.now();
const currentSchedule = scheduleService.getSchedule(now);
console.log('Current Schedule:', {
  seasonNumber: currentSchedule.seasonNumber,
  totalSeason: currentSchedule.totalSeason,
  stage: currentSchedule.stage,
  isDepartAllowed: currentSchedule.isDepartAllowed,
  matchId: currentSchedule.matchId,
  start: new Date(currentSchedule.seasonStart).toISOString(),
  end: new Date(currentSchedule.seasonEnd).toISOString(),
  lastDepart: new Date(currentSchedule.lastDepart).toISOString(),
  lastSettle: new Date(currentSchedule.lastSettle).toISOString(),
});

assert.strictEqual(currentSchedule.stage, 2, 'Stage hiện tại phải là 2 (ON)');
assert.strictEqual(currentSchedule.isDepartAllowed, true, 'Hiện tại phải cho phép ra khơi (isDepartAllowed === true)');
assert.strictEqual(currentSchedule.matchId, 2, 'Match ID phải là 2 (OldTrekOpenConfig row 2)');
assert.ok(currentSchedule.totalSeason >= 2, 'Total season phải >= 2 để mở khóa Hệ thống 331 & Bản đồ 4');
assert.ok(currentSchedule.seasonEnd > now, 'seasonEnd phải nằm ở tương lai');
console.log('-> TEST 1 PASS!\n');

console.log('=== TEST 2: KIỂM TRA CHUYỂN GIAI ĐOẠN THEO CÁC MỐC THỜI GIAN ===');
const seasonStart = currentSchedule.seasonStart;
const seasonEnd = currentSchedule.seasonEnd;
const lastDepart = currentSchedule.lastDepart;
const lastSettle = currentSchedule.lastSettle;

// 2.1 Giữa mùa (đang ra khơi bình thường)
const midSeason = seasonStart + 1000 * 3600 * 24; // sau 1 ngày
const midSched = scheduleService.getSchedule(midSeason);
assert.strictEqual(midSched.stage, 2, 'Giữa mùa phải là Stage 2 (ON)');
assert.strictEqual(midSched.isDepartAllowed, true, 'Giữa mùa phải cho phép ra khơi');

// 2.2 Sau mốc lastDepart (8h10m trước khi hết mùa) nhưng trước lastSettle (8h)
const betweenDepartAndSettle = lastDepart + 60 * 1000; // 1 phút sau lastDepart
const depSched = scheduleService.getSchedule(betweenDepartAndSettle);
assert.strictEqual(depSched.stage, 2, 'Sau lastDepart nhưng trước lastSettle vẫn ở Stage 2 (ON)');
assert.strictEqual(depSched.isDepartAllowed, false, 'Sau lastDepart không được phép bắt đầu ra khơi mới');

// 2.3 Trong giai đoạn kết toán (8h cuối)
const settleTime = lastSettle + 60 * 1000; // 1 phút sau lastSettle
const settleSched = scheduleService.getSchedule(settleTime);
assert.strictEqual(settleSched.stage, 3, 'Trong 8h cuối phải là Stage 3 (WAITING_TO_SETTLE)');
assert.strictEqual(settleSched.isDepartAllowed, false, 'Trong kết toán không được phép ra khơi');

// 2.4 Ngay khi mùa giải kết thúc (Rollover sang mùa tiếp theo)
const nextSeasonTime = seasonEnd + 1000; // 1 giây sau mùa 1
const nextSched = scheduleService.getSchedule(nextSeasonTime);
assert.strictEqual(nextSched.seasonNumber, currentSchedule.seasonNumber + 1, 'Mùa giải mới phải tăng thêm 1');
assert.strictEqual(nextSched.stage, 2, 'Mùa giải mới phải lập tức quay về Stage 2 (ON)');
assert.strictEqual(nextSched.isDepartAllowed, true, 'Mùa giải mới phải cho phép ra khơi ngay lập tức');
assert.strictEqual(nextSched.seasonStart, seasonEnd, 'Mùa mới phải bắt đầu ngay mốc kết thúc mùa cũ (zero downtime)');
console.log('-> TEST 2 PASS!\n');

console.log('=== TEST 3: KIỂM TRA ROLLOVER DỮ LIỆU NGƯỜI CHƠI (BẢO LƯU TÀI SẢN & RESET THEO MÙA) ===');
// Tạo mock player ở mùa giải 1 với đầy đủ dữ liệu vĩnh viễn và mùa giải
const mockPlayer = {
  userId: 'test_player_001',
  name: 'Đạo Hữu Test',
  oldTrekArenaScore: 1850,
  other_attr_info: {
    oldTrekInfo: {
      season: 1,
      totalSeason: 2,
      lv: 15,
      exp: 1250,
      skin: 300002,
      shipSkins: [300001, 300002],
      unlockTechs: [101, 102, 103],
      sailorList: [{ id: 340101, star: 3 }, { id: 340102, star: 2 }],
      totalDistance: 5400,
      arenaGradeReward: 7,
      destRecords: [{ id: 1, score: 300 }],
      taskRecord: { 1: 50, 2: 100 },
      sailing: true,
      sailInfo: {
        trekData: { uid: 999, id: 1, diff: 1, dist: 200 },
        cabin: [{ uid: 1, id: 321, count: 5 }],
      },
    },
  },
};

// Mô phỏng gọi rollover sang mùa 2
const simulatedSeason2Schedule = {
  seasonNumber: 2,
  totalSeason: 2,
  stage: 2,
  seasonEnd: seasonEnd + 7 * 24 * 3600 * 1000,
  matchId: 2,
};

scheduleService.rolloverPlayerSeason(mockPlayer, simulatedSeason2Schedule);
const info = mockPlayer.other_attr_info.oldTrekInfo;

// Kiểm tra bảo lưu tài sản vĩnh viễn:
assert.strictEqual(info.lv, 15, 'Cấp thuyền phải giữ nguyên 15');
assert.strictEqual(info.exp, 1250, 'Exp thuyền phải giữ nguyên 1250');
assert.strictEqual(info.skin, 300002, 'Skin thuyền phải giữ nguyên');
assert.deepStrictEqual(info.shipSkins, [300001, 300002], 'Danh sách skin phải giữ nguyên');
assert.deepStrictEqual(info.unlockTechs, [101, 102, 103], 'Cây công nghệ phải giữ nguyên');
assert.strictEqual(info.sailorList.length, 2, 'Số lượng thủy thủ phải giữ nguyên');
assert.strictEqual(info.sailorList[0].star, 3, 'Sao thủy thủ phải giữ nguyên');

// Kiểm tra reset dữ liệu mùa:
assert.strictEqual(mockPlayer.oldTrekArenaScore, 1000, 'Điểm đấu trường phải reset về 1000');
assert.strictEqual(info.totalDistance, 0, 'Quãng đường mùa phải reset về 0');
assert.strictEqual(info.arenaGradeReward, 0, 'Phần thưởng bậc đấu trường phải reset về 0');
assert.deepStrictEqual(info.destRecords, [], 'Bản đồ đích đến mùa phải reset rỗng');
assert.deepStrictEqual(info.taskRecord, {}, 'Nhiệm vụ mùa phải reset rỗng');
assert.strictEqual(info.sailing, false, 'Chuyến tàu mùa cũ phải được kết thúc (sailing = false)');
assert.strictEqual(info.sailInfo.trekData, null, 'trekData mùa cũ phải bị hủy (null)');
assert.strictEqual(info.season, 2, 'Số mùa mới phải là 2');
assert.strictEqual(info.stage, 2, 'Stage mùa mới phải là 2 (ON)');
assert.strictEqual(info.matchId, 2, 'matchId mùa mới phải là 2');
console.log('-> TEST 3 PASS!\n');

console.log('=== TEST 4: TÍCH HỢP ENSUREOLDTREKINFO VỚI SERVER RUNTIME ===');
const freshPlayer = { userId: 'fresh_player_001', name: 'Tân Thủ' };
const ensured = ensureOldTrekInfo(freshPlayer);
assert.strictEqual(ensured.stage, currentSchedule.stage, 'ensureOldTrekInfo phải trả về stage của scheduler');
assert.strictEqual(ensured.matchId, 2, 'ensureOldTrekInfo phải trả về matchId = 2');
assert.strictEqual(ensured.season, currentSchedule.seasonNumber, 'ensureOldTrekInfo phải trả về đúng seasonNumber');
assert.ok(ensured.totalSeason >= 2, 'ensureOldTrekInfo phải trả về totalSeason >= 2');
assert.strictEqual(ensured.endTime, currentSchedule.seasonEnd, 'ensureOldTrekInfo phải trả về đúng endTime');
console.log('-> TEST 4 PASS!\n');

console.log('==============================================');
console.log('ALL TESTS PASSED 100%! HỆ THỐNG SẴN SÀNG TRIỂN KHAI!');
console.log('==============================================');
