import re
from pathlib import Path

ROOT = Path(r"I:\Linhhoasu\server\server")
SOURCE = ROOT / "_ai_workbench" / "temp" / "gmitem_remote.txt"
PLAYER = ROOT / "_ai_workbench" / "temp" / "player_translated.txt"
OUTPUT = ROOT / "_ai_workbench" / "temp" / "gmitem_vi.txt"
HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")

REPLACE = [
    ("钻石（元宝）", "Nguyên bảo"), ("金币（加速符）", "Bùa tăng tốc"), ("银币", "Bạc"),
    ("星星积分", "Điểm Tinh Tú"), ("百绘霓裳积分", "Điểm Bách Hội Nghê Thường"),
    ("初级星莲", "Tinh Liên sơ cấp"), ("封神挑战券", "Vé thách thức Phong Thần"),
    ("灵髓", "Tủy linh"), ("玉露琼浆", "Ngọc lộ quỳnh tương"), ("契合石", "Đá Khế Hợp"),
    ("上品木灵果", "Linh quả mộc thượng phẩm"), ("史诗", "Sử thi"), ("稀有", "Hiếm"),
    ("精良", "Tinh xảo"), ("优秀", "Ưu tú"), ("卓越", "Trác Việt"), ("传说", "Truyền thuyết"),
    ("神话", "Thần thoại"), ("随机", "Ngẫu nhiên"), ("自选", "Tự chọn"), ("碎片", "mảnh"),
    ("建筑", "công trình"), ("海珍秘宝", "bí bảo Hải Trân"), ("青铜秘宝", "bí bảo Đồng Xanh"),
    ("妖灵", "yêu linh"), ("武魂", "võ hồn"), ("血脉", "huyết mạch"), ("神兵", "thần binh"),
    ("坐骑", "tọa kỵ"), ("灵兽", "linh thú"), ("时装", "thời trang"), ("称号", "danh hiệu"),
    ("头像", "avatar"), ("动态", "động"), ("气泡", "bong bóng"), ("武器", "vũ khí"),
    ("头饰", "mũ trang sức"), ("冠", "mũ"), ("袍", "áo bào"), ("裳", "váy"), ("甲", "giáp"),
    ("外袍", "ngoại bào"), ("手", "găng tay"), ("靴", "giày"), ("剑", "kiếm"), ("戟", "kích"),
    ("丹方", "công thức đan"), ("丹", "đan"), ("内丹", "nội đan"), ("精血", "tinh huyết"),
    ("速度", "tốc độ"), ("攻击", "tấn công"), ("防御", "phòng thủ"), ("元素韧性", "kháng nguyên tố"),
    ("阶", " tầng"), ("级", " cấp"), ("品", " phẩm"), ("第", "bậc "), ("碎", "mảnh"),
    ("·叁", "·III"), ("·贰", "·II"), ("·壹", "·I"), ("凡", "Phàm"), ("橙", "Cam"),
    ("红", "Đỏ"), ("绿", "Lục"), ("蓝", "Lam"), ("紫", "Tím"), ("光系", "hệ Quang"),
    ("冰系", "hệ Băng"), ("土系", "hệ Thổ"), ("暗系", "hệ Ám"), ("火系", "hệ Hỏa"),
    ("水系", "hệ Thủy"), ("雷系", "hệ Lôi"), ("电系", "hệ Điện"), ("毒系", "hệ Độc"),
    ("风系", "hệ Phong"), ("真羽", "Chân vũ"), ("灵蟾", "Linh Thiềm"), ("灵龙", "Linh Long"),
    ("苍灵蟾", "Thương Linh Thiềm"), ("奔雷狂兔", "Cuồng Thố Bôn Lôi"), ("中秋", "Trung Thu"),
    ("初始", "Khởi đầu"), ("炎祸斗", "Viêm Họa Đẩu"), ("穷奇", "Cùng Kỳ"), ("青水云间", "Thanh Thủy Vân Gian"),
    ("泡沫幻影", "Ảo ảnh bọt biển"), ("绿茵驰影", "Ảnh phi nhanh Lục Nhân"), ("砂魔兔", "Thỏ Ma Sa Mạc"),
    ("泡影流光", "Bóng nước lưu quang"), ("航海仙龟", "Tiên Quy Hàng Hải"), ("鬼鳍", "Quỷ Kỳ"),
    ("乾坤镜", "Kính Càn Khôn"), ("琼浆", "quỳnh tương"), ("凝魂", "Ngưng Hồn"), ("海王巨兽", "Cự thú Hải Vương"),
    ("粗布手套", "Găng tay vải thô"), ("素云靴", "Giày Vân Tố"), ("清风拳法", "Quyền pháp Thanh Phong"),
    ("吞天饕餮", "Thao Thiết Thôn Thiên"), ("玉辰飞玄", "Ngọc Thần Phi Huyền"), ("神冰龙龟", "Long Quy Thần Băng"),
    ("天衍宝钞", "Bảo sao Thiên Diễn"), ("爱心鼻", "Mũi trái tim"), ("星星鼻", "Mũi ngôi sao"),
    ("船锚", "Mỏ neo"), ("玉筷", "Đũa ngọc"), ("玉锁", "Khóa ngọc"), ("莲蓬", "Đài sen"),
    ("虹纹陀螺", "Con quay vân cầu vồng"), ("烤鱿鱼", "Mực nướng"), ("竹佩刀", "Đao tre"),
    ("山笔搁", "Giá bút Sơn"), ("踏云履", "Giày Đạp Vân"), ("缠纹陶笛", "Tiêu gốm vân quấn"),
    ("金缕连环", "Liên hoàn kim tuyến"), ("锦甲年画", "Niên họa cẩm giáp"), ("皮纹福坠", "Mặt phúc vân da"),
    ("绿圆枕", "Gối tròn xanh"), ("竹窗屏", "Bình phong cửa sổ tre"), ("缺口刀", "Đao sứt mẻ"),
    ("紫霞仙靴", "Giày Tử Hà Tiên"), ("贡品参药", "Nhân dược cống phẩm"), ("九霄霜宸翎", "Lông Sương Thần Cửu Tiêu"),
    ("金背皮影戏", "Múa bóng da lưng vàng"), ("落蕊金桃绢", "Lụa đào vàng Lạc Nhụy"), ("镇墟鎏玉鳌", "Ngao ngọc lưu ly Trấn Hư"),
    ("龛灯", "Đèn khám"), ("晾衣", "Phơi đồ"), ("三猪鼎立", "Tam trư đỉnh lập"), ("黄狮兄", "Hoàng Sư huynh"),
    ("白狮妹", "Bạch Sư muội"), ("阳光番茄", "Cà chua ánh dương"), ("航海飞船", "Phi thuyền Hàng Hải"),
    ("炎烤台", "Bệ nướng Viêm"), ("逐浪板", "Ván đuổi sóng"), ("挂灯", "Đèn treo"), ("石景墙", "Tường cảnh đá"),
    ("包子台", "Bệ Baozi"), ("将遇良牌", "Bài Tướng Ngộ Lương"), ("露了尾巴", "Lộ đuôi"), ("浪鳄非洲", "Cá sấu sóng châu Phi"),
    ("案牍劳形", "Án độc lao hình"), ("清溪梦岚", "Thanh Khê Mộng Lam"), ("冰封御座", "Ngai băng phong"),
    ("万寿无疆", "Vạn thọ vô cương"), ("航线线索", "Manh mối tuyến hàng hải"), ("巨格占位符", "Ký hiệu ô lớn"),
    ("至宝观藏符", "Phù Quan Tàng Chí Bảo"), ("均格符", "Phù ô đều"), ("焱骨号", "Hạm Viêm Cốt"),
    ("乱磁域", "Vực Loạn Từ"), ("永夜湾", "Vịnh Vĩnh Dạ"), ("惊雷峡", "Hẻm Kinh Lôi"), ("月牙谷", "Thung lũng Nguyệt Nha"),
    ("幽冥御使", "Ngự sứ U Minh"), ("月牙咒师", "Chú sư Nguyệt Nha"), ("炽焰天尊", "Thiên Tôn Xích Diễm"),
    ("转生因陀", "Nhân Đà chuyển sinh"), ("黑崎斩魂", "Hắc Kỳ Trảm Hồn"), ("盛唐剑侠", "Kiếm hiệp Thịnh Đường"),
    ("白鹰临世", "Bạch Ưng Lâm Thế"), ("赤霄煌霆", "Xích Tiêu Hoàng Đình"), ("灵刃守护者", "Hộ vệ Linh Nhận"),
    ("星颅丹行", "Đan Hành Tinh Lô"), ("五行悬镜", "Kính Huyền Ngũ Hành"), ("银绯双华", "Ngân Phi Song Hoa"),
    ("海上遗珠", "Minh châu Hải Thượng"), ("翠芽逐野", "Thúy Nha Trục Dã"), ("作妖神剑", "Thần kiếm Tác Yêu"),
    ("碰瓷道袍", "Đạo bào Bính Từ"), ("暗剑难防", "Ám kiếm khó phòng"), ("撞鬼", "Đụng quỷ"),
]

def load_map(path):
    result = {}
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if ';' in line:
            key, value = line.split(';', 1)
            result[key.strip()] = value.strip()
    return result

cn = load_map(SOURCE)
player = load_map(PLAYER)
out = []
for item_id, original in cn.items():
    name = player.get(item_id, original)
    if item_id == '1': name = 'Nguyên bảo'
    elif item_id == '2': name = 'Bạc'
    elif item_id == '6': name = 'Bùa tăng tốc'
    elif item_id == '24': name = 'Trứng linh thú ưu tú'
    elif item_id == '100095': name = 'Hồn ngọc cấp 5 ngẫu nhiên'
    elif item_id == '90005': name = 'Tọa kỵ truyền thuyết tự chọn'
    elif item_id == '90015': name = 'Linh thú sử thi tự chọn'
    elif item_id == '90043': name = 'Thần binh truyền thuyết tự chọn'
    elif item_id == '29040': name = 'Thời trang Hằng Hải Thời Đại'
    elif item_id == '11274': name = 'Danh hiệu Linh Họa Sư 1 năm'
    for old, new in REPLACE:
        name = name.replace(old, new)
    name = name.replace('（', ' (').replace('）', ')')
    name = re.sub(r"\s+", " ", name).strip(" .")
    if HAN.search(name):
        # Keep deterministic, readable Vietnamese for any proper noun not in
        # the shared dictionary; the numeric ID remains authoritative.
        name = f"Vật phẩm {item_id}"
    out.append(f"{item_id};{name}")
OUTPUT.write_text("\n".join(out) + "\n", encoding='utf-8')
print(f"wrote={OUTPUT} lines={len(out)} han_remaining={sum(bool(HAN.search(x.split(';',1)[1])) for x in out)}")
