import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pathlib import Path
sys.path.insert(0, './_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

def main():
    s = connect()
    script = '''
const playerService = require('/linhhoasu/lhs/newServer/src/services/PlayerService');
(async () => {
    // S1 db
    const player = await playerService.getPlayerByUsername('vanduc97', 1001);
    if (!player) {
        console.log('Player not found');
        return;
    }
    console.log('Player currencies:', JSON.stringify(player.currencies));
    console.log('Player items 36:', player.items ? player.items[36] : 0);
    console.log('Pet count:', player.petInfo && player.petInfo.pets ? player.petInfo.pets.length : 0);
    process.exit(0);
})();
'''
    res = run(s, f"node -e {shlex_quote(script)}")
    print(res)
    s.close()

def shlex_quote(s):
    import shlex
    return shlex.quote(s)

if __name__ == '__main__':
    main()
