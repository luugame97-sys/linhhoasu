const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const NOTICE_FILE = path.resolve(__dirname, '../../config/notice.json');

const DEFAULT_NOTICE = {
  notice: {
    serverName: 'Linh Hoa Sĩ',
    serverTime: Date.now(),
    showNewServerInfo: false,
    pop: true,
    imgs: [],
    imgs2: [],
    imgs3: [],
    imgs4: [],
  },
  noticeText: '',
  noticeText2: '',
  noticeText3: '',
  noticeText4: '',
};

class NoticeService {
  constructor() {
    this.cachedConfig = null;
    this.lastMtime = 0;
  }

  loadConfig() {
    try {
      if (!fs.existsSync(NOTICE_FILE)) {
        return this.cachedConfig || DEFAULT_NOTICE;
      }
      const stat = fs.statSync(NOTICE_FILE);
      if (this.cachedConfig && stat.mtimeMs === this.lastMtime) {
        return this.cachedConfig;
      }
      const raw = fs.readFileSync(NOTICE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      this.cachedConfig = {
        notice: {
          ...DEFAULT_NOTICE.notice,
          ...(parsed.notice || {}),
          serverTime: Date.now(),
        },
        noticeText: String(parsed.noticeText || ''),
        noticeText2: String(parsed.noticeText2 || ''),
        noticeText3: String(parsed.noticeText3 || ''),
        noticeText4: String(parsed.noticeText4 || ''),
      };
      this.lastMtime = stat.mtimeMs;
      return this.cachedConfig;
    } catch (err) {
      logger.warn('[NoticeService] Error loading notice.json, using fallback:', err.message);
      return this.cachedConfig || DEFAULT_NOTICE;
    }
  }

  populateNoticeParams(param, keyList = []) {
    const config = this.loadConfig();

    // Luôn gửi notice object dạng JSON string để client parse vào AppInfo.params.notice
    param.notice = JSON.stringify(config.notice);

    const keys = ['noticeText', 'noticeText2', 'noticeText3', 'noticeText4'];
    const langs = ['', '_cn', '_tw', '_en'];

    keys.forEach((k) => {
      const val = config[k] || '';
      langs.forEach((l) => {
        param[k + l] = val;
      });
    });
  }

  getNotice() {
    return this.loadConfig();
  }

  saveNotice(data) {
    try {
      const dir = path.dirname(NOTICE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(NOTICE_FILE, JSON.stringify(data, null, 2), 'utf8');
      this.cachedConfig = null;
      this.lastMtime = 0;
      return true;
    } catch (err) {
      logger.error('[NoticeService] Failed to save notice.json:', err);
      return false;
    }
  }
}

module.exports = new NoticeService();
