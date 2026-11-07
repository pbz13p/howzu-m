// 好租 Howzu：房源一键分享（海报图 + 微信文案 + 小红书文案 + 系统分享）
(function () {
  const SITE = "https://howzu.com.au";
  const css = `
  .sh-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;display:flex;align-items:flex-end;justify-content:center}
  @media(min-width:721px){.sh-mask{align-items:center}}
  .sh{background:#fff;width:100%;max-width:520px;border-radius:18px 18px 0 0;max-height:92vh;overflow:auto;padding:16px 16px calc(16px + env(safe-area-inset-bottom))}
  @media(min-width:721px){.sh{border-radius:18px}}
  .sh h3{margin:0 0 10px;font-size:17px;display:flex;justify-content:space-between;align-items:center}
  .sh h3 button{border:0;background:#f1efe8;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer}
  .sh .poster{width:100%;border-radius:12px;display:block;background:#f1efe8;min-height:200px}
  @media(min-width:721px){.sh .poster{max-height:46vh;object-fit:contain}}
  .sh .grid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px}
  .sh .grid button{border:1px solid #e4e1d8;background:#fff;border-radius:12px;padding:12px 8px;font-size:14px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;color:#1d2321}
  .sh .grid button b{font-size:22px;line-height:1}
  .sh .grid button.main{grid-column:1/-1;background:#0f6b4f;color:#fff;border-color:#0f6b4f;flex-direction:row;justify-content:center;font-size:16px;font-weight:600}
  .sh .grid button.main small{display:block;font-size:12px;font-weight:400;opacity:.85;margin-top:2px}
  .sh .grid button.xhs{background:#ff2442;border-color:#ff2442}
  .sh .more{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .sh .more button{border:1px solid #e4e1d8;background:#fff;border-radius:16px;padding:6px 12px;font-size:13px;cursor:pointer;color:#1d2321}
  .sh .more[hidden]{display:none}
  .sh .moreT{display:inline-block;margin-top:10px;font-size:13px;color:#6b726f;text-decoration:none}
  .sh .step{margin-top:10px;background:#e8f3ee;border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.7;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  .sh .step[hidden]{display:none}
  .sh .step .qr canvas{width:120px;height:120px;display:block;border-radius:8px}
  .sh .step kbd{background:#fff;border:1px solid #cfd8d3;border-radius:4px;padding:0 5px;font-size:12px}
  .sh .step .next{margin-top:6px;border:0;background:#0f6b4f;color:#fff;border-radius:10px;padding:8px 14px;font-size:14px;cursor:pointer}
  .sh .box{margin-top:10px;background:#f6f4ef;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:12px}
  .sh .box[hidden]{display:none}
  .sh .box .row{display:flex;gap:10px;align-items:flex-start}
  .sh .box .no{flex:none;width:24px;height:24px;border-radius:50%;background:#0f6b4f;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;font-weight:600}
  .sh .box .st{font-size:13px;color:#0f6b4f;margin:2px 0 6px}
  .sh .box textarea{width:100%;font:13px/1.6 inherit;font-family:inherit;border:1px solid #e4e1d8;border-radius:8px;padding:8px;background:#fff;resize:none;user-select:text;-webkit-user-select:text}
  .sh .box .cp{margin-top:6px;border:0;background:#0f6b4f;color:#fff;border-radius:10px;padding:8px 14px;font-size:14px;cursor:pointer}
  .sh .tip{font-size:12px;color:#6b726f;margin-top:10px;line-height:1.6}
  .sh-toast{position:fixed;left:50%;bottom:40px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:10px 16px;border-radius:10px;z-index:200;font-size:14px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function toast(t) { const d = document.createElement("div"); d.className = "sh-toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
  async function copy(t) { try { await navigator.clipboard.writeText(t); return true; } catch (_) { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); const ok = document.execCommand("copy"); a.remove(); return ok; } }
  const url = x => `${SITE}/rentals.html?id=${encodeURIComponent(x.id)}`;
  const area = x => x.suburb || (String(x.address || "").split(",")[1] || "墨尔本").trim();
  const roomTxt = x => [x.beds != null ? `${x.beds}房` : "", x.baths != null ? `${x.baths}卫` : "", x.cars ? `${x.cars}车位` : ""].join("");

  function wechatText(x) {
    return [`🏠 ${x.title}`, `📍 ${x.address}`, x.rentWeekly ? `💰 $${x.rentWeekly}/周` : "", roomTxt(x) ? `🛏 ${roomTxt(x)}` : "", x.available ? `🔑 ${x.available}入住` : "",
      (x.highlights || []).length ? `✨ ${x.highlights.join(" · ")}` : "", `👉 更多照片、对口学区：${url(x)}`].filter(Boolean).join("\n");
  }
  // 小红书：不放链接（外链会被限流），用话题标签
  function xhsText(x) {
    const a = area(x).replace(/\s+/g, "");
    return [`${x.title}✨`, "", `📍 ${a}`, x.rentWeekly ? `💰 每周 $${x.rentWeekly}` : "", roomTxt(x) ? `🛏 ${roomTxt(x)}` : "", x.available ? `🔑 ${x.available}入住` : "",
      ...(x.highlights || []).map(h => `✅ ${h}`), "", "想看房的宝子私信我～", "",
      `#墨尔本租房 #墨尔本找房 #${a}租房 #墨尔本留学 #澳洲租房`].filter((v, i, arr) => v !== "" || arr[i - 1] !== "").join("\n");
  }

  function loadImg(src) { return new Promise((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
  function qrCanvas(text, size) {
    if (!window.qrcode) return null;
    const q = qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(), c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"), cell = size / (n + 2); g.fillStyle = "#fff"; g.fillRect(0, 0, size, size); g.fillStyle = "#1d2321";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(Math.floor((k + 1) * cell), Math.floor((r + 1) * cell), Math.ceil(cell), Math.ceil(cell));
    return c;
  }
  function wrap(g, text, maxW) { const out = []; let line = ""; for (const ch of text) { if (g.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  async function poster(x) {
    const W = 1080, H = 1440, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const F = '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    const photos = (x.photos || []).slice(0, 3); const imgs = await Promise.all(photos.map(loadImg));
    const cover = (im, dx, dy, dw, dh) => { if (!im) { g.fillStyle = "#e8f3ee"; g.fillRect(dx, dy, dw, dh); return; } const s = Math.max(dw / im.width, dh / im.height), sw = dw / s, sh = dh / s; g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, dx, dy, dw, dh); };
    if (imgs.length >= 3) { cover(imgs[0], 0, 0, W, 640); cover(imgs[1], 0, 646, W / 2 - 3, 300); cover(imgs[2], W / 2 + 3, 646, W / 2 - 3, 300); }
    else cover(imgs[0], 0, 0, W, 946);
    // brand tag
    g.fillStyle = "rgba(15,107,79,.92)"; rr(g, 36, 36, 250, 64, 32); g.fill(); g.fillStyle = "#fff"; g.font = `600 30px ${F}`; g.fillText("好租 Howzu", 66, 79);
    let y = 1045;
    g.fillStyle = "#0f6b4f"; g.font = `700 76px ${F}`; g.fillText(x.rentWeekly ? `$${x.rentWeekly}` : "租金面议", 60, y);
    if (x.rentWeekly) { const w = g.measureText(`$${x.rentWeekly}`).width; g.fillStyle = "#6b726f"; g.font = `400 34px ${F}`; g.fillText(" / 周", 60 + w, y); }
    y += 62; g.fillStyle = "#1d2321"; g.font = `600 42px ${F}`;
    wrap(g, x.title || "", W - 360).slice(0, 2).forEach(l => { g.fillText(l, 60, y); y += 54; });
    g.fillStyle = "#6b726f"; g.font = `400 30px ${F}`; g.fillText(`📍 ${area(x)}　🛏 ${roomTxt(x)}`, 60, y + 4); y += 52;
    // chips
    let cx = 60; g.font = `500 28px ${F}`;
    for (const t of [x.available ? `${x.available}入住` : "", ...(x.highlights || [])].filter(Boolean).slice(0, 4)) {
      const w = g.measureText(t).width + 36; if (cx + w > W - 300) break;
      g.fillStyle = "#e8f3ee"; rr(g, cx, y, w, 50, 25); g.fill(); g.fillStyle = "#0f6b4f"; g.fillText(t, cx + 18, y + 35); cx += w + 12;
    }
    // QR
    const q = qrCanvas(url(x), 220); if (q) { g.drawImage(q, W - 280, 1010, 220, 220); }
    g.fillStyle = "#6b726f"; g.font = `400 24px ${F}`; g.textAlign = "center"; g.fillText("扫码看全部照片 · 查学区", W - 170, 1262); g.textAlign = "left";
    g.fillStyle = "#0f6b4f"; g.fillRect(0, H - 90, W, 90); g.fillStyle = "#fff"; g.font = `500 32px ${F}`; g.textAlign = "center";
    g.fillText("howzu.com.au · 墨尔本租房 · 学区 · 中文服务", W / 2, H - 34); g.textAlign = "left";
    return c;
  }

  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  async function photoFiles(x, n) {
    const out = [];
    for (const [i, p] of (x.photos || []).slice(0, n).entries()) {
      try { const r = await fetch(p); if (!r.ok) continue; const b = await r.blob(); out.push(new File([b], `好租-${i + 1}.jpg`, { type: b.type || "image/jpeg" })); } catch (_) {}
    }
    return out;
  }
  function download(file) { const l = document.createElement("a"); l.href = URL.createObjectURL(file); l.download = file.name; document.body.appendChild(l); l.click(); l.remove(); }

  async function open(x) {
    const text = wechatText(x);
    const m = document.createElement("div"); m.className = "sh-mask";
    m.innerHTML = `<div class="sh"><h3>转发这套房 <button aria-label="关闭">✕</button></h3><img class="poster" alt="房源海报">
      <div class="grid"><button class="main" data-a="go"><span>📤 一键转发<small>发微信、朋友圈或任何 App</small></span></button></div>
      <div class="box" id="shBox" hidden>
        <div class="row"><span class="no">1</span><div><b>发图片</b><div class="st" id="stImg"></div></div></div>
        <div class="row"><span class="no">2</span><div style="flex:1"><b>发文字</b><div class="st" id="stTxt"></div>
          <textarea readonly rows="7">${text.replace(/</g, "&lt;")}</textarea><button class="cp" data-a="txt">复制文字</button></div></div>
      </div>
      <a class="moreT" href="#">其他方式 ›</a><div class="more" hidden><button data-a="save">下载海报</button><button data-a="link">复制链接</button></div></div>`;
    document.body.appendChild(m);
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("h3 button")) m.remove(); });
    let poster_ = null, png = null;
    const ready = (async () => {
      const c = await poster(x);
      try { const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.9)); m.querySelector(".poster").src = URL.createObjectURL(blob);
        poster_ = new File([blob], `好租-${(x.title || "房源").slice(0, 20)}.jpg`, { type: "image/jpeg" }); } catch (_) {}
      try { png = await new Promise(r => c.toBlob(r, "image/png")); } catch (_) {}
    })();
    const $ = q => m.querySelector(q);
    const longPress = isMobile ? "长按上面的海报图 → 发送给朋友 / 存到相册" : "在上面的海报图上点右键 → 复制图片，去微信按 Ctrl+V";
    m.addEventListener("click", async e => {
      if (e.target.closest(".moreT")) { e.preventDefault(); $(".more").hidden = false; e.target.remove(); return; }
      const a = e.target.closest("button")?.dataset.a; if (!a) return;
      if (a === "go") {
        if (!poster_) { toast("海报还在生成，稍等一秒"); await ready; }
        const copied = await copy(text);
        $("#shBox").hidden = false;
        $("#stTxt").textContent = copied ? "✓ 已自动复制，在聊天框里长按 → 粘贴（电脑按 Ctrl+V）" : "点下面「复制文字」，或长按文字全选复制";
        $("#stImg").textContent = longPress;
        $("#shBox").scrollIntoView({ block: "nearest", behavior: "smooth" });
        if (isMobile && poster_ && navigator.canShare && navigator.canShare({ files: [poster_] })) {
          try { await navigator.share({ files: [poster_] }); $("#stImg").textContent = "✓ 海报已发出。接着发一条文字（已复制好）"; }
          catch (err) { if (!err || err.name !== "AbortError") $("#stImg").textContent = longPress; }
        } else if (!isMobile && png && window.ClipboardItem && window.isSecureContext) {
          try { await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]); $("#stImg").textContent = "✓ 海报已复制，去微信按 Ctrl+V 发送。再回来点「复制文字」"; $("#stTxt").textContent = "发完图片后，点「复制文字」，再去微信按 Ctrl+V"; } catch (_) {}
        }
        return;
      }
      if (a === "txt") { const ok = await copy(text); if (!ok) { const t = $("textarea"); t.focus(); t.select(); } $("#stTxt").textContent = "✓ 文字已复制，去聊天框粘贴"; toast("文字已复制"); }
      if (a === "link") { await copy(url(x)); toast("链接已复制"); }
      if (a === "save") { await ready; if (poster_) download(poster_); }
    });
  }
  window.HowzuShare = { open };
})();
