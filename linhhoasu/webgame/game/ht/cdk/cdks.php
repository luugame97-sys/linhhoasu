<?php
/* by 阿泽源码网 www.lyzwlkj.vip */
error_reporting(0);
$sqm = $_POST["sqm"];
$num = $_POST["num"];
$lv = $_POST["lv"];
include "../config/config.php";

$zame = "vip_1_";
$lv == 0 && die("<script>alert('请选择类型');window.history.back(-1); </script>");
$lv == 2 && ($zame = "vip_2_");
$sqm != $gmcode && die("<script>alert('授权码错误');window.history.back(-1); </script>");
$num > 100 && die("<script>alert('单次最多生成100条');window.history.back(-1); </script>");

$num == '' && ($num = 1);
$yzf = new mysqli($PZ["DB_HOST"], $PZ["DB_USER"], $PZ["DB_PWD"], $PZ["DB_NAME"], $PZ["DB_PORT"]);

if (!mysqli_connect_errno()) {
    if (!$yzf->connect_error) {
        if ($yzf->set_charset("utf8")) {
            $i = 1;
            while ($i <= $num) {
                $cdk = cdkey("LengYuZe");
                $txt .= $cdk . "\r\n";
                if ($yzf->query("INSERT INTO cdk (cdk,lv) VALUES ('{$cdk}','{$lv}')")) {
                    $i++;
                } else {
                    die("<script>alert('生成失败,请查看数据库连接是否正常');window.history.back(-1);</script>");
                }
            }
            $yzf->close();
        } else {
            printf("设置数据库编码utf8错误: %s\n", $yzf->error);
            exit;
        }
    } else {
        exit("数据库连接失败,请检查数据库密码是否正确!");
    }
} else {
    $db = new mysqli($PZ["DB_HOST"], $PZ["DB_USER"], $PZ["DB_PWD"], '', $PZ["DB_PORT"]);
$db->autocommit(true);

if (!mysqli_connect_errno()) {
    $db->set_charset("utf8");

    // 创建数据库（如果没有的话）
    $db->query("CREATE DATABASE IF NOT EXISTS {$PZ['DB_NAME']} CHARACTER SET utf8 COLLATE utf8_general_ci");

    // 选择数据库
    $db->select_db($PZ['DB_NAME']);

    // 创建表
    $rs = $db->query("CREATE TABLE IF NOT EXISTS cdk (
        id int(11) NOT NULL AUTO_INCREMENT,
        `cdk` varchar(32) NOT NULL,
        `lv` tinyint(4) DEFAULT NULL,
        `qid` int(8) DEFAULT NULL,
        `uid` varchar(32) DEFAULT NULL,
        `pass` varchar(32) DEFAULT NULL,
        `status` tinyint(4) DEFAULT '0',
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;");

    if ($rs) {
        exit("<script>alert('CDKEY表创建成功');window.location.reload();</script>");
    } else {
        exit("表创建失败！错误代码：" . $db->error);
    }

    $db->close();
} else {
    exit("数据库连接错误！错误代码：" . mysqli_connect_error());
}

}

$ts = time() . ".txt";
file_put_contents("cdks/" . $zame . $ts, $txt);
Header("Content-Type: application/octet-stream");
Header("Accept-Ranges: bytes");
Header("Content-Disposition: attachment; filename=" . $zame . $ts);
die($txt);

function cdkey($namespace = null) {
    static $guid = '';
    $uid = uniqid('', true);
    $data = $namespace;
    $data .= $_SERVER["REQUEST_TIME"];
    $data .= $_SERVER["HTTP_USER_AGENT"];
    $data .= $_SERVER["SERVER_ADDR"];
    $data .= $_SERVER["SERVER_PORT"];
    $data .= $_SERVER["REMOTE_ADDR"];
    $data .= $_SERVER["REMOTE_PORT"];
    $hash = strtoupper(substr(md5($uid . $data), 8, 16));
    $guid = substr($hash, 0, 4) . "-" . substr($hash, 4, 4) . "-" . substr($hash, 8, 4) . "-" . substr($hash, 12, 4);
    return $guid;
}
