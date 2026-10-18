<?php
include '../config/config.php';
?>
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title><?php echo $gamename; ?>-自助授权</title>
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
	  <h3><?php echo $gamename; ?>-激活</h3>
	  </div>
          <form method="post" id="register-form" autocomplete="off" action="#" class="nice-validator n-default" novalidate>
            &nbsp;
			<div class="alert alert-danger">
                       <strong style="color:red">温馨提示:</strong><br>
						注意是游戏账号/角色名！<br>
					 </div>
			<div class="form-group has-feedback feedback-left">
			  <input type="text" class="form-control" id="cdk" name="cdk" placeholder="请输入CDKEY" autocomplete="off">
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
			  <input type="text" class="form-control" id="usr" name="usr" placeholder="请输入<?php echo $namecol; ?>" autocomplete="off">
            </div>
			<div class="form-group has-feedback feedback-left">
			  <input type="text" class="form-control" id="pass" name="pass" onKeyUp="value=value.replace(/[\W]/g,'')" placeholder="请填写后台密码(仅支持数字和英文)" autocomplete="off">
            </div>
            <div class="form-group">
			<input class="btn btn-block btn-primary" name='reg' id="1" value="提交授权" type="button" onclick= "test(this)">
			<input class="btn btn-block btn-primary" value="前往后台" type="button" onclick="window.location.href='../gm'">
			</div><br>
		<footer class="col-sm-12 text-center"><p class="m-b-0">　<?php echo $gamename; ?> &copy; <?php echo $copyright; ?>　　　　</p>
		</footer>
        </div>
      </div>
    </div>
<script>
function api(){
	$.ajaxSetup({contentType: "application/x-www-form-urlencoded; charset=utf-8"});
	$.post("pay.php", {
		usr:$("#usr").val(),
		pas:$("#pass").val(),
		cdk:$("#cdk").val(),
		qu:$("#qu").val()
	},function(data){ 
            $('input[name=reg]').attr('id','1');  
            $('input[name=reg]').attr('value','提交授权');
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