<?php
include '../config/config.php';
?>
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title><?php echo $gamename; ?>-CDK生成</title>
<link rel="icon" href="favicon.ico" type="image/ico">
<meta name="author" content="yinqi">
<link href="images/bootstrap.min.css" rel="stylesheet">
<link href="images/style.css" rel="stylesheet">
<script type="text/javascript" src="js/jquery.min.js"></script>
<script type="text/javascript" src="js/bootbox.min.js"></script>
<script type="text/javascript" src="js/bootstrap.min.js"></script>
<script type="text/javascript" src="js/bootstrap-select.min.js"></script>
<script type="text/javascript" src="js/defaults-zh_CN.js"></script>
<script src="../gm/static/layer/cannotcopy.js"></script>
<style type="text/css">
body{background-image:url("../gm/static/selectpage/bj.jpg");background-size:cover; }
</style>
<style>
.wrapper {
    position: relative;
}
.login {
    display: flex !important;
    min-height: 100vh;
    align-items: center !important;
    justify-content: center !important;
}
.login-center {
    background: #fff;
    min-width: 38.25rem;
    padding: 2.14286em 3.57143em;
    border-radius: 5px;
    margin: 2.85714em 0;
}
.login-header {
    margin-bottom: 1.5rem !important;
}
.login-center .has-feedback.feedback-left .form-control {
    padding-left: 38px;
    padding-right: 12px;
}
.login-center .has-feedback.feedback-left .form-control-feedback {
    left: 0;
    right: auto;
    width: 38px;
    height: 38px;
    line-height: 38px;
    z-index: 4;
    color: #dcdcdc;
}
.login-center .has-feedback.feedback-left.row .form-control-feedback {
    left: 15px;
}
</style>
<style>
	.lizi1{
		display:table;
		z-index:10;
		position:absolute;
		height:100%;
		width:100%;	
	}
	.login-center{
		background: rgba(255, 255, 255, 0.4);
	}
</style>
</head>
<body>
<!--结尾-->
<div class="lizi1">
  <div class="login">
    <div class="login-center">
      <div class="login-header text-center">
	  <h3><?php echo $gamename; ?>-CDK生成</h3>
	  </div>
          <form method="post" id="register-form" autocomplete="off" action="cdks.php" class="nice-validator n-default" novalidate>
            &nbsp;
			<div class="form-group has-feedback feedback-left">
			  <input type="text" class="form-control" id="sqm" name="sqm" placeholder="GM授权码" autocomplete="off">
            </div>
			<div class="form-group has-feedback feedback-left">
			  <input type="text" class="form-control" id="num" name="num" placeholder="生成数量" autocomplete="off">
            </div>
            <div class="form-group has-feedback feedback-left">
              <select id="lv" class="form-control" name="lv">
			  <option value="0">请选择类型</option>
			  <option value="1">无限充值</option>
			  <option value="2">充值+物品</option>
			  </select>
            </div>
            <div class="form-group has-feedback feedback-left">
			  <input class="btn btn-block btn-primary" type="submit" value="生成授权码">
			</div>
			<div class="form-group has-feedback feedback-left">
			  <input type="text" class="form-control" id="usr" name="usr" placeholder="请输入<?php echo $namecol; ?>" autocomplete="off">
			  </div>
			<div class="form-group has-feedback feedback-left">
                     <select id="qu" name="qu" class="form-control" title="请选择区服">
						<?php
						foreach($qus as $key=>$value){
							if($value['hidde']!=true){
								echo '<option value="'.$key.'">'.$value['name'].'</option>';
						}
						}
						?>
                        </select>
            </div>
            <div class="form-group has-feedback feedback-left">
            <select id="gnxz" class="form-control" name="gnxz">
                <option value="0">请选择功能</option>
				<option value="1">删除授权</option>
                <option value="5">查询玩家游戏账号/角色名(使用CDK查询)</option>
                <option value="6">查询玩家后台密码</option>
                <option value="7">查询所有未使用的激活码</option>
                <option value="8">查询所有已经授权的游戏账号/角色名及其CDKEY和后台密码</option>
                <option value="9">查询某游戏账号/角色名是否授权</option>
				<option value="10">手动授权(使用游戏账号/角色名授权)</option>
                </select>
            </div>
			<div class="form-group has-feedback feedback-left">
            <div class="form-group" id='xm' style="display:none;">
			<input type="text" class="form-control" onKeyUp="value=value.replace(/[\W]/g,'')" placeholder='请填写后台密码(仅支持数字和英文)' id="xmm" name="xmm" value="" autocomplete="off">
			</div>
            <div class="form-group">
			<input class="btn btn-block btn-primary" name='reg' id="1" value="提交" type="button" onclick= "test(this)">
			</div><br>
		<footer class="col-sm-12 text-center"><p class="m-b-0"><?php echo $gamename; ?> &copy; <?php echo $copyright; ?> </p>
		</footer>
        </div>
      </div>
    </div>
<script>
$('#gnxz').change(function(){
var gn = $(this).children('option:selected').val();
if(gn == 1 ){
document.getElementById('xm').style.display = "none";
}else if(gn == 5 ){
document.getElementById('xm').style.display = "none";
}else if(gn == 6 ){
document.getElementById('xm').style.display = "none";
}else if(gn == 7 ){
document.getElementById('xm').style.display = "none";
}else if(gn == 8 ){
document.getElementById('xm').style.display = "none";
}else if(gn == 9 ){
document.getElementById('xm').style.display = "none";
}else if(gn == 10 ){
document.getElementById('xm').style.display = "";
}
});
function api(){
	$.ajaxSetup({contentType: "application/x-www-form-urlencoded; charset=utf-8"});
	$.post("api.php", {
		qu:$("#qu").val(),
		sqm:$("#sqm").val(),
		usr:$("#usr").val(),
		lv:$("#lv").val(),
		xmm:$("#xmm").val(),
		gnxz:$("#gnxz").val()
	},function(data){ 
            $('input[name=reg]').attr('id','1');  
            $('input[name=reg]').attr('value','提交');
            bootbox.alert({message:data,title:"提示"});
	});
}
function test(obj){  
    var _status = obj.id;  
    if(_status != '1'){  
         $('input[name=reg]').attr('id','0'); 		 
         $('input[name=reg]').attr('value','正在提交...');
		 return false;  
    }else{  
         $('input[name=reg]').attr('id','0');  
         $('input[name=reg]').attr('value','正在提交...');
         api();   
    }    
};
document.onkeydown = function(event) {
	var target, code, tag;
	if (!event) {
		event = window.event; //针对ie浏览器
		target = event.srcElement;
		code = event.keyCode;
		if (code == 13) {
			tag = target.tagName;
			if (tag == "TEXTAREA") { return true; }
			else { return false; }
		}
	}else {
		target = event.target; //针对遵循w3c标准的浏览器，如Firefox
		code = event.keyCode;
		if (code == 13) {
			tag = target.tagName;
			if (tag == "INPUT") { return false; }
			else { return true; }
		}
	}
};
window.onload=function(){
    document.onkeydown=function(){
        var e=window.event||arguments[0];
        if(e.keyCode==123){
            return false;
        }else if((e.ctrlKey)&&(e.shiftKey)&&(e.keyCode==73)){
            return false;
        }
    };
    document.oncontextmenu=function(){
        return false;
    }
}
</script>
</body>
</html>