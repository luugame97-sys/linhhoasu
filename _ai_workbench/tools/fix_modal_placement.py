import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')
sftp = c.open_sftp()

with sftp.file('/linhhoasu/webgame/gm/index.php', 'r') as f:
    content = f.read().decode('utf-8')

# Modal HTML to move
modal_block = """<!-- Modal Chọn/Đổi Máy Chủ -->
<div class="modal fade" id="switchServerModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold"><i class="fa-solid fa-server text-primary me-2"></i>Chọn Máy Chủ</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <p class="text-muted small fw-bold mb-3">Chọn máy chủ bạn muốn quản lý hoặc đổi quà:</p>
                <div class="d-grid gap-2">
                    <?php foreach ($quarr as $s_id => $s_data): 
                        $is_curr = ((string)$s_id === (string)$server_id);
                    ?>
                        <button type="button" class="btn text-start p-3 rounded-3 d-flex align-items-center justify-content-between <?php echo $is_curr ? 'btn-primary text-white' : 'btn-outline-secondary'; ?> switch-server-btn" data-server-id="<?php echo htmlspecialchars($s_id); ?>">
                            <div>
                                <div class="fw-bold fs-6">S<?php echo htmlspecialchars($s_id); ?> - <?php echo htmlspecialchars($s_data['name']); ?></div>
                                <small class="<?php echo $is_curr ? 'text-white-50' : 'text-muted'; ?>">Máy chủ hoạt động</small>
                            </div>
                            <?php if ($is_curr): ?>
                                <span class="badge bg-light text-primary fw-bold">Hiện tại</span>
                            <?php else: ?>
                                <i class="fa-solid fa-chevron-right text-muted"></i>
                            <?php endif; ?>
                        </button>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
</div>"""

# Remove from maintenance block
assert modal_block in content, "modal_block not found in content"
content = content.replace(modal_block, '', 1)

# Add before the LAST </body>
last_body_idx = content.rfind('</body>')
assert last_body_idx != -1, "last </body> not found"
content = content[:last_body_idx] + modal_block + '\n' + content[last_body_idx:]

with sftp.file('/linhhoasu/webgame/gm/index.php', 'w') as f:
    f.write(content.encode('utf-8'))

sftp.close()

_, out, err = c.exec_command('php -l /linhhoasu/webgame/gm/index.php')
print(out.read().decode('utf-8'))
print(err.read().decode('utf-8'))
c.close()
