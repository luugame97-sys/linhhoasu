
	(function () {
		var query = new URLSearchParams(window.location.search || '');
		var backendHost = query.get('backendHost') || window.location.hostname || '127.0.0.1';
		var httpPort = String(query.get('httpPort') || '18080');
		var wsPort = String(query.get('wsPort') || '9200');
		var apiBase = 'http://' + backendHost + ':' + httpPort;
		var wsUrl = 'ws://' + backendHost + ':' + wsPort;

		window.LHS_API_BASE = apiBase;
		window.LHS_PAY_BASE_URL = apiBase;
		window.__LHS_GAME_MSG_URL__ = apiBase + '/gameMsg.do';
		window.__LHS_WS_URL__ = wsUrl;

		function rewriteRuntimeUrl(url) {
			if (typeof url !== 'string') return url;

			var gameApiMatch = url.match(/(?:^|\/)(?:binGameMsg|gameMsg|gameMsq)\.do(?=[?#]|$)/i);
			if (gameApiMatch) {
				var suffixAt = gameApiMatch.index + gameApiMatch[0].length;
				return apiBase + '/gameMsg.do' + url.substring(suffixAt);
			}

			try {
				var parsed = new URL(url, window.location.href);
				var host = parsed.hostname.toLowerCase();
				var updateHosts = [
					'lhsupdate.guangzhougy.com',
					'lhsupdatetest.guangzhougy.com',
					'lhshwbupdate.ccjh.cc',
					'updatetest.lhsafk.com'
				];
				var updateAt = parsed.pathname.indexOf('/update/');
				if (updateHosts.indexOf(host) !== -1 && updateAt !== -1) {
					return './update/' + parsed.pathname.substring(updateAt + 8) + parsed.search + parsed.hash;
				}
			} catch (_e) {}

			return url;
		}

		var rawXhrOpen = XMLHttpRequest.prototype.open;
		XMLHttpRequest.prototype.open = function (method, url) {
			arguments[1] = rewriteRuntimeUrl(url);
			return rawXhrOpen.apply(this, arguments);
		};

		if (window.fetch) {
			var rawFetch = window.fetch.bind(window);
			window.fetch = function (input, init) {
				var sourceUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
				var rewritten = rewriteRuntimeUrl(sourceUrl);
				if (typeof input === 'string') return rawFetch(rewritten, init);
				if (rewritten !== sourceUrl) return rawFetch(new Request(rewritten, input), init);
				return rawFetch(input, init);
			};
		}

	})();

	//publish鐨勬椂鍊欎細琚嚜鍔ㄦ浛鎹㈡垚姝ｅ紡/娴嬭瘯鍩熷悕
	var JS_URL_PREFIX = "./";
	var RES_URL_PREFIX = "./update/";

	var TEST_MODE = false;

	var nativeJsMap;
	var loadScript = function (list, threadNum, callback) {
		if (list.length < 1) {
			callback()
			return
		}
		var loaded = 0;
		var startLen = 0
		var loadNext = function () {
			for (var i = 0; i < threadNum; ++i) {
				var url = list[loaded++]
				if (url) {
					var root = JS_URL_PREFIX;
					var basename = url.split("/").pop();
					if (basename in nativeJsMap.files) {
						root = nativeJsMap.root;
						url = basename;
					}
					loadSingleScript(root + url, function () {
						startLen++;
						if (startLen >= list.length) {
							callback();
						} else {
							loadNext();
						}
					})
				}
			}
		};
		loadNext();
	};

	var installLhsActionCompletionGuards = function () {
		var install = function (name, ActionType, remote) {
			if (!ActionType || !ActionType.prototype || ActionType.prototype.__lhsCompletionGuard) {
				return;
			}
			var prototype = ActionType.prototype;
			var originalInit = prototype.Init;
			var originalUpdate = prototype.OnUpdate;
			if (typeof originalInit !== 'function' || typeof originalUpdate !== 'function') {
				return;
			}
			prototype.__lhsCompletionGuard = true;
			prototype.Init = function () {
				this.__lhsReadyElapsed = 0;
				this.__lhsLoadingElapsed = 0;
				this.__lhsCompletionWarned = false;
				return originalInit.apply(this, arguments);
			};
			prototype.OnUpdate = function (elapsed) {
				var result = originalUpdate.apply(this, arguments);
				if (result) {
					return result;
				}
				var manager = window.W || window.GlobalManager;
				var boxLayer = manager && manager.BoxLayerModel;
				if (!boxLayer || typeof boxLayer.isInState !== 'function'
					|| (!boxLayer.isInState(5) && !boxLayer.isInState(7))) {
					return result;
				}

				if (typeof document !== 'undefined' && document.hidden) {
					return result;
				}
				var delta = Math.min(100, Math.max(0, Number(elapsed) || 0));
				var raid = manager && manager.RaidMgr && manager.RaidMgr.mMapRaid;
				var entity = raid && raid.GetEntity ? raid.GetEntity(this.atkId) : null;
				var body = entity && entity.m_Model && entity.m_Model.mHeroBody;
				if (body && body.canPlayAnim === false) {
					this.__lhsLoadingElapsed += delta;
				} else {
					this.__lhsReadyElapsed += delta;
				}

				// Normal actions complete well below five seconds. Resource loading keeps
				// its own longer budget, matching the existing global state watchdog.
				if (this.__lhsReadyElapsed < 5000 && this.__lhsLoadingElapsed < 15000) {
					return result;
				}

				if (!this.__lhsCompletionWarned) {
					this.__lhsCompletionWarned = true;
					console.warn('[LHS] ' + name + ' completion callback fallback');
				}
				if (name === 'DashAction' && raid && raid.GetMoveTeamByHandle) {
					var moveTeam = raid.GetMoveTeamByHandle(this.atkId);
					if (moveTeam) {
						moveTeam.StopMove(false);
					}
				}
				this.isEnd = true;
				if (remote) {
					this.isFlyEnd = true;
				}
				return originalUpdate.apply(this, arguments) || 1;
			};
		};

		install('DashAction', window.DashAction, false);
		install('AtkAction', window.AtkAction, false);
		install('RemoteAtkAction', window.RemoteAtkAction, true);
	};

	var installLhsSocketSendGuard = function () {
		var SocketType = window.egret && window.egret.web && window.egret.web.HTML5WebSocket;
		if (!SocketType || !SocketType.prototype || SocketType.prototype.__lhsNativeSendGuardV2) {
			return !!(SocketType && SocketType.prototype);
		}
		var prototype = SocketType.prototype;
		prototype.__lhsNativeSendGuardV2 = true;
		prototype.send = function (data) {
			if (typeof this._nativeSend === 'function') {
				return this._nativeSend(data);
			}
			var socket = this._nativeSocket || this.socket;
			if (!socket) {
				throw new Error('WebSocket connection is not initialized');
			}
			return Reflect.apply(window.WebSocket.prototype.send, socket, [data]);
		};
		return true;
	};

	var installLhsTopCombatProtocolGuard = function () {
		var manager = window.W || window.GlobalManager;
		var model = manager && manager.TopCombatModel;
		var ModelType = window.TopCombatModel;
		var prototype = ModelType && ModelType.prototype;
		if (!prototype && model) prototype = Object.getPrototypeOf(model);
		if (!prototype || prototype.__lhsTopCombatProtocolGuardV1) return !!prototype;
		if (typeof prototype.Rpc !== 'function' || typeof prototype.updateChallengeInfo !== 'function') return false;

		prototype.__lhsTopCombatProtocolGuardV1 = true;
		prototype.sendUpdateChallengeInfo = function (playAnimation) {
			var self = this;
			if (playAnimation === undefined) playAnimation = false;
			this.Rpc(4600, null, function (payload) {
				payload = payload || {};
				var previous = self.info && typeof self.info === 'object' ? self.info : {};
				self.info = {
					...previous,
					maxRank: Number.isFinite(Number(payload.maxRank)) ? Number(payload.maxRank) : Number(previous.maxRank || -1),
					records: Array.isArray(payload.records) ? payload.records : (Array.isArray(previous.records) ? previous.records : []),
					loglist: Array.isArray(payload.loglist) ? payload.loglist : (Array.isArray(previous.loglist) ? previous.loglist : [])
				};
				self.matchStatus = Number(payload.matchStatus) || 0;
				self.matchEndTime = Number(payload.matchEndTime) || 0;
				self.updateChallengeInfo(payload.challengeInfo || {
					rank: self.info.maxRank > 0 ? self.info.maxRank : 1,
					refreshtime: 0,
					challengeList: [],
					infoMap: {}
				}, playAnimation);
			});
		};
		return true;
	};

	var loadSingleScript = function (src, callback) {
		var isMainScript = /js\/main\.min_a6195824\.js$/.test(src);
		var isEgretexScript = /js\/egretex\.min_37b3ee13\.js$/.test(src);
		var s = document.createElement('script');
		s.async = false;
		if (/js\/(egretex\.min_37b3ee13|main\.min_a6195824)\.js$/.test(src)) {
			src += '?v=20260801_protocol10';
		}
		s.src = src;
		s.addEventListener('load', function () {
			if (isEgretexScript) {
				installLhsSocketSendGuard();
			}
			if (isMainScript) {
				installLhsActionCompletionGuards();
				if (!installLhsTopCombatProtocolGuard()) {
					var topCombatGuardRetry = 0;
					var topCombatGuardTimer = setInterval(function () {
						topCombatGuardRetry++;
						if (installLhsTopCombatProtocolGuard() || topCombatGuardRetry >= 60) {
							clearInterval(topCombatGuardTimer);
						}
					}, 100);
				}
			}
			s.parentNode.removeChild(s);
			s.removeEventListener('load', arguments.callee, false);
			callback();
		}, false);
		document.body.appendChild(s);
	};
	
	var hashed_default_json;
	var __JSVERSION__;
	var delay_js = [];
	function ready() {
		var onManifestLoaded = function(response){
			var manifest = response;
			hashed_default_json = manifest.hashed_default_json || {};
			__JSVERSION__ = manifest.version;
			var list = manifest.initial;
			window.loadScript(list, 1, function () {
                //platform placeholder
				list = manifest.game;
				for(var i = 0; i < list.length; ++i){
					if(list[i].indexOf("default.thm") != -1 && list[i].indexOf("default.thm.start") == -1){
						delay_js.push(list.splice(i--, 1)[0]);
					}else if(/main[^/]*?\.js$/.test(list[i])){
						delay_js.push(list.splice(i--, 1)[0]);
					}
				}
				window.loadScript(manifest.game, 1, function () {
					egret.runEgret({ renderMode: "webgl", audioType: 0 });
					//nativeSplash瓒呮椂寮哄埗鍏抽棴
					//setTimeout(function(){platform.closeSplash()}, 2000);
				});
			});
		}
		var getJSResFinish = function(res) {
			if (!nativeJsMap) {
				nativeJsMap = res || {};
				nativeJsMap.files = nativeJsMap.files || {};
				if (manifestContent) {
					onManifestLoaded(manifestContent);
				}
			}
		};
		var manifestContent;
		if (window.egret_native) {
			egret_native.receivedPluginInfo = function (info) {
            	var data = JSON.parse(info);
				if (data.functionName == "getJSResReturn" && data.value) {
					console.log(data.value);
					getJSResFinish(JSON.parse(data.value));
				}
			};
			egret_native.sendInfoToPlugin(JSON.stringify({
				functionName :"getJSRes",
				value: "",
			}));
		}
		function loadManifest(callback) {
	        callback({
	"initial": [
		"js/egret.min_7d668222.js",
		"js/egret.web.min_587897e9.js",
		"js/egretex.min_37b3ee13.js",
		"js/thirds.min_b052d442.js"
	],
	"game": [
		"js/start.min_52ac8d58.js",
		"js/main.min_a6195824.js"
	],
	"hashed_default_json": {
		"start": "default.res_326514c1.bin",
		"main": "default.res_main_c669f2c0.bin",
		"cn_main": "default.res_cn_main_f70d4753.bin",
		"tw_main": "default.res_tw_main_2ff8859f.bin",
		"en_main": "default.res_en_main_e8c1a527.bin",
		"jp_main": "default.res_jp_main_d7496194.bin",
		"kr_main": "default.res_kr_main_7255ded2.bin"
	}
})
		}
		loadManifest(function(res){
			manifestContent = res;
			if (window.egret_native) {
				if (nativeJsMap) {
					//宸茬粡杩斿洖
					onManifestLoaded(manifestContent);
				} else {
					//500姣鏈繑鍥烇紝鍒欒涓烘槸鑰佺増鏈琻ative锛屼笉浼氬啀杩斿洖浜?					setTimeout(getJSResFinish, 500);
				}
			} else {
				getJSResFinish();
			}
		});
	}

	function closeSocket() {
		if (window.Main && Main.Instance && Main.Instance.closesocket) {
			Main.Instance.closesocket();
		} else {
			console.error("not Main.closesocket")
		}
	}

	function __StartLoading(callback) {
		var list = delay_js;
		window.loadScript(list, 1, callback);
	}
   
	function __RemoveLoading() {
		var myloading = document.getElementById("loader");
		if (!myloading) {
			return
		}
		myloading.parentNode.removeChild(myloading)
	}

	ready()

