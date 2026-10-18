<?php
/*
 * 阿泽源码网 www.lyzwlkj.vip
 */
include "../config/config.php";

// ========== 参数解析（兼容别名） ==========
$qu = isset($_REQUEST["qid"]) ? intval($_REQUEST["qid"]) : (isset($_REQUEST["qu"]) ? intval($_REQUEST["qu"]) : 0);
if (!$qu) exit_notice("请先选区", 1001);
if (!isset($GLOBALS['qus'][$qu])) exit_notice("区服不存在", 1002);

$code = isset($_REQUEST["gmcode"]) ? $_REQUEST["gmcode"] : (isset($_REQUEST["code"]) ? $_REQUEST["code"] : "");
if (!$code || $code !== $GLOBALS['gmcode']) exit_notice("GM码错误", 1004);

$usr = isset($_REQUEST["uid"]) ? trim($_REQUEST["uid"])
     : (isset($_REQUEST["usr"]) ? trim($_REQUEST["usr"])
     : (isset($_REQUEST["user"]) ? trim($_REQUEST["user"]) : ""));
$usr = str_replace([" ", "%"], "", $usr);

$action = isset($_REQUEST["action"]) ? $_REQUEST["action"] : "";

// ========== 公共辅助 ==========
function ierr($r, $prefix, $errno) {
    $msg = isset($r['data']['error']) ? $r['data']['error'] : ($r['error'] ? $r['error'] : 'HTTP ' . $r['http_code']);
    exit_notice($prefix . "：" . $msg, $errno, array('raw' => $r['raw'], 'http_code' => $r['http_code']));
}
function parse_item_id($rawId) {
    $parts = explode("_", $rawId);
    $id = intval(trim($parts[0]));
    return $id > 0 ? $id : 0;
}

// 根据 $ITEM_TO_CURRENCY 把 (itemId, count) 填到 give payload 里（货币走顶层字段，其他走 items）
function apply_item_to_give(&$payload, $itemId, $count) {
    global $ITEM_TO_CURRENCY;
    if ($count <= 0) return;
    if (isset($ITEM_TO_CURRENCY[$itemId])) {
        $cur = $ITEM_TO_CURRENCY[$itemId];           // 1=diamond / 2=silver / 6=gold
        $payload[$cur] = isset($payload[$cur]) ? intval($payload[$cur]) + $count : $count;
    } else {
        if (!isset($payload['items']) || !is_array($payload['items'])) $payload['items'] = array();
        $key = strval($itemId);
        $payload['items'][$key] = isset($payload['items'][$key]) ? intval($payload['items'][$key]) + $count : $count;
    }
}

// ========== 1. sendmoney 充值/发放（元宝走充值流程直接到包；银币/天衍令等走邮件附件）==========
//  chargetype 行为：
//    2 → 元宝：走 /api/internal/recharge（真实充值流程，算VIP/累计充值/首充，直接到包）
//    1 → 银币：走 /api/internal/mail/send 发邮件附件（物品 ID=2 银币，玩家领邮件时获得）
//    其他正整数 N → 当作物品 ID=N（例：1001=天衍令），走邮件附件
if ($action === "sendmoney") {
    global $CURRENCY_MAP, $RECHARGE_YUAN_PER_DIAMOND_UNIT, $title, $contents, $chargemax, $ITEM_TO_CURRENCY;

    $chargenum  = isset($_REQUEST["chargenum"])  ? intval($_REQUEST["chargenum"])  : 0;
    $chargetype = isset($_REQUEST["chargetype"]) ? strval($_REQUEST["chargetype"]) : "0";
    if (!$usr) exit_notice("请输入玩家账号", 1005);
    if ($chargenum <= 0) exit_notice("数量必须大于 0", 1006);
    if ($chargenum > $chargemax) exit_notice("数量超过上限 {$chargemax}", 1007);

    // ============ 分支一：元宝 chargetype=2：真实充值流程（不变）============
    if ($chargetype === '2') {
        $amountYuan = round($chargenum / $RECHARGE_YUAN_PER_DIAMOND_UNIT, 2);
        if ($amountYuan <= 0) exit_notice("按 1元=10钻 换算金额不足，请增加元宝数量", 1009);
        $orderId = 'GM_' . date('YmdHis') . '_' . substr(md5($usr . mt_rand(1000, 9999)), 0, 6);
        $payload = array(
            'orderId'           => $orderId,
            'userId'            => $usr,
            'amount'            => $amountYuan,
            'productId'         => '',
            'productName'       => 'GM充值元宝' . $chargenum,
            'channel'           => 'gm',
            'note'              => 'GM 后台充值 chargetype=' . $chargetype,
            'allowPendingOrder' => true,
            'idempotentSuccess' => true,
        );
        $r = lhs_internal_call('/api/internal/recharge', $payload);
        if (!$r['success']) ierr($r, '充值失败', 2001);

        $data = isset($r['data']['data']) ? $r['data']['data'] : array();
        $diamondOut = isset($data['diamond']) ? intval($data['diamond']) : $chargenum;
        $vipOut = isset($data['vipLevel']) ? intval($data['vipLevel']) : 0;

        // 说明：首次充值（totalRecharge 从 0→非 0）会触发双倍，因此实发可能是 chargenum*2
        $firstHint = '';
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
            )
        );
    }

    // ============ 分支二：银币（1）及其他物品 ID → 统一走邮件附件 ============
    // chargetype=1 → 真实附件 ID=2（银币）；其他正整数 N → ID=N（如 1001=天衍令）
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
        if (is_array($ITEM_TO_CURRENCY) && isset($ITEM_TO_CURRENCY[$itemId])) {
            $curName = $ITEM_TO_CURRENCY[$itemId];
            if ($curName === 'diamond') $itemName = '元宝';
            elseif ($curName === 'gold')   $itemName = '金币';
            elseif ($curName === 'silver') $itemName = '银币';
        }
    }

    $mailPayload = array(
        'userId'      => $usr,
        'title'       => $title,
        'content'     => $contents,
        'expireDays'  => 30,
        'attachments' => array(
            array('id' => $itemId, 'count' => $chargenum),
        ),
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

// ========== 2. senditem 发放物品（ID 1/2/6 自动转货币字段，其他转 items）==========
if ($action === "senditem") {
    global $ITEM_TO_CURRENCY, $itemmax, $title, $contents;

    if (!$usr) exit_notice("请输入玩家账号", 1005);
    $itemid   = isset($_REQUEST["itemid"])  ? $_REQUEST["itemid"]  : "";
    $itemnum  = isset($_REQUEST["itemnum"]) ? intval($_REQUEST["itemnum"]) : 0;
    if ($itemnum <= 0) exit_notice("物品数量必须大于 0", 1010);
    if ($itemnum > $itemmax) exit_notice("物品数量超过上限 {$itemmax}", 1011);

    $id = parse_item_id($itemid);
    if ($id <= 0) exit_notice("请选择正确的物品（{$itemid}）", 1012);

    $payload = array(
        'notifyMail' => isset($_REQUEST["notify_mail"]) ? boolval($_REQUEST["notify_mail"]) : true,
        'title'      => isset($_REQUEST["title"])       ? trim($_REQUEST["title"])           : $title,
        'content'    => isset($_REQUEST["content"])     ? trim($_REQUEST["content"])         : $contents,
    );
    apply_item_to_give($payload, $id, $itemnum);

    $r = lhs_internal_call('/api/internal/player/give/' . rawurlencode($usr), $payload);
    if (!$r['success']) ierr($r, '发放失败', 2003);

    // 给前端一个"这次实际给了什么"的可读描述
    $desc = array();
    foreach (array('diamond','gold','silver') as $c) {
        if (isset($payload[$c]) && intval($payload[$c]) > 0) $desc[] = "{$c} × {$payload[$c]}";
    }
    if (isset($payload['exp']) && intval($payload['exp']) > 0) $desc[] = "exp × {$payload['exp']}";
    if (!empty($payload['items'])) foreach ($payload['items'] as $k => $v) $desc[] = "物品ID{$k} × {$v}";
    exit_notice(
        "发放成功：" . implode('，', $desc) . " 已实时到账",
        0,
        array(
            'itemId'     => $id,
            'itemNum'    => $itemnum,
            'mappedCur'  => isset($ITEM_TO_CURRENCY[$id]) ? $ITEM_TO_CURRENCY[$id] : null,
            'currencies' => isset($r['data']['currencies']) ? $r['data']['currencies'] : null,
            'applied'    => isset($r['data']['applied'])    ? $r['data']['applied']    : null,
        )
    );
}

// ========== 3. sendmail 发送邮件（附件 ID 同样遵守 1/2/6 映射，标题/正文用 config.php $title/$contents）==========
// 单人邮件：必须带至少 1 个附件（禁止空附件/纯文字邮件，与全服邮件 sendmail_all 区分开，后者允许空）
if ($action === "sendmail") {
    global $title, $contents;

    if (!$usr) exit_notice("请输入玩家账号", 1005);
    $mailTitle   = $title;
    $mailContent = $contents;
    $attachId    = isset($_REQUEST["itemid"])      ? parse_item_id($_REQUEST["itemid"]) : 0;
    $attachNum   = isset($_REQUEST["itemnum"])     ? intval($_REQUEST["itemnum"])   : 0;
    $expireDays  = isset($_REQUEST["expire_days"]) ? intval($_REQUEST["expire_days"]) : 30;

    $payload = array(
        'userId'      => $usr,
        'title'       => $mailTitle,
        'content'     => $mailContent,
        'expireDays'  => max(1, $expireDays),
        'attachments' => array(),
    );

    $hasAttachmentsJson = isset($_REQUEST["attachments"]) && $_REQUEST["attachments"] !== '' && $_REQUEST["attachments"] !== null;
    if ($hasAttachmentsJson) {
        // 新版：前端传入的 attachments JSON 是权威来源（支持 player.txt 中所有物品，且已做 id/name 展示）
        // 为避免重复：当传入 attachments 时，完全忽略 itemid/itemnum 的旧版单附件构造
        $extra = json_decode($_REQUEST["attachments"], true);
        if (is_array($extra)) {
            $seenKeys = array();
            foreach ($extra as $a) {
                if (!is_array($a) || !isset($a['id']) || !isset($a['count'])) continue;
                $id = intval($a['id']);
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
        // 旧版兼容：只传 itemid + itemnum（只支持 1/2/6 那几个货币，为早期 gm.html 保留）
        if ($attachId > 0 && $attachNum > 0) {
            $payload['attachments'][] = array('id' => $attachId, 'count' => $attachNum);
        }
    }

    // 单人邮件强制校验：必须至少有 1 个有效附件（禁止空附件）
    if (empty($payload['attachments'])) {
        exit_notice("单人邮件必须至少包含 1 个有效附件（物品 ID>0 且数量≥1），不允许发送空邮件", 1025);
    }

    $r = lhs_internal_call('/api/internal/mail/send', $payload);
    if (!$r['success']) ierr($r, '邮件发送失败', 2004);
    $attCount = 0;
    foreach ($payload['attachments'] as $_a) $attCount += intval($_a['count']);
    exit_notice(
        "邮件发送成功，共 {$r['data']['total']} 封（含 " . count($payload['attachments']) . " 种附件，合计 {$attCount} 件）",
        0,
        array(
            'batchId'     => isset($r['data']['batchId']) ? $r['data']['batchId'] : null,
            'total'       => isset($r['data']['total'])       ? $r['data']['total']       : 0,
            'attachments' => $payload['attachments'],
        )
    );
}

// ========== 4. query_recharge 查询充值概览 ==========
if ($action === "query_recharge") {
    if (!$usr) exit_notice("请输入玩家账号", 1005);
    $r = lhs_internal_call('/api/internal/player/detail/' . rawurlencode($usr), null, 'GET');
    if (!$r['success']) {
        $err = isset($r['data']['error']) ? $r['data']['error'] : ($r['error'] ? $r['error'] : 'HTTP ' . $r['http_code']);
        if ($r['http_code'] == 404 || $err == 'PLAYER_NOT_FOUND') exit_notice("玩家不存在", 2005);
        ierr($r, '查询失败', 2005);
    }
    $p = $r['data']['player'];
    $info = isset($p['rechargeInfo']) ? $p['rechargeInfo'] : array('totalRecharge' => 0, 'vipLevel' => 0);
    exit_notice("查询成功", 0, array(
        'userId'        => $p['userId'],
        'playerId'      => isset($p['playerId'])      ? $p['playerId']      : null,
        'name'          => isset($p['name'])          ? $p['name']          : '',
        'level'         => isset($p['level'])         ? $p['level']         : 1,
        'vipLevel'      => isset($info['vipLevel'])   ? $info['vipLevel']   : 0,
        'totalRecharge' => isset($info['totalRecharge']) ? $info['totalRecharge'] : 0,
        'firstRecharge' => isset($info['firstRecharge']) ? $info['firstRecharge'] : 0,
        'currencies'    => isset($p['currencies'])    ? $p['currencies']    : array('diamond' => 0, 'gold' => 0, 'silver' => 0),
        'createTime'    => isset($p['createTime'])    ? $p['createTime']    : 0,
    ));
}

// ========== 5. query_player 玩家完整详情 ==========
if ($action === "query_player") {
    if (!$usr) exit_notice("请输入玩家账号", 1005);
    $r = lhs_internal_call('/api/internal/player/detail/' . rawurlencode($usr), null, 'GET');
    if (!$r['success']) {
        $err = isset($r['data']['error']) ? $r['data']['error'] : ($r['error'] ? $r['error'] : 'HTTP ' . $r['http_code']);
        if ($r['http_code'] == 404 || $err == 'PLAYER_NOT_FOUND') exit_notice("玩家不存在", 2006);
        ierr($r, '查询失败', 2006);
    }
    // 服务端真实返回直接透传（除了 _id / __v 等内部字段都在 player 里）
    exit_notice("查询成功", 0, $r['data']['player']);
}

// ========== 5.5 lookup_account 按 登录账号(accountId) 或 角色名(name) 查找玩家（返回 userId 给 #uid 回填）—— 仅支持这 2 种，禁止按 userId 查 ==========
if ($action === "lookup_account") {
    // 统一入口 key：优先级 key > uid
    $key = isset($_REQUEST["key"]) ? trim($_REQUEST["key"]) : '';
    if ($key === '' && $usr !== '') {
        // 兼容：用户直接把账号/角色名填到了 uid 输入框里的老用法
        // 注意：只要看起来像 u_Wk_ 开头的 userId 就拒绝（按需求必须走账号/角色名）
        if (stripos($usr, 'u_Wk_') === 0 || stripos($usr, 'u_wk_') === 0) {
            exit_notice('本查询仅支持 登录账号 / 角色名，不允许按 userId 查询', 1032);
        }
        $key = $usr;
    }
    if ($key === '') exit_notice('请输入要查询的 登录账号 或 角色名', 1031);
    $q_limit = isset($_REQUEST["limit"]) ? intval($_REQUEST["limit"]) : 0;

    // gmquery 内部做“先 accountId 精确 → 再 name 精确 → name 模糊”的合并，
    // 这样前端不用传任何类型，后端按规则自动覆盖两种匹配方式。
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

    $limit_per_phase = ($q_limit > 0) ? $q_limit : 80; // 每个阶段最多拿 80 条，足够 GM 看

    // 阶段 1：按 accountId 精确查（登录账号 → 最常用，高优先级）—— 不允许模糊
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
        exit_notice('没有找到符合条件的玩家（尝试：' . implode('；', $searchedDescription) . '）', 2006, array('roles' => array(), 'total' => 0));
    }

    // 按用户要求 limit 裁剪
    if ($q_limit > 0 && count($roles) > $q_limit) $roles = array_slice($roles, 0, $q_limit);
    $total = count($roles);

    if ($total === 1) {
        $one = $roles[0];
        exit_notice('找到 1 位玩家', 0, array(
            'total'     => 1,
            'hit'       => 1,
            'unique'    => true,
            'userId'    => isset($one['userId'])    ? $one['userId']    : '',
            'accountId' => isset($one['accountId']) ? $one['accountId'] : '',
            'name'      => isset($one['name'])      ? $one['name']      : '',
            'level'     => isset($one['level'])     ? $one['level']     : 1,
            'roles'     => $roles,
        ));
    }

    exit_notice("找到 {$total} 位玩家，请在列表中点击选择要操作的角色", 0, array(
        'total'  => $total,
        'hit'    => $total,
        'unique' => false,
        'roles'  => $roles,
    ));
}

// ========== 6. sendvip 授权（GM 生成 CDK 用户提示）==========
if ($action === "sendvip") {
    global $qu, $qus;

    $quArr = (isset($qus[$qu]) && is_array($qus[$qu])) ? $qus[$qu] : null;
    if (!$quArr || empty($quArr['DB_HOST']) || empty($quArr['DB_NAME'])) {
        exit_notice("当前选区未配置 MySQL 连接信息！", 1026);
    }

    $mysqlicdk = new mysqli(
        $quArr['DB_HOST'],
        $quArr['DB_USER'],
        $quArr['DB_PSWD'],
        $quArr['DB_NAME'],
        isset($quArr['DB_PORT']) ? intval($quArr['DB_PORT']) : 3306
    );
    if ($mysqlicdk->connect_errno) {
        exit_notice("CDK 数据库连接失败：" . $mysqlicdk->connect_error . "（请先配置好选区 MySQL，或确认 cdk 表已创建）", 1027);
    }
    $mysqlicdk->set_charset('utf8');

    $vip     = isset($_POST['vip'])     ? trim($_POST['vip'])     : (isset($_REQUEST['vip'])     ? trim($_REQUEST['vip'])     : '');
    $vippswd = isset($_POST['vippswd']) ? trim($_POST['vippswd']) : (isset($_REQUEST['vippswd']) ? trim($_REQUEST['vippswd']) : '');
    if ($vip === '') exit_notice('请选择权限等级', 1021);
    if (!$vippswd)  exit_notice('请输入后台密码', 1022);
    if (!$usr)      exit_notice('请输入玩家账号', 1005);

    $uidSql    = $mysqlicdk->real_escape_string($usr);
    $qidSql    = $mysqlicdk->real_escape_string($qu);
    $vipLvSql  = is_numeric($vip) ? intval($vip) : $mysqlicdk->real_escape_string($vip);
    $pswdSql   = $mysqlicdk->real_escape_string($vippswd);

    $ss = $mysqlicdk->query("SELECT lv FROM cdk WHERE uid = '{$uidSql}' AND qid = '{$qidSql}' LIMIT 1");
    $xlx = 0;
    if ($ss && ($row = $ss->fetch_array())) {
        $xlx = intval($row['lv']) + 100;
    }
    $lvVal = is_numeric($vip) ? intval($vip) : (is_array($vip) && isset($vip['lv']) ? intval($vip['lv']) : 0);
    $lx = $lvVal + 100;

    if ($xlx == $lx) exit_notice('此角色已是授权用户,无需再次开通！', 0);
    if ($xlx >  $lx) exit_notice('此角色已是授权用户,无需再次开通！', 0);

    if ($xlx < $lx) {
        $result = $mysqlicdk->query("DELETE FROM cdk WHERE uid = '{$uidSql}' AND qid = '{$qidSql}' LIMIT 1");
        if ($result) {
            $mysqlicdk->query("INSERT INTO cdk (cdk,lv,qid,uid,pass,status) VALUES ('gmsq','{$vipLvSql}','{$qidSql}','{$uidSql}','{$pswdSql}','1')");
        }
        exit_notice('角色授权成功！' . $usr . '！', 0, array('uid' => $usr, 'lv' => $lvVal, 'qid' => $qu));
    }
}

// ========== 7. sendmail_all 按服群发邮件（SERVER_ID 从 config.php 当前选区 $qus[$qu] 取，前端不传 scope/serverId）==========
if ($action === "sendmail_all") {
    global $title, $contents, $qus, $qu;

    $titleIn   = isset($_REQUEST["title"])      ? trim($_REQUEST["title"])      : "";
    $contentIn = isset($_REQUEST["content"])    ? trim($_REQUEST["content"])    : "";
    $expDays   = isset($_REQUEST["expire_days"]) ? intval($_REQUEST["expire_days"]) : 30;
    $attachRaw = isset($_REQUEST["attachments"]) ? $_REQUEST["attachments"] : "";

    if ($titleIn === "" || $contentIn === "") exit_notice("请填写邮件标题与正文", 1023);

    // SERVER_ID 直接从 config.php 当前选区 $qus[$qu] 取（一区=1001），前端不传也不允许覆盖
    $quName = trim($qus[$qu]['name']);
    $serverId = intval($qus[$qu]['SERVER_ID']);
    if ($serverId <= 0) exit_notice("当前选区（{$quName}）未配置 SERVER_ID，请在 config.php 第 " . (86 + $qu) . " 行 \$qus['{$qu}'] 中补 'SERVER_ID' => N", 1031);

    $attachments = array();
    if (is_string($attachRaw) && $attachRaw !== "") {
        $tmp = json_decode($attachRaw, true);
        if (is_array($tmp)) $attachments = $tmp;
    } elseif (is_array($attachRaw)) {
        $attachments = $attachRaw;
    }
    $safeAttach = array();
    foreach ($attachments as $a) {
        if (!is_array($a)) continue;
        $id = isset($a['id']) ? intval($a['id']) : 0;
        $cnt = isset($a['count']) ? intval($a['count']) : 0;
        if ($id > 0 && $cnt > 0) $safeAttach[] = array('id' => $id, 'count' => $cnt);
    }

    $payload = array(
        'scope'       => 'server',
        'serverId'    => $serverId,
        'title'       => $titleIn ? $titleIn : $title,
        'content'     => $contentIn ? $contentIn : $contents,
        'attachments' => $safeAttach,
        'expireDays'  => max(1, min(365, $expDays)),
    );

    $r = lhs_internal_call('/api/internal/mail/sendAll', $payload);
    if (!$r['success']) ierr($r, '群发邮件失败', 2007);

    $total   = isset($r['data']['total'])           ? intval($r['data']['total'])           : 0;
    $batchId = isset($r['data']['batchId'])         ? $r['data']['batchId']                  : '';
    $attCnt  = isset($r['data']['attachmentCount']) ? intval($r['data']['attachmentCount'])   : count($safeAttach);

    exit_notice(
        "群发邮件成功：{$quName}（SERVER_ID={$serverId}），共 {$total} 封，附件 {$attCnt} 种（batchId={$batchId}）",
        0,
        array(
            'scope'           => 'server',
            'serverId'        => $serverId,
            'quId'            => $qu,
            'quName'          => $quName,
            'batchId'         => $batchId,
            'total'           => $total,
            'attachmentCount' => $attCnt,
            'attachments'     => $safeAttach,
        )
    );
}

exit_notice("不支持的操作类型！", 1030);
