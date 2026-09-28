# -*- coding: utf-8 -*-
"""
楊梅高中紅土藝術空間 — 網站資料建置程式

掃描 ../紅土藝術空間/ 下每一個期別資料夾，依檔名規則分類圖片：
  [資料夾名稱]海報[流水號].JPG
  [資料夾名稱]邀請卡正面[流水號].JPG / 邀請卡背面[流水號].JPG
  [資料夾名稱]小卡正面[流水號].JPG   / 小卡背面[流水號].JPG
產生：
  img/web/<期別>/<檔名>.webp    （瀏覽用，長邊 1600px）
  img/thumb/<期別>/<檔名>.webp  （縮圖，長邊 520px）
  data/exhibitions.js           （網站讀取的資料）
新增期別時，只要把資料夾放進「紅土藝術空間」再執行本程式（或雙擊 更新網站.bat）。
已處理過的圖片會記錄在 data/cache.json，只處理新增或修改的檔案。
可在 data/meta.json 手動補充或覆寫各期資訊（標題、展期、藝術家、介紹、分類）。
"""
import json, os, re, sys, subprocess, hashlib, time, colorsys
from PIL import Image, ImageOps, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True  # 部分掃描檔結尾略有缺損，仍可讀取

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
SRC = os.path.join(os.path.dirname(SITE), '紅土藝術空間')
DATA = os.path.join(SITE, 'data')
OCR_DIR = os.path.join(DATA, 'ocr')
TMP = os.path.join(DATA, '_ocr_tmp')
WEB_MAX, THUMB_MAX, OCR_MAX = 1600, 520, 2600

KIND_ORDER = {'海報': 0, '邀請卡': 1, '小卡': 2}
SIDE_ORDER = {'': 0, '正面': 0, '背面': 1}


def slug(folder):
    """期別代碼，例如 11501；若資料夾名稱不以數字開頭則用雜湊。"""
    m = re.match(r'(\d{4,6})', folder)
    return m.group(1) if m else 'x' + hashlib.md5(folder.encode('utf-8')).hexdigest()[:8]


def parse_folder(folder):
    m = re.match(r'^(\d{3})(\d{2})\s*[\(（](.*)[\)）]\s*$', folder)
    if m:
        year, no, title = int(m.group(1)), int(m.group(2)), m.group(3)
    else:
        m2 = re.match(r'^(\d{3})(\d{2})(.*)$', folder)
        if m2:
            year, no, title = int(m2.group(1)), int(m2.group(2)), m2.group(3).strip(' ()（）')
        else:
            year, no, title = 0, 0, folder
    title = title.rstrip(')）').strip()
    return year, no, title


def category(title):
    t = title
    if '講座' in t:
        return '講座'
    if '校友' in t:
        return '校友展'
    if re.search(r'班展|美術班|\d{3}班', t):
        return '班級展'
    if re.search(r'聯展|雙人展|\+', t):
        return '聯展'
    if re.search(r'校慶|特展|藝文月|成果展|學會|大學|愛畫繪|想像力|舞筆弄墨', t):
        return '主題特展'
    return '個展'


def parse_file(folder, fname):
    base, ext = os.path.splitext(fname)
    if ext.lower() not in ('.jpg', '.jpeg', '.png', '.webp'):
        return None
    rest = base[len(folder):] if base.startswith(folder) else base
    m = re.match(r'^\s*(海報|邀請卡|小卡)\s*(正面|背面)?\s*(\d+)?\s*$', rest)
    if not m:
        # 寬鬆比對：檔名中任意位置出現關鍵字
        m = re.search(r'(海報|邀請卡|小卡)\s*(正面|背面)?\s*(\d+)?', rest)
        if not m:
            return None
    kind, side, n = m.group(1), m.group(2) or '', int(m.group(3) or 1)
    return kind, side, n


def dominant_color(im):
    """挑出海報中出現較多、且較鮮豔的顏色，作為該期的主題色。"""
    small = im.convert('RGB').resize((64, 64))
    q = small.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:24]
    counts = sorted(q.getcolors(), reverse=True)
    best, score = None, -1
    for cnt, idx in counts:
        r, g, b = pal[idx * 3:idx * 3 + 3]
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if l < 0.12 or l > 0.92:
            continue
        sc = cnt * (0.25 + s) * (1 - abs(l - 0.5))
        if sc > score:
            best, score = (r, g, b), sc
    if not best:
        best = (156, 101, 185)
    r, g, b = best
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    # 讓顏色適合當卡片強調色：提高飽和、限制明度
    s = max(s, 0.45); l = min(max(l, 0.38), 0.55)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return '#%02x%02x%02x' % (int(r * 255), int(g * 255), int(b * 255))


def load_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def save_img(im, path, maxside, q):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    c = im.copy()
    c.thumbnail((maxside, maxside), Image.LANCZOS)
    c.save(path, 'WEBP', quality=q, method=5)
    return c.size


def run_ocr(jobs):
    if not jobs:
        return
    os.makedirs(TMP, exist_ok=True)
    lst = os.path.join(TMP, 'list.txt')
    with open(lst, 'w', encoding='utf-8') as f:
        for src, dst in jobs:
            f.write(src + '\t' + dst + '\n')
    print(f'  文字辨識 {len(jobs)} 張圖片（Windows OCR）…', flush=True)
    ps = os.path.join(HERE, 'ocr.ps1')
    r = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, '-ListFile', lst],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        print('  [警告] 文字辨識失敗，網站仍可使用，只是無法搜尋圖片內文字。')
        print(r.stderr[-800:])
    for src, _ in jobs:
        try:
            os.remove(src)
        except OSError:
            pass


def clean_ocr(lines):
    out = []
    for t in lines:
        t = re.sub(r'(?<=[㐀-鿿＀-￯])\s+(?=[㐀-鿿＀-￯])', '', t)
        t = re.sub(r'\s+', ' ', t).strip()
        if len(t) >= 2:
            out.append(t)
    return out


DATE_RE = re.compile(r'(20\d{2})\s*[./年\-]\s*(\d{1,2})\s*[./月\-]\s*(\d{1,2})')
RANGE_RE = re.compile(r'(?<!\d)(\d{1,2})\s*[·.．/／]\s*(\d{1,2})\s*[·.．]?\s*(?:\([一二三四五六日]\)\s*)?[-一~～—至]\s*'
                      r'(?:(20\d{2})\s*[·.．/／]\s*)?(\d{1,2})\s*[·.．/／]\s*(\d{1,2})(?!\d)')


def guess_period(lines, acad_year):
    """從海報文字推測展期。期別前三碼為民國年，海報未印年份時以「民國年 + 1911」補上。"""
    def ymd(y, mo, d):
        if not y:
            y = acad_year + 1911
        return '%d/%02d/%02d' % (y, mo, d)
    for t in lines:
        full = DATE_RE.findall(t)
        m = RANGE_RE.search(t.replace(' ', ' '))
        if m:
            m1, d1, y2, m2, d2 = int(m.group(1)), int(m.group(2)), m.group(3), int(m.group(4)), int(m.group(5))
            if 1 <= m1 <= 12 and 1 <= m2 <= 12 and 1 <= d1 <= 31 and 1 <= d2 <= 31:
                y1 = int(full[0][0]) if full else None
                if y1 and y1 < 2008:
                    y1 = None
                a = ymd(y1, m1, d1)
                b = ymd(int(y2) if y2 else (y1 + (1 if m2 < m1 else 0) if y1 else None), m2, d2)
                return a + ' – ' + b if b > a else a
    for t in lines:
        for y, mo, d in DATE_RE.findall(t):
            y, mo, d = int(y), int(mo), int(d)
            if 2008 <= y <= 2100 and 1 <= mo <= 12 and 1 <= d <= 31:
                return '%d/%02d/%02d' % (y, mo, d)
    return ''


def main():
    t0 = time.time()
    if not os.path.isdir(SRC):
        print('找不到圖片資料夾：', SRC); sys.exit(1)
    os.makedirs(OCR_DIR, exist_ok=True)
    cache = load_json(os.path.join(DATA, 'cache.json'), {})
    meta = load_json(os.path.join(DATA, 'meta.json'), {})
    ocr_jobs, exhibitions, new_cache = [], [], {}
    folders = sorted(d for d in os.listdir(SRC) if os.path.isdir(os.path.join(SRC, d)))
    for folder in folders:
        sid = slug(folder)
        year, no, title = parse_folder(folder)
        items = []
        for fname in sorted(os.listdir(os.path.join(SRC, folder))):
            p = parse_file(folder, fname)
            if not p:
                continue
            kind, side, n = p
            src = os.path.join(SRC, folder, fname)
            st = os.stat(src)
            key = f'{sid}/{fname}'
            stamp = f'{st.st_size}-{int(st.st_mtime)}'
            label = kind + side + (str(n))
            fid = {'海報': 'poster', '邀請卡': 'invite', '小卡': 'card'}[kind] + \
                  {'': '', '正面': 'F', '背面': 'B'}[side] + str(n)
            web = f'img/web/{sid}/{fid}.webp'
            thumb = f'img/thumb/{sid}/{fid}.webp'
            ocrf = os.path.join(OCR_DIR, f'{sid}_{fid}.json')
            c = cache.get(key)
            if not (c and c.get('stamp') == stamp and os.path.exists(os.path.join(SITE, web))
                    and os.path.exists(os.path.join(SITE, thumb))):
                print(f'  處理 {folder}/{fname}', flush=True)
                im = Image.open(src)
                im.draft('RGB', (OCR_MAX * 2, OCR_MAX * 2))
                im = ImageOps.exif_transpose(im).convert('RGB')
                w, h = save_img(im, os.path.join(SITE, web), WEB_MAX, 82)
                save_img(im, os.path.join(SITE, thumb), THUMB_MAX, 78)
                col = dominant_color(im)
                o = im.copy(); o.thumbnail((OCR_MAX, OCR_MAX), Image.LANCZOS)
                os.makedirs(TMP, exist_ok=True)
                tmpf = os.path.join(TMP, f'{sid}_{fid}.jpg')
                o.save(tmpf, 'JPEG', quality=90)
                ocr_jobs.append((tmpf, ocrf))
                c = {'stamp': stamp, 'w': w, 'h': h, 'color': col}
            elif not os.path.exists(ocrf):
                im = Image.open(src); im.draft('RGB', (OCR_MAX * 2, OCR_MAX * 2))
                im = ImageOps.exif_transpose(im).convert('RGB')
                im.thumbnail((OCR_MAX, OCR_MAX), Image.LANCZOS)
                os.makedirs(TMP, exist_ok=True)
                tmpf = os.path.join(TMP, f'{sid}_{fid}.jpg')
                im.save(tmpf, 'JPEG', quality=90)
                ocr_jobs.append((tmpf, ocrf))
            new_cache[key] = c
            items.append({'id': fid, 'kind': kind, 'side': side, 'n': n, 'label': label,
                          'file': fname, 'web': web, 'thumb': thumb, 'w': c['w'], 'h': c['h'],
                          'color': c['color'], '_ocr': ocrf})
        if not items:
            continue
        items.sort(key=lambda x: (KIND_ORDER[x['kind']], x['n'], SIDE_ORDER[x['side']]))
        exhibitions.append({'id': sid, 'folder': folder, 'year': year, 'no': no, 'title': title,
                            'items': items})

    run_ocr(ocr_jobs)

    out = []
    for e in exhibitions:
        texts = []
        for it in e['items']:
            lines = clean_ocr(load_json(it.pop('_ocr'), []))
            it['text'] = lines
            texts.extend(lines)
        m = meta.get(e['id'], {})
        cover = next((i for i in e['items'] if i['kind'] == '海報'), None) or \
            next((i for i in e['items'] if i['side'] != '背面'), e['items'][0])
        rec = {
            'id': e['id'], 'folder': e['folder'], 'year': e['year'], 'no': e['no'],
            'title': m.get('title') or e['title'],
            'category': m.get('category') or category(e['title']),
            'artist': m.get('artist', ''),
            'intro': m.get('intro', ''),
            'period': m.get('period') or guess_period(texts, e['year']),
            'periodAuto': not m.get('period'),
            'color': m.get('color') or cover['color'],
            'cover': cover['id'],
            'items': e['items'],
        }
        out.append(rec)
    out.sort(key=lambda r: (r['year'], r['no'], r['id']), reverse=True)

    # 移除已不存在的舊圖片
    keep = {os.path.normpath(os.path.join(SITE, i[k])) for r in out for i in r['items'] for k in ('web', 'thumb')}
    for sub in ('img/web', 'img/thumb'):
        for dp, _, fs in os.walk(os.path.join(SITE, sub)):
            for f in fs:
                p = os.path.normpath(os.path.join(dp, f))
                if p not in keep:
                    os.remove(p)

    with open(os.path.join(DATA, 'cache.json'), 'w', encoding='utf-8') as f:
        json.dump(new_cache, f, ensure_ascii=False, indent=0)
    stamp = time.strftime('%Y-%m-%d %H:%M')
    with open(os.path.join(DATA, 'exhibitions.js'), 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/build.py 自動產生，請勿手動修改；補充資料請編輯 data/meta.json */\n')
        f.write('window.HONGTU_BUILT = ' + json.dumps(stamp) + ';\n')
        f.write('window.HONGTU = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    # 更新 index.html 的快取版本參數
    idx = os.path.join(SITE, 'index.html')
    if os.path.exists(idx):
        with open(idx, encoding='utf-8') as f:
            html = f.read()
        v = str(int(time.time()))
        html = re.sub(r'(data/exhibitions\.js)(\?v=\d+)?', r'\1?v=' + v, html)
        with open(idx, 'w', encoding='utf-8') as f:
            f.write(html)
    try:
        os.rmdir(TMP)
    except OSError:
        pass
    n_img = sum(len(r['items']) for r in out)
    print(f'完成：{len(out)} 期展覽、{n_img} 張圖片，用時 {time.time() - t0:.0f} 秒。')


if __name__ == '__main__':
    main()
