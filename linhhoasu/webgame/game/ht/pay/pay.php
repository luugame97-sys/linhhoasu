<?php
/*
 * 阿泽源码网 www.lyzwlkj.vip
*/
// 引入配置文件
include "../config/config.php";

// 1. 获取并初步处理输入
$usr = isset($_POST["usr"]) ? $_POST["usr"] : "";
$quid = isset($_POST["qu"]) ? intval($_POST["qu"]) : 0;
$cdk = isset($_POST["cdk"]) ? $_POST["cdk"] : "";
$pas = isset($_POST["pas"]) ? $_POST["pas"] : "";

// 2. 数据清洗 (去除空格和百分号)
$usr = str_replace([" ", "%"], "", $usr);
$cdk = str_replace([" ", "%"], "", $cdk);
$pas = str_replace([" ", "%"], "", $pas);

// 3. 基础验证
if ($cdk == "") die("请输入CDKEY");
if (!$quid) die("请先选区");
if ($usr == "") die("请输入游戏账号/角色名");
if ($pas == "") die("请输入后台密码");

// 4. 数据库连接
$mysqlcdk = mysqli_connect(
    $PZ["DB_HOST"],
    $PZ["DB_USER"],
    $PZ["DB_PWD"],
    $PZ["DB_NAME"],
    $PZ["DB_PORT"]
) or die("数据库连接错误!!!");

$mysqlcdk->query("set names utf8");

// 查询 CDK 信息 (使用预处理防止注入)
$stmt_check_cdk = $mysqlcdk->prepare("SELECT * FROM cdk WHERE cdk = ? LIMIT 1");
$stmt_check_cdk->bind_param("s", $cdk); // "s" 代表字符串类型
$stmt_check_cdk->execute();
$result_cdk = $stmt_check_cdk->get_result();
$xxx = $result_cdk->fetch_assoc();
$stmt_check_cdk->close();

// 验证 CDK 有效性
if (!$xxx || $xxx["cdk"] == "") {
    die("无此授权卡");
}
if ($xxx["status"] != 0) {
    die("此授权卡已被使用");
}

// 计算目标等级
$lx = $xxx["lv"] + 100;

// 查询当前账号状态 (使用预处理)
$stmt_check_user = $mysqlcdk->prepare("SELECT * FROM cdk WHERE uid = ? AND qid = ? LIMIT 1");
$stmt_check_user->bind_param("si", $usr, $quid); // "s"=字符串, "i"=整数
$stmt_check_user->execute();
$result_user = $stmt_check_user->get_result();
$ss = $result_user->fetch_assoc();
$stmt_check_user->close();

$xlx = $ss["lv"] + 100;

// 逻辑处理与更新
if ($xlx == 100) {
    // 情况1: 账号不存在，进行新授权
    // 使用预处理执行 UPDATE (这里实际上是插入逻辑的变体)
    $stmt_update = $mysqlcdk->prepare("UPDATE cdk SET status = 1, uid = ?, pass = ?, qid = ? WHERE cdk = ?");
    $stmt_update->bind_param("ssis", $usr, $pas, $quid, $cdk);
    
    if ($stmt_update->execute()) {
        die("游戏账号/角色名授权成功！请妥善保管您设置的后台密码");
    } else {
        die("授权失败.请联系管理员");
    }
    $stmt_update->close();

} else {
    // 情况2: 账号已存在，进行等级比对
    if ($xlx == $lx) {
        die("此游戏账号/角色名已是授权用户,无需再次开通");
    } elseif ($xlx < $lx) {
        // 等级不足，先删除旧记录，再更新
        $stmt_del = $mysqlcdk->prepare("DELETE FROM cdk WHERE uid = ? AND qid = ? LIMIT 1");
        $stmt_del->bind_param("si", $usr, $quid);
        $stmt_del->execute();
        $stmt_del->close();

        $stmt_upgrade = $mysqlcdk->prepare("UPDATE cdk SET status = 1, uid = ?, pass = ?, qid = ? WHERE cdk = ?");
        $stmt_upgrade->bind_param("ssis", $usr, $pas, $quid, $cdk);
        
        if ($stmt_upgrade->execute()) {
            die("游戏账号/角色名授权成功！请妥善保管您设置的后台密码");
        } else {
            die("授权失败.请联系管理员");
        }
        $stmt_upgrade->close();
        
    } else {
        // xlx > lx
        die("此游戏账号/角色名已是授权用户,无需再次开通");
    }
}

// 关闭连接
$mysqlcdk->close();
exit();
?>