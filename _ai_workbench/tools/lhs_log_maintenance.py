"""Scoped log caps. Keeps compressed tails, not full historical logs. Python 3 stdlib."""
import argparse
import datetime
import fcntl
import gzip
import json
import os
from pathlib import Path
import re
import stat
import time

BASE = Path('/linhhoasu/_ai_workbench/logs/log-maintenance')
MB = 1024 * 1024

def targets():
    pm = Path('/root/.pm2/logs')
    for name in ['lhs-s1001', 'lhs-s1002', 'lhs-real-bots', 'lhs-real-bots-s2', 'lhs-dist', 'lhs-admin']:
        for kind in ['out', 'error']:
            yield pm / (name + '-' + kind + '.log'), (16 if kind == 'error' else 64) * MB
    app = Path('/linhhoasu/lhs/newServer/logs')
    for p in sorted(app.iterdir()):
        if re.fullmatch(r'(combined|error)-\d{4}-\d{2}-\d{2}\.log', p.name):
            yield p, (16 if p.name.startswith('error') else 64) * MB
    yield Path('/www/wwwlogs/game-lhs-access.log'), 128 * MB
    yield Path('/www/wwwlogs/game-lhs-error.log'), 16 * MB

def journal(row):
    p = BASE / 'cleanup.jsonl'
    if p.exists() and p.stat().st_size > MB:
        for i in [3, 2, 1]:
            src = BASE / ('cleanup.jsonl.' + str(i))
            if src.exists():
                if i == 3:
                    src.unlink()
                else:
                    src.replace(BASE / ('cleanup.jsonl.' + str(i + 1)))
        p.replace(BASE / 'cleanup.jsonl.1')
    with p.open('a') as f:
        f.write(json.dumps(dict(at=datetime.datetime.utcnow().isoformat() + 'Z', **row)) + '\n')

def cap(path, limit, dry=False):
    if path.is_symlink() or not path.exists():
        return None
    if str(path.resolve()) != str(path):
        raise RuntimeError('UNEXPECTED_RESOLVED_PATH')
    with os.fdopen(os.open(str(path), os.O_RDWR | os.O_NOFOLLOW), 'r+b') as f:
        st = os.fstat(f.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
            raise RuntimeError('NOT_SINGLE_REGULAR_FILE')
        if st.st_size <= limit:
            return None
        row = dict(action='cap', path=str(path), beforeBytes=st.st_size, limitBytes=limit)
        if dry:
            return row
        f.seek(max(0, st.st_size - MB))
        tail = f.read(MB)
        archive = BASE / ('sample-' + str(time.time_ns() if hasattr(time, 'time_ns') else int(time.time()*1000000)) + '-' + path.name + '.gz')
        with gzip.open(str(archive), 'wb') as out:
            out.write(tail)
        with gzip.open(str(archive), 'rb') as check:
            if check.read() != tail:
                raise RuntimeError('ARCHIVE_VERIFY_FAILED')
        journal(dict(row, phase='before-truncate', sample=str(archive)))
        f.truncate(0)
        row.update(sample=str(archive), afterBytes=os.fstat(f.fileno()).st_size)
        journal(dict(row, phase='completed'))
        return row

def prune_samples():
    samples = sorted(BASE.glob('sample-*.gz'), key=lambda p: p.stat().st_mtime, reverse=True)
    total = 0
    for p in samples:
        if p.is_symlink() or not p.is_file():
            continue
        total += p.stat().st_size
        if total > 256 * MB or time.time() - p.stat().st_mtime > 7 * 86400:
            journal(dict(action='expire-sample', path=str(p), bytes=p.stat().st_size))
            p.unlink()

def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    BASE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (BASE / 'maintenance.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        before = os.statvfs('/').f_bavail * os.statvfs('/').f_frsize
        results = []
        for p, limit in targets():
            row = cap(p, limit, args.dry_run)
            if row:
                results.append(row)
        if not args.dry_run:
            prune_samples()
            after = os.statvfs('/').f_bavail * os.statvfs('/').f_frsize
            journal(dict(action='run', filesCapped=len(results), freeBefore=before, freeAfter=after))
        print(json.dumps(dict(dryRun=args.dry_run, actions=results)))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        if BASE.exists():
            journal(dict(action='failure', error=type(exc).__name__))
        raise
