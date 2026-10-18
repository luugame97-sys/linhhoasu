/**
 * OldTrekScheduleService.js
 * Quản lý chu kỳ mùa giải chuẩn tự động lặp lại liên tục cho sự kiện Hoang Cổ Mê Hàng (Old Trek / Kết Vân Cung).
 */

const StageType = {
  OFF: 0,
  PREPARE: 1,
  ON: 2,
  WAITING_TO_SETTLE: 3,
  RESULT: 4,
};

// Chu kỳ mùa giải chuẩn: 7 ngày (1 tuần / mùa)
const CYCLE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Offset theo cấu hình gốc OldTrekOpenConfig[2]:
// lastDepart: 29400s (8h10m trước khi mùa giải kết thúc) - dừng nhận chuyến ra khơi mới
// lastSettle: 28800s (8h00m trước khi mùa giải kết thúc) - giai đoạn kết toán bảng xếp hạng
const LAST_DEPART_OFFSET_MS = 29400 * 1000;
const LAST_SETTLE_OFFSET_MS = 28800 * 1000;

// Mốc khởi nguyên mùa giải: Chủ nhật 2026-09-20 00:00:00 GMT+7 (1789837200000)
// Giúp thời điểm hiện tại đang ở StageType.ON (2) với hơn 5 ngày hoạt động
const ANCHOR_TIME_MS = 1789837200000;

// Cấu hình ID chuẩn trong OldTrekOpenConfig
const MATCH_ID = 2;

class OldTrekScheduleService {
  constructor(options = {}) {
    this.anchorTimeMs = Number(options.anchorTimeMs) || ANCHOR_TIME_MS;
    this.cycleDurationMs = Number(options.cycleDurationMs) || CYCLE_DURATION_MS;
    this.lastDepartOffsetMs = Number(options.lastDepartOffsetMs) || LAST_DEPART_OFFSET_MS;
    this.lastSettleOffsetMs = Number(options.lastSettleOffsetMs) || LAST_SETTLE_OFFSET_MS;
    this.matchId = Number(options.matchId) || MATCH_ID;
  }

  /**
   * Tính toán thông tin mùa giải tại thời điểm `now`
   * @param {number} now - timestamp mili-giây (mặc định Date.now())
   * @returns {Object} Thông tin mùa giải và giai đoạn
   */
  getSchedule(now = Date.now()) {
    const currentMs = Math.max(0, Number(now) || Date.now());
    const elapsed = Math.max(0, currentMs - this.anchorTimeMs);
    const seasonIndex = Math.floor(elapsed / this.cycleDurationMs);
    const seasonNumber = seasonIndex + 1;
    const seasonStart = this.anchorTimeMs + seasonIndex * this.cycleDurationMs;
    const seasonEnd = seasonStart + this.cycleDurationMs;
    const lastDepart = seasonEnd - this.lastDepartOffsetMs;
    const lastSettle = seasonEnd - this.lastSettleOffsetMs;

    let stage = StageType.ON; // 2
    if (currentMs < seasonStart) {
      stage = StageType.PREPARE;
    } else if (currentMs >= lastSettle) {
      stage = StageType.WAITING_TO_SETTLE; // 3: kết toán
    } else {
      stage = StageType.ON; // 2: đang mở ra khơi
    }

    // totalSeason >= 2 để mở khóa Hệ thống 331 (Vạn Giới Phách Hành) & Bản đồ 4 theo OldTrekSeasonLockConfig
    const totalSeason = Math.max(2, seasonNumber);

    return {
      matchId: this.matchId,
      seasonNumber,
      totalSeason,
      seasonStart,
      seasonEnd,
      lastDepart,
      lastSettle,
      stage,
      isDepartAllowed: stage === StageType.ON && currentMs < lastDepart,
    };
  }

  /**
   * Kiểm tra và thực hiện chuyển đổi mùa giải cho người chơi khi bước sang mùa giải mới.
   * Bảo lưu 100% tài sản vĩnh viễn (cấp thuyền, exp, ảo hóa, kỹ năng, thủy thủ, trận hình).
   * Reset các chỉ số và dữ liệu theo mùa (điểm đấu trường, quãng đường, bản đồ, nhật ký).
   * @param {Object} player - Đối tượng người chơi
   * @param {Object} schedule - Đối tượng lịch trình từ getSchedule()
   */
  rolloverPlayerSeason(player, schedule) {
    if (!player || typeof player !== 'object') return;
    player.other_attr_info = player.other_attr_info || {};
    const info = player.other_attr_info.oldTrekInfo || {};
    // Preserve the prior season's financial/progression evidence. The archive
    // is consumed by settlement, not deleted on a timer or login.
    if (Number(info.season) > 0 && Number(info.season) !== schedule.seasonNumber) {
      info.seasonArchives = info.seasonArchives || {};
      const key = String(info.season);
      if (!info.seasonArchives[key]) info.seasonArchives[key] = {
        season: info.season, endTime: info.endTime, totalDistance: info.totalDistance || 0,
        arenaScore: player.oldTrekArenaScore ?? 1000, arenaPlayed: info.arenaPlayed || 0, taskRecord: info.taskRecord || {},
        passRecords: info.passRecords || [], sailInfo: info.sailInfo || {},
        firstRewardRecords: info.firstRewardRecords || {}, arenaGradeReward: info.arenaGradeReward || 0,
        capturedAt: Date.now(), needsSettlement: true,
      };
    }

    // 1. Reset dữ liệu đấu trường và xếp hạng mùa giải
    player.oldTrekArenaScore = 1000;
    info.arenaGradeReward = 0;
    info.arenaPlayed = 0;
    info.arenaBattleLogs = [];
    info.battleRecords = {};
    info.battleLogs = [];

    // 2. Reset hành trình mùa giải
    info.totalDistance = 0;
    info.taskRecord = {};
    info.destRecords = [];
    info.dest = [{ id: 1, taskClaimed: [], rewardClaimed: [] }];
    // Paid destination passes are permanent under the approved local policy.
    // Retain entitlements; mileage claims restart in a separate seasonal scope.
    info.passRecords = (info.passRecords || []).map(row => ({ ...row, claimRecord: {} }));
    info.firstRewardRecords = {};
    info.arenaMatch = null;
    info.arenaEnemy = null;
    player.oldTrekArenaRank = 0;

    // 3. Kết thúc mọi chuyến tàu đang chạy từ mùa cũ
    info.sailing = false;
    if (info.sailInfo && typeof info.sailInfo === 'object') {
      info.sailInfo = { ...info.sailInfo };
      info.sailInfo.trekData = null;
      info.sailInfo.currentEvent = null;
      info.sailInfo.cabin = [];
      info.sailInfo.eventLogs = [];
      info.sailInfo.effects = [];
    }

    // 4. Cập nhật thông tin mùa giải mới
    info.season = schedule.seasonNumber;
    info.totalSeason = schedule.totalSeason;
    info.matchId = schedule.matchId;
    info.stage = schedule.stage;
    info.endTime = schedule.seasonEnd;
  }
}

const defaultInstance = new OldTrekScheduleService();

module.exports = defaultInstance;
module.exports.OldTrekScheduleService = OldTrekScheduleService;
module.exports.StageType = StageType;
