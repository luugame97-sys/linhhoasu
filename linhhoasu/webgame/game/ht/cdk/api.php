<?php
// 阿泽源码网 www.lyzwlkj.vip
//error_reporting(0);
include "../config/config.php";
$quid = isset($_POST["qu"]) ? intval($_POST["qu"]) : 0;
$sqm = isset($_POST["sqm"]) ? trim($_POST["sqm"]) : '';
$usr = isset($_POST["usr"]) ? trim($_POST["usr"]) : '';
$gnxz = isset($_POST["gnxz"]) ? intval($_POST["gnxz"]) : 0;

// 清理输入
$sqm = str_replace(array(" ", "%"), '', $sqm);
$usr = str_replace(array(" ", "%"), '', $usr);

// 验证参数
if ($quid < 1) die("请选择大区");
if ($usr == '') die("请输入游戏账号/角色名");
if ($sqm == '') die("请输入GM授权码");
if ($gnxz == 0) die("请选择功能");
if ($sqm != $gmcode) die("GM授权码错误");

// 验证UID格式，防止注入
if (!preg_match('/^[a-zA-Z0-9_-]+$/', $usr)) {
    die("游戏账号/角色名格式不正确");
}
if (strlen($usr) > 50) {
    die("游戏账号/角色名长度不能超过50个字符");
}

$mysqlcdk = mysqli_connect($PZ["DB_HOST"], $PZ["DB_USER"], $PZ["DB_PWD"], $PZ["DB_NAME"], $PZ["DB_PORT"]) or die("数据库连接错误!!!");
$mysqlcdk->query("set names utf8");


switch ($gnxz) {
    case 1: 
        // 使用预处理语句防止SQL注入
        $stmt = $mysqlcdk->prepare("DELETE FROM cdk WHERE uid = ? AND qid = ?");
        if (!$stmt) {
            die("删除失败！SQL错误: " . $mysqlcdk->error);
        }
        $stmt->bind_param('si', $usr, $quid);
        $sql = $stmt->execute();
        $stmt->close();
        if ($sql) {
            die("游戏账号/角色名：" . htmlspecialchars($usr, ENT_QUOTES, 'UTF-8') . " 授权删除成功！");
        } else {
            die("删除失败！");
        }
        break;

    case 5: 
        // 使用预处理语句防止SQL注入
        $stmt = $mysqlcdk->prepare("SELECT uid, qid, lv, pass, status FROM cdk WHERE uid = ? LIMIT 1");
        if (!$stmt) {
            die("查询失败.请联系管理员");
        }
        $stmt->bind_param('s', $usr);
        $stmt->execute();
        $result = $stmt->get_result();
        $stmt->close();
        $rows = $result->num_rows;
        if ($rows) {
            $row = $result->fetch_assoc();
            echo "<table class='table table-bordered'>";
            echo "<tr><th>UID</th><th>区服</th><th>权限等级</th><th>后台密码</th><th>状态</th></tr>";
            echo "<tr>";
            echo "<td>" . htmlspecialchars($row['uid'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . htmlspecialchars($row['qid'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . htmlspecialchars($row['lv'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . htmlspecialchars($row['pass'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . ($row['status'] == 1 ? '已授权' : '未授权') . "</td>";
            echo "</tr>";
            echo "</table>";
        } else {
            echo "该游戏账号/角色名未授权。";
        }
        break;

    case 6: // 查询玩家后台密码
        // 使用预处理语句防止SQL注入
        $stmt = $mysqlcdk->prepare("SELECT pass FROM cdk WHERE uid = ? LIMIT 1");
        if (!$stmt) {
            die("查询失败.请联系管理员");
        }
        $stmt->bind_param('s', $usr);
        $stmt->execute();
        $result = $stmt->get_result();
        $stmt->close();
        $rows = $result->num_rows;
        if ($rows) {
            $row = $result->fetch_assoc();
            echo "游戏账号/角色名 " . htmlspecialchars($usr, ENT_QUOTES, 'UTF-8') . " 的后台密码是：" . htmlspecialchars($row['pass'], ENT_QUOTES, 'UTF-8');
        } else {
            echo "该游戏账号/角色名未授权。";
        }
        break;

case 7: // 查询所有未使用的激活码
    $stmt = $mysqlcdk->prepare("SELECT cdk, lv, qid, uid, status FROM cdk WHERE (status = 0 OR uid IS NULL OR uid = '')");
    if (!$stmt) {
        die("预处理失败: " . $mysqlcdk->error);
    }
    
    if (!$stmt->execute()) {
        die("查询执行失败: " . $stmt->error);
    }

    $result = $stmt->get_result();
    $rows = $result->num_rows;

    if ($rows) {
        echo "<h4>找到 {$rows} 个未使用的激活码：</h4>";
        echo "<table class='table table-bordered'>";
        echo "<tr><th>CDK</th><th>权限等级</th><th>区服</th><th>UID</th><th>状态</th></tr>";
        while ($row = $result->fetch_assoc()) {
            echo "<tr>";
            echo "<td>" . htmlspecialchars($row['cdk'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . htmlspecialchars($row['lv'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . htmlspecialchars($row['qid'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . (htmlspecialchars($row['uid'], ENT_QUOTES, 'UTF-8') ?: '未使用') . "</td>";
            echo "<td>" . ($row['status'] == 1 ? '已使用' : '未使用') . "</td>";
            echo "</tr>";
        }
        echo "</table>";
    } else {
        echo "没有未使用的激活码。";
    }
    $stmt->close();
    break;

case 8: // 查询所有已经授权的UID及其CDKEY和后台密码
    $stmt = $mysqlcdk->prepare("SELECT uid, cdk, lv, qid, pass, status FROM cdk WHERE (status = 1 OR (uid IS NOT NULL AND uid != ''))");
    if (!$stmt) {
        die("预处理失败: " . $mysqlcdk->error);
    }

    if (!$stmt->execute()) {
        die("查询执行失败: " . $stmt->error);
    }

    $result = $stmt->get_result();
    $rows = $result->num_rows;

    if ($rows) {
        echo "<h4>找到 {$rows} 个已授权的游戏账号/角色名：</h4>";
        echo "<table class='table table-bordered'>";
        echo "<tr><th>UID</th><th>CDK</th><th>权限等级</th><th>区服</th><th>后台密码</th><th>状态</th></tr>";
        while ($row = $result->fetch_assoc()) {
            echo "<tr>";
            echo "<td>" . htmlspecialchars($row['uid'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . htmlspecialchars($row['cdk'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . htmlspecialchars($row['lv'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . htmlspecialchars($row['qid'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . htmlspecialchars($row['pass'], ENT_QUOTES, 'UTF-8') . "</td>";
            echo "<td>" . ($row['status'] == 1 ? '已授权' : '未授权') . "</td>";
            echo "</tr>";
        }
        echo "</table>";
    } else {
        echo "没有已授权的游戏账号/角色名。";
    }
    $stmt->close();
    break;

    case 9: // 查询某账号是否授权
        // 使用预处理语句防止SQL注入
        $stmt = $mysqlcdk->prepare("SELECT uid, qid, lv, pass, status FROM cdk WHERE uid = ? AND qid = ? LIMIT 1");
        if (!$stmt) {
            die("查询失败.请联系管理员");
        }
        $stmt->bind_param('si', $usr, $quid);
        $stmt->execute();
        $result = $stmt->get_result();
        $stmt->close();
        $rows = $result->num_rows;
        if ($rows) {
            $row = $result->fetch_assoc();
            echo "游戏账号/角色名 " . htmlspecialchars($usr, ENT_QUOTES, 'UTF-8') . " 在区服 " . htmlspecialchars($quid, ENT_QUOTES, 'UTF-8') . " 已授权！<br>";
            echo "权限等级：" . htmlspecialchars($row['lv'], ENT_QUOTES, 'UTF-8') . "<br>";
            echo "后台密码：" . htmlspecialchars($row['pass'], ENT_QUOTES, 'UTF-8') . "<br>";
            echo "状态：" . ($row['status'] == 1 ? '已授权' : '未授权');
        } else {
            echo "游戏账号/角色名 " . htmlspecialchars($usr, ENT_QUOTES, 'UTF-8') . " 在区服 " . htmlspecialchars($quid, ENT_QUOTES, 'UTF-8') . " 未授权。";
        }
        break;

    case 10: // 手动授权(使用游戏账号/角色名授权)
        $lv = intval($_POST["lv"]);
        $xmm = trim($_POST["xmm"]);
        if ($xmm == '') die("请输入后台密码");
        if ($lv == 0) die("请选择权限类型");
        
        // 验证参数格式
        if (!preg_match('/^[a-zA-Z0-9_-]+$/', $usr)) {
            die("UID格式不正确");
        }
        if (strlen($usr) > 50) {
            die("UID长度不能超过50个字符");
        }
        if (strlen($xmm) > 100) {
            die("后台密码长度不能超过100个字符");
        }
        
        // 检查是否已经授权（使用预处理语句）
        $stmt = $mysqlcdk->prepare("SELECT * FROM cdk WHERE uid = ? AND qid = ? LIMIT 1");
        if (!$stmt) {
            die("查询失败.请联系管理员");
        }
        $stmt->bind_param('si', $usr, $quid);
        $stmt->execute();
        $result = $stmt->get_result();
        $stmt->close();
        if ($result->num_rows > 0) {
            die("该游戏账号/角色名在此区服已经授权！");
        }
        
        // 生成唯一的CDK
        $cdk = 'AUTH' . date('YmdHis') . rand(1000, 9999);
        
        // 插入CDK记录（使用预处理语句）
        $stmt = $mysqlcdk->prepare("INSERT INTO cdk (cdk, lv, qid, uid, pass, status) VALUES (?, ?, ?, ?, ?, '1')");
        if (!$stmt) {
            die("授权失败.请联系管理员: " . $mysqlcdk->error);
        }
        $stmt->bind_param('siiss', $cdk, $lv, $quid, $usr, $xmm);
        if ($stmt->execute()) {
            $stmt->close();
            die("游戏账号/角色名授权成功！<br>UID：" . htmlspecialchars($usr, ENT_QUOTES, 'UTF-8') . "<br>区服：" . htmlspecialchars($quid, ENT_QUOTES, 'UTF-8') . "<br>权限等级：" . htmlspecialchars($lv, ENT_QUOTES, 'UTF-8') . "<br>后台密码：" . htmlspecialchars($xmm, ENT_QUOTES, 'UTF-8') . "<br>请妥善保存您的信息！");
        } else {
            $error = $stmt->error;
            $stmt->close();
            die("授权失败.请联系管理员: " . $error);
        }
        break;

    default:
        die("无效功能码");
}
?>