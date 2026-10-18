const fs = require('fs');
const files = [
  '/linhhoasu/lhs/LHS-admin/admin-users.html',
  '/linhhoasu/lhs/LHS-admin/admin-users1.html',
];
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(
    "const GAME_PROXY_PREFIX = '/game';",
    "const GAME_PROXY_PREFIX = location.pathname.indexOf('/gmhoalinhsu/') === 0 ? '/gmhoalinhsu/game' : '/game';",
  );
  text = text.replaceAll("location.origin + '/api/admin", "location.origin + GAME_PROXY_PREFIX + '/api/admin");
  fs.writeFileSync(file, text);
  console.log(file, text.includes("location.pathname.indexOf('/gmhoalinhsu/')"), text.includes("GAME_PROXY_PREFIX + '/api/admin/auth/login"));
}
