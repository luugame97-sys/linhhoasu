import paramiko, re

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')
sftp = c.open_sftp()

with sftp.file('/linhhoasu/webgame/game/index.html', 'r') as f:
    content = f.read().decode('utf-8')

pattern_open = r"var open = function \(\) \{\s*clearIdle\(\);\s*scheduleIdle\(\);\s*if \(dragged\) \{ dragged = false; return; \}\s*if \(frame && frame\.src === 'about:blank'\) frame\.src = frame\.getAttribute\('data-src'\);\s*modal\.hidden = false;\s*modal\.setAttribute\('aria-hidden', 'false'\);\s*document\.body\.classList\.add\('lhs-web-modal-open'\);\s*var closeButton = modal\.querySelector\('\.lhs-web-modal__close'\);\s*if \(closeButton\) closeButton\.focus\(\);\s*\};"

new_open = """function getGameContext() {
			var sid = '';
			var roleId = '';
			try {
				if (window.UserInfo) {
					if (window.UserInfo.ServerID) sid = String(window.UserInfo.ServerID);
					else if (window.UserInfo.serverId) sid = String(window.UserInfo.serverId);
				}
				var mgr = window.GlobalManager || window.GameGlobalYDXZ || window.W;
				if (!sid && mgr && mgr.ActorModel) {
					if (mgr.ActorModel.ServerID) sid = String(mgr.ActorModel.ServerID);
					else if (mgr.ActorModel.serverId) sid = String(mgr.ActorModel.serverId);
				}
				if (mgr && mgr.ActorModel) {
					var actor = mgr.ActorModel;
					var aid = actor.actorID != null ? actor.actorID : actor.playerId;
					if (aid != null && aid !== '') roleId = String(aid);
				}
			} catch (_e) {}
			return { serverId: sid, roleId: roleId };
		}

		var open = function () {
			clearIdle();
			scheduleIdle();
			if (dragged) { dragged = false; return; }
			var ctx = getGameContext();
			var baseSrc = frame ? (frame.getAttribute('data-src') || '/web-panel/?is_popup=1&tab=tab-giftcode') : '/web-panel/?is_popup=1&tab=tab-giftcode';
			var targetUrl = baseSrc;
			if (ctx.serverId) {
				targetUrl += (targetUrl.indexOf('?') === -1 ? '?' : '&') + 'server_id=' + encodeURIComponent(ctx.serverId);
			}
			if (ctx.roleId) {
				targetUrl += '&role_id=' + encodeURIComponent(ctx.roleId);
			}
			if (frame) {
				if (frame.src === 'about:blank' || !frame.src) {
					frame.src = targetUrl;
				} else if (ctx.serverId) {
					try {
						var parsedSrc = new URL(frame.src, window.location.href);
						if (parsedSrc.searchParams.get('server_id') !== String(ctx.serverId)) {
							parsedSrc.searchParams.set('server_id', String(ctx.serverId));
							if (ctx.roleId) parsedSrc.searchParams.set('role_id', String(ctx.roleId));
							frame.src = parsedSrc.href;
						}
					} catch (_err) {
						frame.src = targetUrl;
					}
				}
			}
			modal.hidden = false;
			modal.setAttribute('aria-hidden', 'false');
			document.body.classList.add('lhs-web-modal-open');
			var closeButton = modal.querySelector('.lhs-web-modal__close');
			if (closeButton) closeButton.focus();
		};"""

assert re.search(pattern_open, content), "pattern_open not found in game/index.html"
content = re.sub(pattern_open, new_open, content, count=1)

with sftp.file('/linhhoasu/webgame/game/index.html', 'w') as f:
    f.write(content.encode('utf-8'))

sftp.close()
c.close()
print("game/index.html patched successfully!")
