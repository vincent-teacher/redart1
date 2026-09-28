@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在更新「楊梅高中紅土藝術空間」網站資料...
echo （只會處理新增或修改過的圖片，第一次執行約需 5 分鐘）
echo.
set PYTHONIOENCODING=utf-8
python -X utf8 toolsuild.py
if errorlevel 1 (
  echo.
  echo 更新失敗，請確認已安裝 Python 與 Pillow（pip install pillow）。
) else (
  echo.
  echo 更新完成！可以開啟 index.html 瀏覽網站。
)
pause
