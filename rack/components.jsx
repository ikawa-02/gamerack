// rack/components.jsx
// Game Rack（Retro CRT）の表示コンポーネント群。
// 依存グローバル: React, ReactDOM, SAMPLE_GAMES, GENRES, PLATFORMS, STATUSES, I18N

const { useState, useEffect, useRef, useMemo } = React;

// 言語キーから訳語を取得するヘルパー
const t = (lang, key) => (window.I18N[lang] && window.I18N[lang][key]) || key;
// ジャンルID → ジャンル定義
const genreOf = (id) => window.GENRES.find((g) => g.id === id);
// ステータスID → ステータス定義
const statusOf = (id) => window.STATUSES.find((s) => s.id === id);

// UTF-8 文字列を URL セーフな base64（base64url）に変換する。
// `unescape(encodeURIComponent())` の組み合わせで日本語などのマルチバイト文字を
// バイト列化してから btoa する古典的な互換手法。共有URLに JSON を載せる用途で使う。
function b64urlEncode(str) {
  const utf8 = unescape(encodeURIComponent(str));
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// 上記の逆変換。pad と +/_ の置換を戻してから atob → UTF-8 デコード
function b64urlDecode(b64url) {
  const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4));
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return decodeURIComponent(escape(atob(b64)));
}
// rack 全体（games + tweaks）を共有URLに載せる文字列にエンコード
function encodeShareData(games, tweaks) {
  const payload = { v: 1, games, tweaks };
  return b64urlEncode(JSON.stringify(payload));
}
// 共有URL の hash 文字列をデコードしてオブジェクト化。形式不正なら null
function decodeShareData(b64url) {
  try {
    const parsed = JSON.parse(b64urlDecode(b64url));
    if (!parsed || !Array.isArray(parsed.games)) return null;
    return parsed;
  } catch (_) { return null; }
}
window.b64urlEncode = b64urlEncode;
window.b64urlDecode = b64urlDecode;
window.encodeShareData = encodeShareData;
window.decodeShareData = decodeShareData;

// 画像を Canvas で最大辺 maxSize 以下に縮小し、JPEG に再エンコードして DataURL を返す。
// 4K 写真などをそのまま base64 で localStorage に入れると数MB→上限超過するための予防処理。
function compressImage(file, maxSize = 1024, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) { reject(err); }
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}
window.compressImage = compressImage;

// プラットフォーム別の背表紙CSS変数。
// --spine-color        : スパイン本体の背景色
// --spine-cap-bg       : 上部キャップの背景色
// --spine-foot-bg      : 下部フッターの背景色
// --spine-title-color  : タイトルテキスト色
// --spine-plat-bg      : プラットフォームバッジ背景色
// --spine-plat-color   : プラットフォームバッジ文字色
const PLATFORM_SPINE_VARS = {
  'PS5':    { '--spine-color': '#0a0a0a', '--spine-cap-bg': '#003087', '--spine-foot-bg': '#003087', '--spine-title-color': '#ffffff', '--spine-plat-bg': '#003087', '--spine-plat-color': '#ffffff' },
  'PS4':    { '--spine-color': '#1a1a2e', '--spine-cap-bg': '#003087', '--spine-foot-bg': '#1a1a2e', '--spine-title-color': '#a8c8ff', '--spine-plat-bg': '#003087', '--spine-plat-color': '#ffffff' },
  'Switch': { '--spine-color': '#e60012', '--spine-cap-bg': '#111111', '--spine-foot-bg': '#111111', '--spine-title-color': '#ffffff', '--spine-plat-bg': '#111111', '--spine-plat-color': '#ffdd00' },
  'Xbox':   { '--spine-color': '#000000', '--spine-cap-bg': '#107c10', '--spine-foot-bg': '#000000', '--spine-title-color': '#ffffff', '--spine-plat-bg': '#107c10', '--spine-plat-color': '#ffffff' },
  'PC':     { '--spine-color': '#1b2838', '--spine-cap-bg': '#2a475e', '--spine-foot-bg': '#2a475e', '--spine-title-color': '#c7d5e0', '--spine-plat-bg': '#2a475e', '--spine-plat-color': '#c7d5e0' },
  'Mobile': { '--spine-color': '#f0f4f9', '--spine-cap-bg': '#4285f4', '--spine-foot-bg': '#4285f4', '--spine-title-color': '#1a1a1a', '--spine-plat-bg': '#4285f4', '--spine-plat-color': '#ffffff' },
};

// 評価の星表示（n=点灯数, max=満点）
function Stars({ n, max = 5 }) {
  return (
    <span className="rating-stars">
      {Array.from({ length: max }).map((_, i) =>
        <span key={i} className={i < n ? '' : 'empty'}>{i < n ? '★' : '☆'}</span>
      )}
    </span>
  );
}

// 削除確認ダイアログ。Esc/Enter で操作可能。single=true で OK のみの一ボタン表示
function ConfirmDialog({ open, title, message, target, confirmLabel, cancelLabel, onConfirm, onCancel, lang, single }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') (single ? onConfirm : onCancel)();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm, single]);

  if (!open) return null;
  return (
    <div className="confirm-overlay" onClick={single ? onConfirm : onCancel}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="head">⚠ {lang === 'ja' ? '確認' : 'CONFIRM'}</div>
        <div className="body">
          <div className="title">{title}</div>
          <div className="msg">{message}</div>
          {target && <div className="target">▸ {target}</div>}
        </div>
        <div className="foot">
          {!single && (
            <button className="pixel-btn ghost small" onClick={onCancel}>{cancelLabel || (lang === 'ja' ? 'キャンセル' : 'Cancel')}</button>
          )}
          <button className="pixel-btn primary small" onClick={onConfirm}>{confirmLabel || (lang === 'ja' ? '削除' : 'Delete')}</button>
        </div>
      </div>
    </div>
  );
}

// 背表紙コンポーネント。クリックでフリップ詳細表示に切り替わる
// CATALOG モード時にパッケージ画像を背景に出すため、game.image があれば
// --spine-image を CSS 変数として渡す。SPINES/TILTED 表示では使われない。
// draggable と drag 系ハンドラ、className は Shelf 側から並び替えのために注入される
function Spine({ game, onClick, lang, draggable, onDragStart, onDragOver, onDragLeave, onDragEnd, onDrop, className }) {
  const title = lang === 'en' ? game.title_en : game.title;
  // プラットフォーム変数を優先し、game.color はプラットフォーム未定義時のフォールバック
  const platVars = PLATFORM_SPINE_VARS[game.platform] || {};
  const style = { '--spine-color': game.color, ...platVars };
  if (game.image) style['--spine-image'] = `url(${game.image})`;
  return (
    <div
      className={`spine${className ? ' ' + className : ''}`}
      style={style}
      data-pattern={game.spineStyle}
      data-status={game.status}
      data-has-image={game.image ? 'true' : 'false'}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      onClick={onClick}
      title={title}
    >
      <div className="status-dot"></div>
      <div className="spine-cap"></div>
      <div className="spine-title">{title}</div>
      <div className="spine-platform">{game.platform}</div>
      <div className="spine-foot"></div>
    </div>
  );
}

// 棚内に展開される詳細カード（フリップアニメーション付き）
// readOnly=true の場合は編集・削除ボタンを描画しない（共有URL閲覧モード用）
function FlipCard({ game, onClose, onEdit, onDelete, lang, readOnly }) {
  const title = lang === 'en' ? game.title_en : game.title;
  const g = genreOf(game.genre);
  const s = statusOf(game.status);
  return (
    <div className="flip-card flipped">
      <div className="flip-card-front" style={{ '--card-color': game.color }}>
        <button className="close-x" onClick={onClose}>×</button>
        <div className="case-art" style={{ background: game.image ? `url(${game.image}) center/cover` : game.color }}>
          {!game.image && <>
            <div className="case-title">{title}</div>
            <div className="case-noimg">{t(lang, 'noImage')}</div>
          </>}
        </div>
        <div className="info">
          <h3>{title}</h3>
          <div className="row"><span>{t(lang, 'fGenre')}</span><b>{g ? (lang === 'en' ? g.en : g.ja) : '-'}</b></div>
          <div className="row"><span>{t(lang, 'fPlatform')}</span><b>{game.platform}</b></div>
          <div className="row"><span>{t(lang, 'released')}</span><b>{game.released}</b></div>
          <div className="row"><span>{t(lang, 'playtime')}</span><b>{game.playtime}{t(lang, 'hours')}</b></div>
          <div className="row"><span>{t(lang, 'fStatus')}</span><b style={{ color: s ? s.color : 'inherit' }}>{s ? (lang === 'en' ? s.en : s.ja) : '-'}</b></div>
          <div className="row"><span>{t(lang, 'rating')}</span><b><Stars n={game.rating} /></b></div>
          {!readOnly && (
            <div className="actions">
              <button className="pixel-btn small" onClick={onEdit}>{t(lang, 'edit')}</button>
              <button className="pixel-btn small danger" onClick={onDelete}>{t(lang, 'delete')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// グリッド表示時のカード（パッケージアートを正面表示）
function GridCard({ game, onClick, lang }) {
  const title = lang === 'en' ? game.title_en : game.title;
  const g = genreOf(game.genre);
  return (
    <div className="grid-card" onClick={onClick}>
      <div className="case-art" style={{ background: game.image ? `url(${game.image}) center/cover` : game.color, '--card-color': game.color }}>
        {!game.image && <div className="case-title">{title}</div>}
      </div>
      <div className="meta">
        <h4>{title}</h4>
        <div className="sub"><span>{game.platform}</span><span>{game.playtime}{t(lang, 'hours')}</span></div>
        <div className="sub"><span>{g ? (lang === 'en' ? g.en : g.ja) : ''}</span><Stars n={game.rating} /></div>
      </div>
    </div>
  );
}

// 棚（ラベル＋本棚＋木目の板）
// readOnly は FlipCard の編集・削除ボタン抑制用に下層へ素通しする。
// dragId / setDragId / onReorder は HTML5 ドラッグ＆ドロップで棚内の並び替えを行うために App から注入される。
// 棚跨ぎのドロップは genre 変更の意味になってしまい混乱するので、各棚は自分が抱える games 配列に
// dragId が含まれている時だけドロップを許可する（cross-shelf は dragover を preventDefault しないので
// ブラウザのデフォルト挙動でドロップが受け付けられない）。
function Shelf({ label, games, openId, onOpen, onClose, onEdit, onDelete, lang, readOnly, dragId, setDragId, onReorder }) {
  const [overId, setOverId] = useState(null);
  // この棚がドラッグ中の対象を含んでいるか（cross-shelf 判定用）
  const ownsDragged = dragId != null && games.some((g) => g.id === dragId);

  // ドラッグ系ハンドラ。Spine ごとに id をクロージャで束縛して返すファクトリ
  const handleDragStart = (gid) => (e) => {
    if (readOnly || !setDragId) { e.preventDefault(); return; }
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(gid));
    } catch (_) { /* dataTransfer が使えない環境向けフォールバック */ }
    setDragId(gid);
  };
  const handleDragOver = (gid) => (e) => {
    if (readOnly) return;
    if (!ownsDragged) return; // 他の棚の要素は受け付けない
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    if (overId !== gid) setOverId(gid);
  };
  const handleDragLeave = (gid) => () => {
    if (overId === gid) setOverId(null);
  };
  const handleDragEnd = () => {
    if (setDragId) setDragId(null);
    setOverId(null);
  };
  const handleDrop = (gid) => (e) => {
    if (readOnly) return;
    if (!ownsDragged) return;
    e.preventDefault();
    let draggedId = dragId;
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (raw) draggedId = Number(raw) || draggedId;
    } catch (_) {}
    if (onReorder && draggedId && draggedId !== gid) onReorder(draggedId, gid);
    if (setDragId) setDragId(null);
    setOverId(null);
  };

  return (
    <div>
      <div className="shelf-label">▸ {label} <span style={{ opacity: 0.6, marginLeft: 6 }}>[{games.length}]</span></div>
      <div className="shelf">
        <div className="books">
          {games.map((g) => {
            if (openId === g.id) {
              return <FlipCard key={g.id} game={g} lang={lang} readOnly={readOnly}
                onClose={onClose}
                onEdit={() => onEdit && onEdit(g)}
                onDelete={() => onDelete && onDelete(g)} />;
            }
            const isDragging = dragId === g.id;
            const isOver = overId === g.id && ownsDragged && dragId !== g.id;
            const cls = `${isDragging ? 'is-dragging' : ''}${isOver ? ' is-drop-target' : ''}`.trim();
            return <Spine key={g.id} game={g} lang={lang}
              onClick={() => onOpen(g.id)}
              draggable={!readOnly}
              onDragStart={handleDragStart(g.id)}
              onDragOver={handleDragOver(g.id)}
              onDragLeave={handleDragLeave(g.id)}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop(g.id)}
              className={cls}
            />;
          })}
          {games.length === 0 && Array.from({ length: 6 }).map((_, i) => <div className="empty-slot" key={i}/>)}
        </div>
        <div className="plank"></div>
      </div>
    </div>
  );
}

// ゲーム追加・編集用のサイドパネルフォーム
function FormPanel({ open, onClose, onSave, editing, lang }) {
  const empty = { title: '', title_en: '', genre: 'rpg', platform: 'PS5', released: '', playtime: 0, status: 'playing', rating: 3, color: '#ff3da5', image: null, spineStyle: 'stripe' };
  const [data, setData] = useState(empty);
  const [confirmDel, setConfirmDel] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef(null);

  // 編集モードに入った時はそのゲームの値を、新規時は空に
  useEffect(() => {
    if (editing) setData({ ...empty, ...editing });
    else setData(empty);
  }, [editing, open]);

  // 画像ファイルを圧縮して DataURL に変換する共通処理
  const processImageFile = async (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    try {
      const dataUrl = await compressImage(f, 1024, 0.85);
      setData((d) => ({ ...d, image: dataUrl }));
    } catch (err) {
      console.error('image compression failed', err);
      const reader = new FileReader();
      reader.onload = (ev) => setData((d) => ({ ...d, image: ev.target.result }));
      reader.readAsDataURL(f);
    }
  };

  // 画像ファイル選択時に圧縮（最大1024px・JPEG q0.85）してから DataURL を保持
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    await processImageFile(f);
    e.target.value = '';
  };

  // ドラッグ＆ドロップで画像をセット
  const onDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    await processImageFile(f);
  };

  // アップロード画像のみ削除（確認ダイアログ後）
  const removeImage = () => {
    setData((d) => ({ ...d, image: null }));
    setConfirmDel(false);
  };

  // 保存処理。タイトル必須、英題未入力なら和題で代用
  const submit = () => {
    if (!data.title.trim()) return;
    onSave({
      ...data,
      title_en: data.title_en || data.title,
      id: data.id || Date.now(),
      playtime: Number(data.playtime) || 0,
      rating: Number(data.rating) || 0
    });
  };

  return (
    <>
      <div className={`panel-overlay ${open ? 'open' : ''}`} onClick={onClose}></div>
      <aside className={`side-panel ${open ? 'open' : ''}`}>
        <div className="panel-head">
          <h2>{t(lang, 'formTitle')}</h2>
          <button className="pixel-btn small" onClick={onClose}>×</button>
        </div>
        <div className="panel-body">
          <div className="field">
            <label>{t(lang, 'fImage')}</label>
            <div
              className={`upload ${data.image ? 'has-image' : ''} ${isDragOver ? 'drag-over' : ''}`}
              onClick={() => fileRef.current && fileRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={onDrop}
            >
              {data.image
                ? <img src={data.image} alt="" />
                : <>
                    <div style={{ fontFamily: 'Press Start 2P, monospace', fontSize: 10, color: 'var(--ink)' }}>{t(lang, 'noImage')}</div>
                    <div>{t(lang, 'fImageHint')}</div>
                  </>}
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} />
            </div>
            {data.image && (
              <div className="image-controls">
                <button className="pixel-btn small" onClick={(e) => { e.stopPropagation(); fileRef.current && fileRef.current.click(); }}>
                  {lang === 'ja' ? '差し替え' : 'REPLACE'}
                </button>
                <button className="pixel-btn small ghost" onClick={(e) => { e.stopPropagation(); setConfirmDel(true); }}>
                  {lang === 'ja' ? '画像を削除' : 'DELETE IMAGE'}
                </button>
              </div>
            )}
          </div>

          <div className="field">
            <label>{t(lang, 'fTitle')}</label>
            <input type="text" value={data.title} onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))} placeholder="..." />
          </div>

          <div className="field-row">
            <div className="field">
              <label>{t(lang, 'fGenre')}</label>
              <select value={data.genre} onChange={(e) => {
                const g = genreOf(e.target.value);
                setData((d) => ({ ...d, genre: e.target.value, color: g ? g.color : d.color }));
              }}>
                {window.GENRES.map((g) => <option key={g.id} value={g.id}>{lang === 'en' ? g.en : g.ja}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{t(lang, 'fPlatform')}</label>
              <select value={data.platform} onChange={(e) => setData((d) => ({ ...d, platform: e.target.value }))}>
                {window.PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>{t(lang, 'fReleased')}</label>
              <input type="date" value={data.released} onChange={(e) => setData((d) => ({ ...d, released: e.target.value }))} />
            </div>
            <div className="field">
              <label>{t(lang, 'fPlaytime')}</label>
              <input type="number" min="0" value={data.playtime} onChange={(e) => setData((d) => ({ ...d, playtime: e.target.value }))} />
            </div>
          </div>

          <div className="field">
            <label>{t(lang, 'fStatus')}</label>
            <div className="status-pills">
              {window.STATUSES.map((s) =>
                <button key={s.id} className={data.status === s.id ? 'on' : ''} onClick={() => setData((d) => ({ ...d, status: s.id }))}>
                  {lang === 'en' ? s.en : s.ja}
                </button>
              )}
            </div>
          </div>

          <div className="field">
            <label>{t(lang, 'fRating')}</label>
            <div className="rating-input">
              {[1, 2, 3, 4, 5].map((n) =>
                <button key={n} className={data.rating >= n ? 'on' : ''} onClick={() => setData((d) => ({ ...d, rating: n }))}>★</button>
              )}
            </div>
          </div>
        </div>
        <div className="panel-foot">
          <button className="pixel-btn ghost small" onClick={onClose}>{t(lang, 'cancel')}</button>
          <button className="pixel-btn primary small" onClick={submit}>{t(lang, 'save')}</button>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmDel}
        lang={lang}
        title={lang === 'ja' ? '画像を削除しますか？' : 'Delete image?'}
        message={lang === 'ja' ? 'アップロードした画像を削除します。この操作は取り消せません。' : 'The uploaded image will be removed. This cannot be undone.'}
        confirmLabel={lang === 'ja' ? '削除する' : 'DELETE'}
        cancelLabel={lang === 'ja' ? 'キャンセル' : 'CANCEL'}
        onCancel={() => setConfirmDel(false)}
        onConfirm={removeImage}
      />
    </>
  );
}

// 共有URLの表示・コピー用ダイアログ。
// url: 共有URL文字列、bytes: URLのバイト長（注意表示用）、copied: 自動コピー成功フラグ
function ShareDialog({ open, url, bytes, copied: initialCopied, onClose, lang }) {
  const taRef = useRef(null);
  const [copied, setCopied] = useState(!!initialCopied);

  useEffect(() => {
    if (!open) return;
    setCopied(!!initialCopied);
    // 開いた直後にURL全体を選択状態にしてコピーしやすくする
    setTimeout(() => {
      if (taRef.current) { taRef.current.focus(); taRef.current.select(); }
    }, 60);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, initialCopied, onClose]);

  if (!open) return null;

  // バイト長を読みやすい単位へ整形
  const sizeLabel = bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  // 8KB を超えると Discord/Slack 等で貼れない可能性があるため警告
  const tooLarge = bytes > 8 * 1024;

  // コピーボタン: navigator.clipboard が使えなければ document.execCommand('copy') で代替
  const copyNow = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        if (taRef.current) { taRef.current.select(); document.execCommand('copy'); }
      }
      setCopied(true);
    } catch (_) {
      if (taRef.current) { taRef.current.select(); }
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-card share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="head" style={{ background: 'var(--purple)' }}>
          🔗 {lang === 'ja' ? '共有URL' : 'SHARE URL'}
        </div>
        <div className="body">
          <div className="title">{t(lang, 'shareTitle')}</div>
          <div className="msg">{t(lang, 'shareMsg')}</div>
          <div className="share-meta">
            <span>{t(lang, 'shareSize')}</span>
            <span className={tooLarge ? 'warn' : ''}>{sizeLabel}</span>
          </div>
          {tooLarge && <div className="share-warn">⚠ {t(lang, 'shareSizeWarn')}</div>}
          <textarea ref={taRef} className="share-url-box" readOnly value={url}
            onFocus={(e) => e.target.select()} />
        </div>
        <div className="foot">
          <button className="pixel-btn ghost small" onClick={onClose}>
            {t(lang, 'shareClose')}
          </button>
          <button className="pixel-btn primary small" onClick={copyNow}>
            {copied ? t(lang, 'shareCopied') : t(lang, 'shareCopy')}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Spine, FlipCard, GridCard, Shelf, FormPanel, ConfirmDialog, ShareDialog, Stars, t, genreOf, statusOf });
