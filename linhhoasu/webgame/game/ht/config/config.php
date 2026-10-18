<?php
// 冷雨泽Q32838727 功能添加  请尊重每一个学习的人.勿删！！！
error_reporting(0);
date_default_timezone_set('PRC');
header("Content-type: text/html; charset=utf-8");
//===============key信息=请勿修改或删除=====================
$key='// 版本 2022 Powered by 阿泽源码网 www.lyzwlkj.vip 勿改';
//===============key信息=请勿修改或删除=====================
// ========== 基础信息 ==========
$gamename  = '灵画师';
$namecol   = '游戏账号或角色名';   // 玩家账号登录列名（= mongo Player.userId）
$copyright = '阿泽源码网：www.lyzwlkj.vip';
$gmcode    = 'lyzwlkj.vip';       // gm.html GM 密码（gmquery.php 校验用）

// 发物品/发邮件时默认的系统邮件文案
$title     = '系统邮件';
$contents  = '灵画师-您有新的物品,请查收！';

// 单次最大数量（前端与后端双重校验）
$chargemax = 99999999;
$itemmax   = 99999999;

// ========== 服务端真实映射 ← 以 newServer 源码为准 ==========
// 兑换比例：充值 1 元 = 10 元宝（首充双倍；recharge.js calcDiamond 兜底）
$RECHARGE_YUAN_PER_DIAMOND_UNIT = 10;  // 10 钻 = 1 元

//   2 → diamond：走 /api/internal/recharge，算 VIP / 累计充值 / 首充，直接到包
//   1 → silver：  映射物品 ID=2，走 /api/internal/mail/send 邮件附件
//   1001 → 物品ID：天衍令，走 /api/internal/mail/send 邮件附件
$CURRENCY_MAP = array(
    '2' => array(
        'cur'         => 'diamond',
        'name'        => '元宝',
        'mode'        => 'recharge',      // 走充值流程
        'desc'        => '走充值流程（算VIP、累计充值、首充双倍），直接到包，10钻 ≈ 1元',
    ),
    '1' => array(
        'cur'         => 'silver',
        'name'        => '银币',
        'mode'        => 'mail_item',     // 走邮件附件（物品 ID=2）
        'desc'        => '映射物品ID=2，以邮件附件形式送达，玩家领取邮件时获得（不计算累计充值）',
    ),
    '1001' => array(
        'cur'         => '1001',          // 物品 ID
        'name'        => '天衍令',
        'mode'        => 'mail_item',     // 走邮件附件
        'desc'        => '物品 ID=1001，以邮件附件形式送达，玩家领取邮件时获得（不计算累计充值）',
    ),
);

$ITEM_TO_CURRENCY = array(
    1 => 'diamond', // ID=1 = 元宝
    2 => 'silver',  // ID=2 = 银币
    6 => 'gold',    // ID=6 = 金币
);
$CURRENCY_TO_ITEM = array(
    'diamond' => 1,
    'silver'  => 2,
    'gold'    => 6,
);

// ========== 游戏服 Internal API ==========
$GAME_HTTP_BASE     = 'http://127.0.0.1:8080';
$INTERNAL_API_KEY   = '289bdbcffd8dba865cda57e8db55a845f077e57830157c627bc9e30a7f759dde';

// ========== CDK 授权库 ==========
$PZ = array(
    'DB_HOST'   => '127.0.0.1',
    'DB_NAME'   => 'cdks',
    'DB_USER'   => 'root',
    'DB_PWD'    => '123456',
    'DB_PORT'   => '3306',
    'DB_CHARSET'=> 'utf8',
);

// ========== 区服列表 ==========
$qus = array(
    '1' => array(
        'name'      => '阿泽源码网1区',
        'DB_HOST'   => '127.0.0.1',
        'DB_PORT'   => 3306,
        'DB_NAME'   => 'cdks',
        'DB_GAME'   => 'lhs',
        'DB_USER'   => 'root',
        'DB_PSWD'   => '123456',
        'GAME_URL'  => $GAME_HTTP_BASE,
        'GAME_KEY'  => $INTERNAL_API_KEY,
        'SERVER_ID' => 1001,
        'hidde'     => false,
    ),
);

// ========== 通用函数 ==========
function exit_notice($message, $errno, $other = array()) {
    if (is_array($message)) $message = json_encode($message, JSON_UNESCAPED_UNICODE);
    $rtn = array('message' => $message, 'errno' => $errno);
    if (is_array($other) && count($other) > 0) {
        foreach ($other as $k => $v) $rtn[$k] = $v;
    }
    exit(json_encode($rtn, JSON_UNESCAPED_UNICODE));
}

/**
 * 签名算法
 * payload = method\npath\ntimestamp\nnonce\nbody
 *   body: null/'' -> ''; array -> JSON_UNESCAPED_UNICODE; string -> 原样
 * signature = HMAC-SHA256(API_KEY, payload)
 */
function lhs_sign_internal($method, $path, $timestamp, $nonce, $body) {
    // normalizeBody
    if ($body === null || $body === '' || $body === false) $bodyStr = '';
    else if (is_array($body) || is_object($body))          $bodyStr = json_encode($body, JSON_UNESCAPED_UNICODE);
    else                                                   $bodyStr = (string)$body;

    $payload = strtoupper($method) . "\n"
             . $path . "\n"
             . $timestamp . "\n"
             . $nonce . "\n"
             . $bodyStr;
    global $INTERNAL_API_KEY;
    return hash_hmac('sha256', $payload, (string)$INTERNAL_API_KEY);
}

function lhs_random_nonce($len = 16) {
    $hex = function_exists('random_bytes') ? bin2hex(random_bytes((int)ceil($len / 2)))
           : substr(md5(uniqid((string)mt_rand(), true)), 0, $len * 2);
    return substr($hex, 0, $len);
}

/**
 * 签名校验类错误码
 */
function lhs_translate_sign_error($err) {
    $map = array(
        'UNAUTHORIZED'      => 'UNAUTHORIZED：INTERNAL_API_KEY 与游戏服 API_KEY 不一致。请在 /data/lhs/newServer/.env（或 pm2 env）查看 API_KEY=xxxx，并把 config.php 第73行改成同一值；重启 pm2 后重试',
        'INVALID_TIMESTAMP' => 'INVALID_TIMESTAMP：gmquery.php 没发 x-timestamp（或者发的不是数字）。如果是旧 config.php，请重新上传 config.php；若仍报错，说明 PHP 与 Node 时钟偏差超过 ±5 分钟，执行：date && timedatectl set-timezone Asia/Shanghai  && 同步 hwclock 后再试',
        'TIMESTAMP_EXPIRED' => 'TIMESTAMP_EXPIRED：PHP 时间与游戏服 Node 时间相差大于 5 分钟（签名窗口）。请在服务器执行：timedatectl set-timezone Asia/Shanghai && chronyc makestep（或 ntpdate pool.ntp.org），把 PHP-FPM 与 Node 两侧都同步 NTP；或临时在 newServer 启动时加 INTERNAL_API_SIGNATURE_WINDOW_MS=6000000 放宽到 100 分钟',
        'INVALID_NONCE'     => 'INVALID_NONCE：x-nonce 为空或长度 <8 位，请重新上传最新 config.php',
        'NONCE_REPLAYED'    => 'NONCE_REPLAYED：同一个随机数 nonce 被重发了 2 次，刷新 gm.html 重新操作即可',
        'INVALID_SIGNATURE' => 'INVALID_SIGNATURE：HMAC-SHA256 签名不匹配。请确认 config.php $INTERNAL_API_KEY 与游戏服 env 的 API_KEY 完全一致；并确认 /api/internal/* 的 path 前缀没有被 Nginx rewrite 掉（gmquery.php → curl 是直连 127.0.0.1:8080，正常不走 rewrite）',
        'RATE_LIMITED'      => 'RATE_LIMITED：1 分钟内请求超过限流阈值，等 1 分钟再试；或调大 INTERNAL_API_MAX_REQUESTS',
    );
    $s = is_string($err) ? trim($err) : '';
    if ($s !== '' && isset($map[$s])) return $map[$s];
    return $s;
}

/**
 * 调用游戏服 Internal API（X-API-Key + HMAC 签名双校验）
 * 真实对应 newServer HTTPServer.js 内 /api/internal/* 路由
 *   鉴权流程（HTTPServer.js _authApiKey）：
 *     ① X-API-Key 头 == API_KEY 环境变量 → 否则 UNAUTHORIZED
 *     ② verifyInternalRequest：timestamp(±5min) / nonce(≥8位，不重复) / signature(HMAC-SHA256)
 *     ③ 限流
 * @param string $path   例如 /api/internal/player/give/test001
 * @param mixed  $data   POST body（数组→JSON），null=GET
 * @param string $method GET/POST，默认自动判定
 * @return array ['success','data','raw','http_code','error']
 */
function lhs_internal_call($path, $data = null, $method = null) {
    global $GAME_HTTP_BASE, $INTERNAL_API_KEY;

    $useMethod = $method;
    if ($useMethod === null) $useMethod = ($data === null) ? 'GET' : 'POST';
    $useMethod = strtoupper($useMethod);

    $timestamp = (string)(microtime(true) * 1000);   // Node Date.now() 毫秒
    $nonce     = lhs_random_nonce(16);

    // 生成 body 字符串
    if ($useMethod === 'POST') {
        $bodyStr = ($data === null || $data === '')
            ? ''
            : (is_array($data) || is_object($data)
                ? json_encode($data, JSON_UNESCAPED_UNICODE)
                : (string)$data);
    } else {
        $bodyStr = '';  // GET 时 body 不计入签名
    }
    $signature = lhs_sign_internal($useMethod, $path, $timestamp, $nonce, $bodyStr);

    $url = rtrim($GAME_HTTP_BASE, '/') . '/' . ltrim($path, '/');
    $headers = array(
        'X-API-Key: '    . $INTERNAL_API_KEY,
        'X-Timestamp: '  . $timestamp,
        'X-Nonce: '      . $nonce,
        'X-Signature: '  . $signature,
        'Content-Type: application/json; charset=utf-8',
    );

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

    if ($useMethod === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($bodyStr !== '') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyStr);
        }
    } else if ($useMethod !== 'GET') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $useMethod);
        if ($bodyStr !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyStr);
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $body     = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    $decoded = json_decode($body === false ? '' : (string)$body, true);
    $ok      = $body !== false && $httpCode >= 200 && $httpCode < 300
               && is_array($decoded) && (isset($decoded['success']) ? (bool)$decoded['success'] : true);

    // 把签名校验错误码换成中文可定位文案
    if (!$ok && is_array($decoded) && !empty($decoded['error'])) {
        $translated = lhs_translate_sign_error($decoded['error']);
        if ($translated !== '' && $translated !== $decoded['error']) {
            $decoded['error'] = $translated;
        }
    } else if (!$ok && $httpCode == 401 && is_string($body) && strpos($body, 'UNAUTHORIZED') !== false) {
        // 401 body 直接是 {success:false, error:'UNAUTHORIZED'}，即便 json_decode 失败也给用户提示
        if (!is_array($decoded)) $decoded = array('error' => lhs_translate_sign_error('UNAUTHORIZED'));
    }

    return array(
        'success'   => $ok,
        'data'      => is_array($decoded) ? $decoded : null,
        'raw'       => $body === false ? '' : (string)$body,
        'http_code' => $httpCode,
        'error'     => (string)$error,
    );
}
