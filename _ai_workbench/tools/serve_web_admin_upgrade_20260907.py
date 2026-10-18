"""Loopback-only preview of actual candidate HTML/JS; fixture API, no live writes."""
import json,mimetypes,subprocess
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import parse_qs,urlparse
from pathlib import Path

WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/web_admin_upgrade_20260907';CAND=ROOT/'candidate'
html=subprocess.check_output(['C:/xampp/php/php.exe',str(WB/'tools/render_web_admin_upgrade_20260907.php'),str(CAND)])
(ROOT/'admin_preview.html').write_bytes(html)
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def respond(self,data,ctype='application/json; charset=utf-8',code=200):
        self.send_response(code);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_GET(self):
        path=urlparse(self.path).path
        if path in ['/','/admin/index.php']:return self.respond(html,'text/html; charset=utf-8')
        if path.startswith('/assets/'):
            p=(CAND/path.lstrip('/')).resolve()
            if p.is_relative_to(CAND.resolve())and p.is_file():return self.respond(p.read_bytes(),mimetypes.guess_type(str(p))[0]or'application/octet-stream')
        self.respond(b'Not found','text/plain',404)
    def do_POST(self):
        raw=self.rfile.read(min(int(self.headers.get('Content-Length','0')),32768)).decode();q={k:v[0]for k,v in parse_qs(raw).items()};action=q.get('action','')
        result={'status':'success','data':[],'current_page':1,'total_pages':1}
        if action=='get_users_list':
            rows=[{'Uin':'101','AccountName':'qa_alice','xu':'5001','recharge_total':50000,'vip_level':2,'is_banned':0,'role_id':'qa_uid_1','role_name':'Đại Đế QA','server_id':'1001','server_name':'QA S1'}, {'Uin':'102','AccountName':'qa_locked','xu':'10','recharge_total':0,'vip_level':0,'is_banned':1,'role_id':'qa_uid_2','role_name':'Người chơi QA','server_id':'1001','server_name':'QA S1'}]
            f=q.get('account_filter','all');search=q.get('search','')
            rows=[r for r in rows if(not search or search in ' '.join(map(str,r.values())))and(f=='all'or(f=='locked'and r['is_banned'])or(f=='active'and not r['is_banned'])or(f in ['vip','vip2']and r['vip_level']==2)or(f=='nonvip'and not r['vip_level']))]
            result.update(data=rows,can_manage=True,sort_by='account',sort_dir='desc')
        elif action=='resolve_player_target':result.update(roles=[{'role_id':'qa_uid_1','role_name':'Đại Đế QA','account_id':q.get('query','qa_alice'),'server_id':'1001'}],unique=True)
        elif action=='get_monitor_logs':
            status=q.get('quick_status','');rows=[{'event_id':'qa-log1','created_at':'2026-09-07 12:00:00','source':'sepay','status':'failed'if status=='error'else'ignored'if status=='warning'else'success','level':'error'if status=='error'else'warning'if status=='warning'else'info','account_name':'qa_alice','server_id':'1001','server_name':'QA S1','action':'fixture_only','message':'Dữ liệu QA, không phải giao dịch thật.','details':'Kiểm tra filter trong bản xem trước.'}]
            result.update(data=rows,summary={'total':3,'success_count':1,'warning_count':1,'error_count':1,'sepay_count':3},range={'label':'Hôm nay (fixture)'},refreshed_at='QA',financial=None)
            if q.get('source_filter')=='sepay':result['financial']={'available':True,'account':q.get('search',''),'server_id':q.get('server_filter',''),'lifetime':{'total':'150000','count':3},'period':{'total':'50000','count':1,'topup':'50000','vip':'0'},'details':[{'created_at':'2026-09-07 12:00','account_name':'qa_alice','server_id':'1001','amount':'50000','action':'topup_xu','tran_id':'QA-NOT-REAL'}],'basis':'Dữ liệu mô phỏng để kiểm tra giao diện; không gọi ngân hàng.'}
        elif action=='get_overview':result.update(stats={},top_recharge=[],recent_orders=[],recent_logs=[],health={})
        elif action in ['send_gm_action','switch_admin_server','create_giftcode']:result={'status':'error','message':'Bản xem trước không thực hiện thao tác ghi.'}
        self.respond(json.dumps(result,ensure_ascii=False).encode())
print('QA preview http://127.0.0.1:33317/admin/index.php',flush=True)
ThreadingHTTPServer(('127.0.0.1',33317),Handler).serve_forever()
