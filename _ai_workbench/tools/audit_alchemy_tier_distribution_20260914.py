import getpass
import shlex
import paramiko


NODE = r"""
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{for(const dbName of ['lhs_s1001','lhs_s1002','lhs_s1003']){const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const rows=await c.db(dbName).collection('players').aggregate([
{$match:{isBot:{$ne:true}}},
{$project:{r:{$ifNull:['$roleInfo.stage',1]},a:{$ifNull:['$alchemyInfo.level',1]}}},
{$project:{roleTier:{$min:[15,{$max:[1,{$ceil:{$divide:['$r',3]}}]}]},alchemyTier:{$min:[15,{$max:[1,{$ceil:{$divide:['$a',4]}}]}]}}},
{$group:{_id:{roleTier:'$roleTier',alchemyTier:'$alchemyTier'},count:{$sum:1}}},{$sort:{'_id.roleTier':1,'_id.alchemyTier':1}}
]).toArray();console.log(JSON.stringify({db:dbName,rows}));await c.close();}})().catch(e=>{console.error(e);process.exit(1)});
"""


def main():
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('103.116.105.154', username='root', password=password,
                look_for_keys=False, allow_agent=False, timeout=20)
    try:
        _, out, err = ssh.exec_command('node -e ' + shlex.quote(NODE), timeout=120)
        print(out.read().decode('utf-8', 'replace'), end='')
        print(err.read().decode('utf-8', 'replace'), end='')
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
