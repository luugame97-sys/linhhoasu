# Rollback riêng bản quét batch Hư Thiên Bảo Điện — 17/10/2026

- Đã rollback riêng release `tower_sweep_v1`: gỡ `TowerSweepService`, bỏ route3705 và khôi phục tower/index/client về preimage ngay trước sweep.
- Giữ nguyên `TowerDailyResetService` và reset ngày00:00GMT+7; kiểm tra sau rollback xác nhận daily reset vẫn còn, sweep route/service không còn.
- Restart tuần tự S1→S9, PM2save; S1–S9 online và `/ready` Mongo/Redis9/9; process ngoài phạm vi0.
- Không rollback player/DB/reward đã commit; không hoàn nguyên các bản sửa thú cưỡi, format số hoặc reset ngày.
- Backup phần sweep trước rollback: `/linhhoasu/_ai_workbench/backups/tower_sweep_20261017_061616`. Backup rollback preimage/current: `/linhhoasu/_ai_workbench/backups/tower_sweep_rollback_20261017_103148`.
- Receipt/evidence: `_ai_workbench/temp/baodian_sweep_20261017/rollback.json`; initial readback parser gặp logger prefix, bounded readback sau đó PASS và chốt `ROLLED_BACK_VERIFIED`.
