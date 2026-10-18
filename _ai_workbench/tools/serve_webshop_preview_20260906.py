"""Local preview server, blocks PHP source and external app requests."""
import json,sys
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs,urlparse
ROOT=Path(__file__).resolve().parents[1]/'temp/webshop_upgrade_20260906/candidate'
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
 def do_GET(self):
  if self.path.startswith('/api/item_icon.php'):self.path='/assets/images/item-default.svg'
  if urlparse(self.path).path.endswith('.php'):self.send_error(403);return
  return super().do_GET()
 def do_POST(self):
  data=parse_qs(self.rfile.read(int(self.headers.get('Content-Length','0'))).decode());action=data.get('action',[''])[0]
  rows=[{'id':1,'item_id':'28043','item_name':'Phượng Cầu Hoàng Bào','image_url':'api/item_icon.php?id=28043','price':100,'item_amount':1,'sort_order':0,'is_active':1,'reward_items':None,'bundle_rewards':[{'id':28043,'amount':1,'name':'Áo Phượng Cầu Hoàng'}]}]
  result={'status':'success','data':rows if action=='get_webshop_items'else[],'settings':{},'message':'QA only — không lưu production'}
  if action=='save_webshop_item':result['submitted']={k:v[0]for k,v in data.items()}
  b=json.dumps(result).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b)
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',18786),Handler);print('Webshop QA preview http://127.0.0.1:18786/admin/preview.html',flush=True);server.serve_forever()
