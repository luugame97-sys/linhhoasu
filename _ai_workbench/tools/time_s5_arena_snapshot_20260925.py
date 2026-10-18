from snapshot_web_multiserver_20260906 import connect,run
JS=r"""process.env.MONGO_URI='mongodb://localhost:27017/lhs_s1005';const m=require('/linhhoasu/lhs/newServer/src/db/mongo'),P=require('/linhhoasu/lhs/newServer/src/db/models/Player'),L=require('/linhhoasu/lhs/newServer/src/db/models/ArenaFightLog');(async()=>{const t=Date.now();await m.connect();const c1=Date.now();const rows=await P.find({arenaScore:{$exists:true},isBot:{$ne:true},managedBot:{$ne:true}}).select({userId:1,playerId:1,arenaScore:1,arenaReceiptLedger:1,arenaLogOutbox:1,_id:0}).maxTimeMS(5000).lean();const c2=Date.now();const logs=await L.find({serverId:1005,createdAt:{$gt:new Date(1789920000000)}}).select({fightId:1,attackerId:1,scoreChange:1,createdAt:1,_id:0}).maxTimeMS(5000).lean();console.log(JSON.stringify({connect:c1-t,rows:rows.length,rowsMs:c2-c1,logs:logs.length,total:Date.now()-t}));await m.disconnect()})().catch(e=>{console.error(e.stack);process.exit(1)});"""
def main():
 s=connect()
 try: print(run(s,'node -',JS))
 finally:s.close()
if __name__=='__main__':main()
