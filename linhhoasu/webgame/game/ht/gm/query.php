<?php
/*
 阿泽源码网 www.lyzwlkj.vip
*/

session_start();
include '../config/config.php';

// ========== 公共：CDK 鉴权（每次请求都做，query.php 是 CDK 代理专用接口==========
$qidPost = isset($_POST['qid']) ? intval($_POST['qid']) : 0;
if ($qidPost < 1) exit_notice('请先选择大区', 1);
$quKey = strval($qidPost);
$qu = isset($qus[$quKey]) ? $qus[$quKey] : null;
if (!$qu) exit_notice('区服配置不存在', 1);

$uid = isset($_POST['uid']) ? trim($_POST['uid']) : '';
if ($uid === '') exit_notice('游戏账号不能为空', 1);
$pswd = isset($_POST['pswd']) ? trim($_POST['pswd']) : '';
if ($pswd === '') exit_notice('后台密码不能为空', 1);

// 连接 cdk 表所在的 MySQL（用当前选区 DB_*；跟 gmquery.php sendvip 写入的是同一张表同一份字段）
if (empty($qu['DB_HOST']) || empty($qu['DB_NAME'])) {
    exit_notice("当前选区未配置 MySQL 连接信息！", 1);
}
$mysqlicdk = new mysqli(
    $qu['DB_HOST'],
    $qu['DB_USER'],
    $qu['DB_PSWD'],
    $qu['DB_NAME'],
    isset($qu['DB_PORT']) ? intval($qu['DB_PORT']) : 3306
);
if ($mysqlicdk->connect_errno) exit_notice('CDK 数据库连接失败：' . $mysqlicdk->connect_error, 1);
$mysqlicdk->set_charset('utf8mb4');

$cdkLv = null;
$stmt = $mysqlicdk->prepare("SELECT lv, pass FROM cdk WHERE uid = ? AND qid = ? LIMIT 1");
$uidSql = strval($uid);
$qidSql = strval($qidPost);
$stmt->bind_param('ss', $uidSql, $qidSql);
$stmt->execute();
$result = $stmt->get_result();
if ($result->num_rows > 0) {
    $row = $result->fetch_array();
    if ($row['pass'] !== $pswd) exit_notice('后台密码错误', 1);
    $cdkLv = intval($row['lv']);
} else {
    exit_notice('账号未授权', 1);
}
if ($cdkLv < 1 || $cdkLv > 2) exit_notice('授权等级异常（仅支持 lv=1 或 lv=2）', 1);

// query.php 里"业务操作的目标玩家"必须来自前端锁定框（数字 userId）
// 注意：$_POST['uid'] 是 CDK 登录鉴权用的授权账号字符串（校验 cdk.uid/cdk.pass）
//       $_POST['target_userid'] 是「查找玩家」按钮查出来并锁定的数字 userId（操作对象）
//       两者语义不同，不要混用！
$_targetUsr = isset($_POST['target_userid']) ? trim($_POST['target_userid']) : '';

// ========== 通用：把 gmquery.php 里 ierr / parse_item_id 简化复制过来（避免跨文件依赖）==========
if (!function_exists('ierr')) {
    function ierr($r, $prefix = '接口请求失败', $errno = 2000) {
        $msg = $prefix . '：';
        if (is_array($r) && isset($r['message']))   $msg .= $r['message'];
        elseif (is_array($r) && isset($r['error'])) $msg .= $r['error'];
        else $msg .= json_encode($r, JSON_UNESCAPED_UNICODE);
        if (is_array($r) && !empty($r['code'])) $msg .= '（code=' . $r['code'] . '）';
        exit_notice($msg, $errno);
    }
}
if (!function_exists('proxy_parse_item_id')) {
    // 把 getitems.php 里 "123;物品名" / "123_物品名" / "123(物品名)" 统一提取出数字 ID
    function proxy_parse_item_id($raw) {
        $raw = trim(strval($raw));
        if ($raw === '') return 0;
        if (preg_match('/^(\d+)/', $raw, $m)) return intval($m[1]);
        if (ctype_digit($raw)) return intval($raw);
        $t = preg_replace('/[,;_\s（(].*$/u', '', $raw);
        return ctype_digit($t) ? intval($t) : 0;
    }
}

// ========== 核心业务 ==========
$action = isset($_POST['action']) ? trim($_POST['action']) : '';

/* -----------------------------------------------------------------
 * 0) lookup_player：按游戏账号(accountId)或角色名(name)查找玩家
 * ----------------------------------------------------------------- */
if ($action === 'lookup_player') {
    // 统一入口 key（跟 gmquery.php lookup_account 完全同逻辑）：
    //   优先级：POST['account']（前端新传的规范参数） > 兼容：POST['key'] / target_userid 兜底
    $key = isset($_POST['account']) ? trim($_POST['account']) : '';
    if ($key === '') { $key = isset($_POST['key']) ? trim($_POST['key']) : ''; }
    if ($key === '' && $_targetUsr !== '') {
        // 兼容老调用：万一有人直接把要查的字符串塞到 target_userid 里了，也能用（但前端现在是走 POST['account']）
        $key = $_targetUsr;
    }
    if ($key === '') exit_notice('请输入要查询的 登录账号 或 角色名', 1031);
    $q_limit = isset($_POST["limit"]) ? intval($_POST["limit"]) : 0;

    $roles = array();
    $seen  = array();
    $searchedDescription = array();
    $push_one = function($p) use (&$roles, &$seen) {
        $uid = isset($p['userId']) ? strval($p['userId']) : '';
        if ($uid === '' || isset($seen[$uid])) return;
        $seen[$uid] = true;
        $roles[] = $p;
    };
    $build_body = function($mode, $value, $limit) {
        $b = array();
        if ($mode === 'accountId') $b['accountId'] = $value;
        elseif ($mode === 'name')  $b['name']      = $value;
        elseif ($mode === 'userId') $b['userId']   = $value;
        if ($limit > 0) $b['limit'] = $limit;
        return $b;
    };

    $limit_per_phase = ($q_limit > 0) ? $q_limit : 80;

    // 阶段 1：按 accountId（登录账号）精确查 —— 跟 GM 后台一致，高优先级，不允许模糊
    $acc_key = strtolower(trim($key));
    $r1 = lhs_internal_call('/api/internal/player/lookup', $build_body('accountId', $acc_key, $limit_per_phase), 'POST');
    if ($r1['success'] && isset($r1['data']['roles']) && is_array($r1['data']['roles'])) {
        foreach ($r1['data']['roles'] as $p) $push_one($p);
        $searchedDescription[] = '账号=' . $acc_key . '(命中' . count($r1['data']['roles']) . ')';
    } else {
        $searchedDescription[] = '账号=' . $acc_key . '(未命中)';
    }

    // 阶段 2：按角色名 精确 查（必须输入正确的角色名，不允许模糊）
    $name_key = trim($key);
    $want = ($q_limit > 0) ? $q_limit : 50;
    if (count($roles) < $want && $name_key !== '') {
        $r2 = lhs_internal_call('/api/internal/player/lookup', $build_body('name', $name_key, $limit_per_phase), 'POST');
        $hitName = 0;
        if ($r2['success'] && isset($r2['data']['roles']) && is_array($r2['data']['roles'])) {
            foreach ($r2['data']['roles'] as $p) { $push_one($p); $hitName++; }
            $searchedDescription[] = '角色名(精确)=' . $name_key . '(命中' . $hitName . ')';
        } else {
            $searchedDescription[] = '角色名(精确)=' . $name_key . '(未命中)';
        }
    }

    if (count($roles) === 0) {
        exit_notice('没有找到符合条件的玩家（尝试：' . implode('；', $searchedDescription) . '）', 2006, array('list' => array(), 'total' => 0));
    }
    if ($q_limit > 0 && count($roles) > $q_limit) $roles = array_slice($roles, 0, $q_limit);
    $total = count($roles);

    // 前端只展示第一个（锁定 UserId = roles[0].userId），这里跟 GM 后台返回字段稍微对齐前端用的 key 叫 list（其实是一样的）
    exit_notice("找到 {$total} 位玩家，已锁定第一位：" . (isset($roles[0]['name']) ? $roles[0]['name'] : '') . '（' . (isset($roles[0]['userId']) ? $roles[0]['userId'] : '') . '）', 0, array(
        'total' => $total,
        'list'  => $roles,
        // 兼容 GM 后台 key，前端 index.html 的 btn-lookup 事件其实只取 data.list，所以加不加都行，加上保险
        'roles' => $roles,
        'hit'   => $total,
    ));
}

// 进入业务 action 前强制校验：必须带 target_userid（前端锁定框的值）
if ($action !== 'lookup_player' && $_targetUsr === '') {
    exit_notice('请先点击「查找玩家（精确匹配）」并成功锁定 UserId 后，再进行此操作', 1029);
}
$usr = $_targetUsr;

/* -----------------------------------------------------------------
 * 1) sendmoney：充值 / 发货币
 * ----------------------------------------------------------------- */
if ($action === 'sendmoney') {
    global $RECHARGE_YUAN_PER_DIAMOND_UNIT, $title, $contents;
    if (!isset($RECHARGE_YUAN_PER_DIAMOND_UNIT)) $RECHARGE_YUAN_PER_DIAMOND_UNIT = 10;

    $chargetype = isset($_POST['chargetype']) ? trim($_POST['chargetype']) : '';
    $chargenum  = isset($_POST['chargenum'])  ? trim($_POST['chargenum'])  : '';

    if ($chargetype === '' || $chargetype === '0') exit_notice('请选择货币类型', 1006);
    if ($chargenum === '' || !ctype_digit($chargenum)) exit_notice('请输入正确的货币数量（正整数）', 1007);
    $chargenum = intval($chargenum);
    if ($chargenum < 1) exit_notice('充值数量必须 ≥ 1', 1007);
    $chargemax = isset($GLOBALS['chargemax']) ? intval($GLOBALS['chargemax']) : 99999999;
    if ($chargenum > $chargemax) exit_notice('充值数量超过上限（最大 ' . $chargemax . '）', 1007);

    // ============ 分支一：钻石 chargetype=2：真实充值流程（不变）============
    if ($chargetype === '2') {
        $amountYuan = round($chargenum / $RECHARGE_YUAN_PER_DIAMOND_UNIT, 2);
        if ($amountYuan <= 0) exit_notice('按 1元=10钻 换算金额不足，请增加钻石数量', 1009);
        $orderId = 'CDK_' . date('YmdHis') . '_' . substr(md5($usr . mt_rand(1000, 9999)), 0, 6);
        $payload = array(
            'orderId'           => $orderId,
            'userId'            => $usr,
            'amount'            => $amountYuan,
            'productId'         => '',
            'productName'       => 'CDK充值钻石' . $chargenum,
            'channel'           => 'cdk_proxy',
            'note'              => 'CDK玩家后台充值 chargetype=2',
            'allowPendingOrder' => true,
            'idempotentSuccess' => true,
        );
        $r = lhs_internal_call('/api/internal/recharge', $payload);
        if (!$r['success']) ierr($r, '钻石充值失败', 2001);

        $d     = is_array($r['data']) ? $r['data'] : array();
        $giv   = isset($d['given'])       ? $d['given']       : array();
        $app   = isset($giv['applied'])   ? $giv['applied']   : array();
        $cur   = isset($app['currencies']) ? $app['currencies'] : array();
        $dmd   = isset($cur['diamond'])   ? intval($cur['diamond'])   : 0;
        $gld   = isset($cur['gold'])      ? intval($cur['gold'])      : 0;
        $slv   = isset($cur['silver'])    ? intval($cur['silver'])    : 0;
        $lv    = isset($app['level'])     ? intval($app['level'])     : 0;
        $exp   = isset($app['exp'])       ? intval($app['exp'])       : 0;
        $ri    = isset($giv['rechargeInfo']) ? $giv['rechargeInfo'] : array();
        $first = isset($ri['firstRecharge']) ? intval($ri['firstRecharge']) : 0;
        // 与 gmquery.php sendmoney 弹窗显示完全一致：实发 + 命中首充双倍判断 + 金额 + VIP
        $diamondOut = $dmd;
        $vipOut     = isset($ri['vipLevel']) ? intval($ri['vipLevel']) : 0;
        $firstHint  = '';
        if ($diamondOut > $chargenum) {
            $firstHint = "（命中首充双倍，预期=" . ($chargenum * 2) . "）";
        }
        exit_notice(
            "充值成功：订单 {$orderId}，实发 {$diamondOut} 元宝 {$firstHint}，折合 {$amountYuan} 元，当前 VIP={$vipOut}",
            0,
            array(
                'orderId'    => $orderId,
                'amountYuan' => $amountYuan,
                'diamond'    => $diamondOut,
                'vipLevel'   => $vipOut,
                'raw'        => isset($r['data']) ? $r['data'] : null,
                // 兼容之前前端取的字段，留着不会崩
                'silver'     => $slv,
                'gold'       => $gld,
                'level'      => $lv,
                'exp'        => $exp,
                'firstRecharge' => $first,
            )
        );
    }

    // ============ 分支二：银币（chargetype=1 → 物品 ID=2） / 天衍令（1001） / 其它物品ID → 统一走邮件附件 ============
    if ($chargetype === '1') {
        $itemId   = 2;
        $itemName = '银币';
    } else {
        $intType = intval($chargetype);
        if ($intType <= 0 || strval($intType) !== trim($chargetype)) {
            exit_notice("不支持的类型 chargetype={$chargetype}，支持：1=银币(ID=2邮件) / 2=元宝(直接充值到包) / 其它正整数=物品ID（如 1001=天衍令邮件）", 1008);
        }
        $itemId   = $intType;
        $itemName = "物品ID{$intType}";
        // 展示名只保留 天衍令=1001，其它按 ID 写；不要在邮件分支里提"元宝"以免混淆
        if ($intType === 1001) $itemName = '天衍令';
    }

    $mailPayload = array(
        'userId'      => $usr,
        'title'       => $title,
        'content'     => $contents,
        'expireDays'  => 30,
        'attachments' => array(array('id' => $itemId, 'count' => $chargenum)),
    );
    $r = lhs_internal_call('/api/internal/mail/send', $mailPayload);
    if (!$r['success']) ierr($r, '邮件发送失败（未送达）', 2010);
    $bizRaw = isset($r['data']) ? $r['data'] : null;
    $bizOk  = is_array($bizRaw) && !empty($bizRaw['success']);
    if (!$bizOk) {
        $bizErr = is_array($bizRaw) && isset($bizRaw['error']) ? strval($bizRaw['error']) : '未知错误';
        ierr($r, '游戏服邮件发送失败：' . $bizErr, 2011);
    }
    $total   = isset($bizRaw['total'])   ? intval($bizRaw['total'])   : 1;
    $batchId = isset($bizRaw['batchId']) ? $bizRaw['batchId']          : '';
    exit_notice(
        "邮件发送成功：{$itemName}（ID={$itemId}）× {$chargenum} 已以邮件附件形式送达，共 {$total} 封（batchId={$batchId}）",
        0,
        array(
            'itemName'   => $itemName,
            'itemId'     => $itemId,
            'itemNum'    => $chargenum,
            'chargetype' => $chargetype,
            'total'      => $total,
            'batchId'    => $batchId,
            'mail_raw'   => $r,
        )
    );
}

if ($action === 'sendmail') {
    global $title, $contents;
    if ($cdkLv !== 2) exit_notice('后台权限不足（发送物品需要 lv=2）', 1024);
    $attachId  = isset($_POST["itemid"])    ? proxy_parse_item_id($_POST["itemid"]) : 0;
    $attachNum = isset($_POST["itemnum"])   ? intval($_POST["itemnum"])             : 0;
    $expDays   = isset($_POST["expire_days"]) ? intval($_POST["expire_days"])       : 30;

    $payload = array(
        'userId'      => $usr,
        'title'       => $title,
        'content'     => $contents,
        'expireDays'  => max(1, $expDays),
        'attachments' => array(),
    );

    $hasJson = isset($_POST["attachments"]) && $_POST["attachments"] !== '' && $_POST["attachments"] !== null;
    if ($hasJson) {
        $extra = json_decode($_POST["attachments"], true);
        if (is_array($extra)) {
            $seenKeys = array();
            foreach ($extra as $a) {
                if (!is_array($a) || !isset($a['id']) || !isset($a['count'])) continue;
                $id    = intval($a['id']);
                $count = intval($a['count']);
                if ($id <= 0 || $count <= 0) continue;
                $k = strval($id);
                if (isset($seenKeys[$k])) {
                    $payload['attachments'][$seenKeys[$k]]['count'] += $count;
                } else {
                    $seenKeys[$k] = count($payload['attachments']);
                    $payload['attachments'][] = array('id' => $id, 'count' => $count);
                }
            }
        }
    } else {
        if ($attachId > 0 && $attachNum > 0) {
            $payload['attachments'][] = array('id' => $attachId, 'count' => $attachNum);
        }
    }

    if (empty($payload['attachments'])) {
        exit_notice('单人邮件必须至少包含 1 个有效附件（物品 ID>0 且数量≥1），不允许发送空邮件', 1025);
    }

    $r = lhs_internal_call('/api/internal/mail/send', $payload);
    if (!$r['success']) ierr($r, '邮件发送失败', 2003);
    $attCount = 0;
    foreach ($payload['attachments'] as $_a) $attCount += intval($_a['count']);
    $total = isset($r['data']['total']) ? intval($r['data']['total']) : 1;
    exit_notice(
        "邮件发送成功，共 {$total} 封（含 " . count($payload['attachments']) . " 种附件，合计 {$attCount} 件）",
        0,
        array(
            'batchId'     => isset($r['data']['batchId']) ? $r['data']['batchId'] : null,
            'total'       => $total,
            'attachments' => $payload['attachments'],
        )
    );
}

// 未知 action
exit_notice(
    "不支持的操作类型！",
    1,
    array('cdkLv' => $cdkLv, 'uid' => $usr, 'qid' => $qidPost)
);
