import getpass, json, os, paramiko

HOST='103.116.105.154'
REMOTE_CATALOG='/linhhoasu/webgame/gm/assets/item/webshop_catalog.json'
LOCAL_FASHION=r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\scripts\_tables_dump\FashionConfig.json'
LOCAL_ASSETS=r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\scripts\_tables_dump\AssetsConfig.json'
TABLE_ROOT=r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\scripts\_tables_dump'

ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 s=ssh.open_sftp()
 try:
  with s.open(REMOTE_CATALOG,'rb') as f: catalog=json.loads(f.read().decode('utf-8'))
 finally:s.close()
 fashion=json.load(open(LOCAL_FASHION,encoding='utf-8')).get('data',{})
 assets=json.load(open(LOCAL_ASSETS,encoding='utf-8')).get('data',{})
 def table(name):
  path=os.path.join(TABLE_ROOT,name+'.json')
  return json.load(open(path,encoding='utf-8')).get('data',{}) if os.path.exists(path) else {}
 sword=table('SwordConfig'); special_sword=table('SpecialSwordConfig'); pet=table('PetConfig'); pet_soul=table('PetSoulConfig'); bloodline=table('BloodlineConfig'); valhalla=table('ValhallaConfig')
 rows=catalog.get('items',catalog if isinstance(catalog,list) else catalog.get('products',[]))
 out=[]
 for row in rows:
  item_id=int(row.get('item_id',0) or 0)
  f=fashion.get(str(item_id))
  a=assets.get(str(item_id))
  out.append({
   'shop_item_id':row.get('id'), 'item_id':item_id, 'category':row.get('category'), 'name_vi':row.get('name_vi'), 'item_amount':row.get('item_amount'), 'price':row.get('price'),
   'fashion_config':bool(f), 'fashion_type':f.get('type') if f else None, 'fashion_appear_ids':f.get('appearIds') if f else None,
   'assets_type':a.get('type') if a else None, 'assets_subType':a.get('subType') if a else None, 'assets_param':a.get('param') if a else None,
   'sword':str(item_id) in sword or str(item_id) in special_sword or (a and a.get('type') in (5,94)),
   'pet':str(item_id) in pet or (a and a.get('type')==6),
   'petSoul':str(item_id) in pet_soul or (a and a.get('type')==40),
   'bloodline':str(item_id) in bloodline or (a and a.get('type')==22),
   'valhalla':str(item_id) in valhalla,
  })
 for x in out:
  if x['fashion_config']: x['mail_result']='BUG_FASHION_AS_ITEM'
  elif x['bloodline']: x['mail_result']='BUG_BLOODLINE_AS_ITEM'
  elif x['valhalla']: x['mail_result']='BUG_VALHALLA_AS_ITEM'
  elif x['sword'] or x['pet'] or x['petSoul']: x['mail_result']='SPECIAL_HANDLED'
  else: x['mail_result']='NORMAL_ITEM_OR_OTHER'
 print(json.dumps({'count':len(out),'bug_rows':[x for x in out if x['mail_result'].startswith('BUG_')],'handled_special':[x for x in out if x['mail_result']=='SPECIAL_HANDLED'],'summary':{k:sum(1 for x in out if x['mail_result']==k) for k in sorted(set(x['mail_result'] for x in out))}},ensure_ascii=False,indent=2))
finally:ssh.close()
