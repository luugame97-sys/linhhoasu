const fs = require('fs');
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const { unlockEquipAppearance, ensureRoleAppearance } = require('/linhhoasu/lhs/newServer/src/services/RoleAppearanceService');
const { addRewardToPlayer } = require('/linhhoasu/lhs/newServer/src/handlers/raid');
const { syncCurrencyItems } = require('/linhhoasu/lhs/newServer/src/services/CurrencySync');

const COMMIT = process.argv.includes('--commit');
const ORDER_FILE = '/linhhoasu/_ai_workbench/temp/webshop_fashion_orders.json';
const BACKUP_DIR = process.env.WEBSHOP_FASHION_REPAIR_BACKUP || '';
function safeInt(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
function fashionRow(id) { const rows=config.get('FashionConfig')||{}; return rows[id]||rows[String(id)]||null; }
function owned(player,id) { ensureRoleAppearance(player); const f=player.fashionInfo||{}; return safeInt(f.fashions&&f.fashions[String(id)])>0 || (Array.isArray(f.activateFashion)&&f.activateFashion.some(x=>safeInt(x)===id)); }
function swaps(row) { const raw=Array.isArray(row.swaps)?row.swaps:(row.swaps&&typeof row.swaps==='object'?[row.swaps]:[]); return raw.map(x=>({id:safeInt(x&&x.id),count:safeInt(x&&x.count)})).filter(x=>x.id>0&&x.count>0); }

(async()=>{
 const orders=JSON.parse(fs.readFileSync(ORDER_FILE,'utf8')).sort((a,b)=>safeInt(a.id)-safeInt(b.id));
 await mongo.connect();
 const results=[];
 const grouped = new Map();
 for (const order of orders) {
  const roleId=String(order.role_id||'').trim(); const itemId=safeInt(order.item_id); const quantity=safeInt(order.quantity); const row=fashionRow(itemId);
  if(!roleId||!row||quantity<=0) throw new Error(`INVALID_ORDER_${safeInt(order.id)}`);
  const player=await Player.findOne({$or:[{userId:roleId},{playerId:roleId},{roleId}]}).lean();
  if(!player) throw new Error(`PLAYER_NOT_FOUND_${safeInt(order.id)}`);
  const key=String(player._id);
  if(!grouped.has(key)) grouped.set(key,{player,orders:[]});
  grouped.get(key).orders.push(order);
 }
 for(const group of grouped.values()){
  let player=group.player;
  if (COMMIT && BACKUP_DIR) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(`${BACKUP_DIR}/player-${String(player._id)}.before.json`, JSON.stringify(player, null, 2), { mode: 0o600 });
  }
 for(const order of group.orders){
  const orderId=String(safeInt(order.id)); const itemId=safeInt(order.item_id); const quantity=safeInt(order.quantity); const row=fashionRow(itemId);
  player.repairFlags=player.repairFlags&&typeof player.repairFlags==='object'?player.repairFlags:{}; player.repairFlags.webshopFashionV1=player.repairFlags.webshopFashionV1&&typeof player.repairFlags.webshopFashionV1==='object'?player.repairFlags.webshopFashionV1:{};
  if(player.repairFlags.webshopFashionV1[orderId]){results.push({orderId,itemId,quantity,status:'already_repaired'});continue;}
  player.items=player.items&&typeof player.items==='object'?player.items:{}; const bagBefore=safeInt(player.items[String(itemId)]);
  if(bagBefore<quantity) throw new Error(`BAG_COUNT_MISMATCH_${orderId}_need_${quantity}_have_${bagBefore}`);
  const ownedBefore=owned(player,itemId); let activated=false; const swapRewards=[];
  for(let i=0;i<quantity;i++){
   if(!owned(player,itemId)){unlockEquipAppearance(player,itemId);if(!owned(player,itemId))throw new Error(`ACTIVATE_FAILED_${orderId}`);activated=true;continue;}
   for(const swap of swaps(row)){addRewardToPlayer(player,swap.id,swap.count);swapRewards.push({...swap});}
  }
  const bagAfter=bagBefore-quantity; if(bagAfter>0)player.items[String(itemId)]=bagAfter;else delete player.items[String(itemId)]; syncCurrencyItems(player);
  const marker={itemId,quantity,activated,swapRewards,repairedAt:new Date().toISOString()}; player.repairFlags.webshopFashionV1[orderId]=marker;
  if(COMMIT){await Player.updateOne({_id:player._id},{$set:{items:player.items,currencies:player.currencies,fashionInfo:player.fashionInfo,repairFlags:player.repairFlags}});}
  results.push({orderId,itemId,quantity,status:COMMIT?'repaired':'dry_run',bagBefore,bagAfter,ownedBefore,activated,swapRewards});
  }
 }
 console.log(JSON.stringify({commit:COMMIT,orders:results.length,results},null,2));
})().finally(()=>mongo.disconnect());
