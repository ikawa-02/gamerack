// shared/tweaks-panel.jsx
// Tweaks 機構の最小実装。デザインプロトタイプの useTweaks / TweaksPanel /
// TweakSection / TweakRadio をスタンドアロンで動かすための薄いシェル。
// （本来は Claude Design ホストとの postMessage プロトコル用。ここでは
//   ローカル単体動作のため、ホストが居なくても落ちないよう簡略化している）

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    background:rgba(250,249,247,.92);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.3);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.08);color:#29261b}
  .twk-fab{position:fixed;right:16px;bottom:16px;z-index:2147483645;
    width:44px;height:44px;border-radius:50%;border:0;background:#29261b;color:#fff;
    box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer;font-size:18px;line-height:1}
  .twk-fab:hover{transform:translateY(-1px)}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.08);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.18);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:24px;
    border-radius:6px;cursor:pointer;padding:4px 6px;line-height:1.2}
`;

// ── useTweaks ──────────────────────────────────────────────────────────────
// tweaks の単一ソース。setTweak('key', value) と setTweak({k:v,...}) の
// 双方を受ける。ローカル動作のため localStorage に永続化する。
function useTweaks(defaults) {
  const storageKey = '__gamerack_tweaks__';
  const [values, setValues] = React.useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch (_) { return defaults; }
  });
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = (typeof keyOrEdits === 'object' && keyOrEdits !== null)
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => {
      const next = { ...prev, ...edits };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ────────────────────────────────────────────────────────────
// 右下に常設するフローティング設定パネル。FAB ボタンで開閉する。
function TweaksPanel({ title = 'Tweaks', tweaks, setTweak, children }) {
  const [open, setOpen] = React.useState(false);

  // 子要素に tweaks/setTweak を自動注入し、TweakRadio などを簡潔に書けるようにする
  const injectedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    return React.cloneElement(child, { tweaks, setTweak });
  });

  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      {!open && (
        <button className="twk-fab" aria-label="Open tweaks" onClick={() => setOpen(true)}>⚙</button>
      )}
      {open && (
        <div className="twk-panel">
          <div className="twk-hd">
            <b>{title}</b>
            <button className="twk-x" aria-label="Close tweaks" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="twk-body">{injectedChildren}</div>
        </div>
      )}
    </>
  );
}

// ── TweakSection ──────────────────────────────────────────────────────────
// 設定項目をタイトル付きで束ねるグループ
function TweakSection({ title, label, tweaks, setTweak, children }) {
  const injectedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    return React.cloneElement(child, { tweaks, setTweak });
  });
  return (
    <>
      <div className="twk-sect">{title || label}</div>
      {injectedChildren}
    </>
  );
}

// ── TweakRadio ────────────────────────────────────────────────────────────
// セグメント型ラジオ。tweakKey 経由で tweaks/setTweak から値を読み書きする。
function TweakRadio({ tweakKey, label, options, tweaks, setTweak }) {
  const value = tweaks ? tweaks[tweakKey] : undefined;
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;
  const onPick = (v) => { if (setTweak) setTweak(tweakKey, v); };
  return (
    <div className="twk-row">
      <div className="twk-lbl"><span>{label}</span></div>
      <div className="twk-seg" role="radiogroup">
        <div className="twk-seg-thumb" style={{
          left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
          width: `calc((100% - 4px) / ${n})`
        }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio"
                  aria-checked={o.value === value}
                  onClick={() => onPick(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { useTweaks, TweaksPanel, TweakSection, TweakRadio });
