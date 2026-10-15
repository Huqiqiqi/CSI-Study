"""Create the portable course/site archive without runtime or user data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
target = root.parent / 'RK3588_CSI互动学习网站.zip'
skip_dirs = {'.runtime', '__pycache__', 'qa', 'qa-learning', 'node_modules', '.git'}
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob('*')):
        if not file.is_file():
            continue
        relative = file.relative_to(root)
        if any(part in skip_dirs for part in relative.parts) or file.name in {'env.sh', '.env'}:
            continue
        archive.write(file, Path(root.name) / relative)
with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert not any('.runtime' in n or '__pycache__' in n for n in archive.namelist())
    print(f'{target.name}: {len(archive.namelist())} files, {target.stat().st_size} bytes, CRC verified')
