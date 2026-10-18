# 山門長生錄（暫名）

單機修仙宗門經營遊戲，電腦瀏覽器優先。目前階段：**P1 人界前期・批次 A（區域與四傳承）**。

## 怎麼玩

- **線上（建議）**：開啟 GitHub Pages 網址（啟用後見下方「發布」）。
- **自己電腦**：安裝 [Node.js](https://nodejs.org) 22 版，在專案資料夾執行：

  ```
  npm install
  npm run dev
  ```

  再用 Chrome 或 Edge 開啟畫面上顯示的網址（通常是 http://localhost:5173 ）。

存檔存在瀏覽器裡，綁定網址。不要用無痕模式，並定期在「存檔」頁匯出備份。

## 開發指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發模式（含開發工具面板） |
| `npm run build` | 型別檢查並建置正式版到 `dist/` |
| `npm test` | 引擎與存檔的自動測試 |
| `npm run test:e2e` | 用瀏覽器跑 P0 與 P1 流程並截圖到 `test-results/` |
| `npm run simulate -- 100 12345` | 自動玩 100 年，檢查資源不為負並輸出里程碑 |

## 專案結構

| 位置 | 內容 |
|---|---|
| `src/engine/` | 遊戲規則（純 TypeScript，不依賴畫面，不用 Math.random） |
| `src/content/` | 內容資料：區域、建築、丹方、敵人、秘境、傳承、靈獸、姓名、平衡數值 |
| `src/save/` | 存檔格式、驗證、遷移、IndexedDB |
| `src/ui/` | React 畫面 |
| `src/dev/` | 開發工具（正式建置不包含） |
| `assets/` | 圖片；`placeholder/` 為臨時素材 |
| `tools/` | 模擬器、自動玩家、臨時圖產生器 |
| `tests/` | 單元測試與瀏覽器流程測試 |

## 文件

- [企畫書](docs/修仙宗門遊戲企畫書.md)
- [第一輪審閱與 P0 提案](docs/企畫書審閱與P0提案_v1.md)
- [P1 規劃](docs/P1規劃.md)
- [開發進度](docs/開發進度.md)
- [暫定數值與決策](docs/暫定數值與決策.md)
- [素材清單](docs/素材清單.md)

## 發布

`main` 分支更新後，GitHub Actions 會自動建置並發布到 GitHub Pages。第一次需要到 repo 的 **Settings → Pages**，把 **Source** 設為 **GitHub Actions**。
