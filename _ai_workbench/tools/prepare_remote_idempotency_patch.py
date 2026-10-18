from pathlib import Path

root = Path(r"I:\Linhhoasu\server\server")
remote_dir = root / "_ai_workbench" / "temp" / "donate_remote"
local_http = root / "linhhoasu" / "lhs" / "newServer" / "src" / "net" / "HTTPServer.js"

remote_http = (remote_dir / "HTTPServer.js").read_text(encoding="utf-8")
source_http = local_http.read_text(encoding="utf-8")
start_marker = "  async _internalMailSend(req, res) {"
end_marker = "\n  /**\n   * Internal: 全服/按服群发邮件"
source_start = source_http.index(start_marker)
source_end = source_http.index(end_marker, source_start)
remote_start = remote_http.index(start_marker)
remote_end = remote_http.index(end_marker, remote_start)
patched_http = remote_http[:remote_start] + source_http[source_start:source_end] + remote_http[remote_end:]
(remote_dir / "HTTPServer.idempotency.js").write_text(patched_http, encoding="utf-8")

remote_mail = (remote_dir / "Mail.js").read_text(encoding="utf-8")
old = "mailSchema.index({ userId: 1, eventKey: 1 });"
new = """mailSchema.index(
  { userId: 1, eventKey: 1 },
  {
    unique: true,
    partialFilterExpression: { eventKey: { $gt: '' } },
    name: 'uniq_mail_user_event_key',
  }
);"""
if old not in remote_mail:
    raise SystemExit("Mail index target not found")
(remote_dir / "Mail.idempotency.js").write_text(remote_mail.replace(old, new, 1), encoding="utf-8")
print(remote_dir / "HTTPServer.idempotency.js")
print(remote_dir / "Mail.idempotency.js")
