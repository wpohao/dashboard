# 我的知識庫 Dashboard

依主題整理的文章與分析，網站：<https://wpohao.github.io/dashboard/>

## 結構

```
knowledge-hub/
├─ Stock/                  公開主題：投資、ETF 與交易機制（一篇一個 HTML）
├─ Lab/                    公開主題：互動作品（一個子資料夾一個作品，入口 index.html）
├─ _dashboard/
│  ├─ topics.json          主題設定（名稱、圖示、來源資料夾、是否公開）
│  ├─ template.html        dashboard 版型
│  └─ build.js             掃描來源、產生 dashboard
└─ .github/workflows/pages.yml   push 到 main 後自動產生公開版並部署到 GitHub Pages
```

## 新增文章

1. 把 HTML 放進主題資料夾（例如 `Stock/`）。文章的 `<title>` 會成為列表標題，`<p class="sub">` 或 `<meta name="description">` 會成為摘要。
2. 本機預覽：`node _dashboard/build.js`（或雙擊 MyGithub 根目錄的「更新Dashboard.cmd」）。
3. `git add` → `git commit` → `git push`，GitHub Actions 會自動更新網站。

## 本機版與公開版

| 輸出 | 位置 | 內容 |
|---|---|---|
| 本機版 | `../dashboard.html`（repo 外，不進 git） | 所有主題，包含僅本機的 Travel |
| 公開版 | `index.html`（不進 git，由 Actions 產生） | 只有 `"public": true` 的主題 |

`topics.json` 中 `"public": false` 的主題（例如放在 repo 外的旅遊行程）只會出現在本機版。`build.js` 會檢查公開版只引用 repo 內的檔案，否則直接報錯中止。

## 新增公開主題

1. 在 repo 內建資料夾放文章。
2. 在 `topics.json` 加一筆 `"public": true` 的主題。
3. 在 `.github/workflows/pages.yml` 的 `Assemble site` 步驟加一行 `cp -r <資料夾> _site/`。
