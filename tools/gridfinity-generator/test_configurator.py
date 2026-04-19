"""Test finger slide feature in the Gridfinity Bin Configurator."""
from playwright.sync_api import sync_playwright

SCREENSHOTS_DIR = "C:/tmp"

def wait_for_preview(page, timeout=180000):
    try:
        page.wait_for_selector('#status.loading', timeout=5000)
    except:
        pass
    page.wait_for_selector('#status.loading', state='hidden', timeout=timeout)
    page.wait_for_timeout(1000)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    page.goto('http://localhost:5000')
    page.wait_for_load_state('domcontentloaded')

    # 1) Initial load
    print("Waiting for initial preview...")
    wait_for_preview(page)

    # 2) Set finger slide to rounded on front wall, generate
    print("Setting finger slide to rounded...")
    page.evaluate("""() => {
        const el = document.getElementById('fingerslide-style');
        el.value = 'rounded';
        el.dispatchEvent(new Event('change'));
    }""")
    page.locator('#preview-btn').click()
    wait_for_preview(page)
    page.screenshot(path=f'{SCREENSHOTS_DIR}/01_fingerslide_rounded.png')
    print("Screenshot 1: Rounded finger slide on front wall")

    # 3) Switch to chamfered, add back wall too
    print("Switching to chamfered, front+back...")
    page.evaluate("""() => {
        document.getElementById('fingerslide-style').value = 'chamfered';
        // Enable back wall too
        document.querySelectorAll('#fingerslide-walls .wall-btn')[1].classList.add('active');
    }""")
    page.locator('#preview-btn').click()
    wait_for_preview(page)
    page.screenshot(path=f'{SCREENSHOTS_DIR}/02_fingerslide_chamfered_fb.png')
    print("Screenshot 2: Chamfered finger slide on front+back")

    print("\nAll tests complete!")
    browser.close()
