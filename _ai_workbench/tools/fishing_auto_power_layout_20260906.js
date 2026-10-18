function(){
 var self=this;
 var card=this.autoPowerFishCard=new U.Group;card.x=0;card.y=777;card.width=592;card.height=126;this.baseGroup.addChild(card);
 var fill=new U.Image('common_box_2');fill.scale9Grid=new egret.Rectangle(25,25,0,0);fill.x=12;fill.y=10;fill.width=568;fill.height=106;fill.alpha=.5;fill.tint=13420478;card.addChild(fill);
 var border=new U.Image('common_line_4');border.scale9Grid=new egret.Rectangle(24,24,0,0);border.width=592;border.height=126;border.tint=14004639;card.addChild(border);
 var box=this.autoPowerFishBox=new U.CheckBox;box.skinName='CheckBox1Skin';box.scaleX=box.scaleY=.8;box.x=28;box.y=18;card.addChild(box);
 var label=this.autoPowerFishLab=new U.Label;label.fontFamily='Microsoft YaHei';label.text='Tự trang bị cá mạnh, bán cá yếu';label.bold=true;label.size=22;label.textColor=5067090;label.x=82;label.y=27;label.width=480;card.addChild(label);
 var note=this.autoPowerFishNote=new U.Label;note.fontFamily='Microsoft YaHei';note.text='Giữ cá khóa, có kỹ năng hoặc ngang lực chiến.\nƯu tiên lựa chọn này thay cho bộ lọc dừng / nộp đơn.';note.size=18;note.textColor=7303023;note.width=528;note.x=28;note.y=72;note.lineSpacing=4;card.addChild(note);
 this.startButton.y=924;this.commonwin.height=1230;this.commonwin.verticalCenter=0;this.baseGroup.height=1000;
 box.addEventListener(egret.Event.CHANGE,function(){U9.autoConfig.fishing_autoEquipPower=!!box.selected;self.updateViewUI();},this);
}
