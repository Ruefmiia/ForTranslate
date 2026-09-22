import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright


CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUTPUT = Path.home() / "AppData" / "Local" / "Temp"


async def mock_api(route):
    path = route.request.url.split("?", 1)[0]
    if path.endswith("/health"):
        payload = {"status": "ok"}
    elif path.endswith("/v1/token/usage"):
        payload = {
            "unlimited": False,
            "remaining_yuan": 4.62,
            "requests": 18,
            "exhausted": False,
        }
    else:
        payload = {
            "translation": "今天见到大家真的很开心。谢谢你们一直陪在我们身边 🤍",
            "notes": ["保留了原文的亲切语气"],
            "uncertainties": [],
            "entities": ["大家"],
            "usage": {"input_tokens": 36, "output_tokens": 24},
            "cached": False,
        }
    await route.fulfill(status=200, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))


async def capture(browser, name, viewport):
    context = await browser.new_context(viewport=viewport, color_scheme="light")
    await context.add_init_script("""
      localStorage.setItem('fortranslate.pwa.token', 'qa-token');
      localStorage.setItem('fortranslate.pwa.settings', JSON.stringify({rememberToken:true,historyEnabled:true}));
    """)
    page = await context.new_page()
    await page.route("**/health", mock_api)
    await page.route("**/v1/**", mock_api)
    await page.goto("http://127.0.0.1:4173", wait_until="networkidle")
    await page.locator("#source-text").fill("วันนี้ดีใจมากที่ได้เจอทุกคน ขอบคุณที่อยู่ข้างๆ กันเสมอ 🤍")
    await page.locator("#translate-button").click()
    await page.locator("#result-content").wait_for(state="visible")
    metrics = await page.evaluate("""({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      minTouchTarget: Math.min(...[...document.querySelectorAll('button')]
        .filter(el => !el.hidden)
        .map(el => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)))
    })""")
    await page.screenshot(path=OUTPUT / f"fortranslate-pwa-{name}-qa.png", full_page=True)
    print(name, metrics)
    if metrics["scrollWidth"] > metrics["viewport"]:
        raise RuntimeError(f"{name} has horizontal overflow")
    await context.close()


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=CHROME, headless=True)
        await capture(browser, "mobile", {"width": 375, "height": 812})
        await capture(browser, "desktop", {"width": 1440, "height": 1000})
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
