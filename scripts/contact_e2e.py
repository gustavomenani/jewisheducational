import time
from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:5173"
API_URL = "http://127.0.0.1:3000/api"
CLIENT_EMAIL = "jewisheducationalresources1@gmail.com"


def main():
    unique_message = f"Codex contact verification {int(time.time())}"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")

        page.locator('input[type="email"]').fill("admin@example.com")
        page.locator('input[type="password"]').fill("admin123")
        page.get_by_role("button", name="Log in", exact=True).click()
        try:
            page.wait_for_url("**/admin", timeout=10000)
        except Exception as exc:
            alert = page.locator(".alert-danger")
            message = alert.first.text_content() if alert.count() else "No visible login error"
            raise AssertionError(
                f"Login did not reach /admin. URL={page.url}; message={message}"
            ) from exc

        token = page.evaluate("localStorage.getItem('token')")
        headers = {"Authorization": f"Bearer {token}"}
        original_settings = page.request.get(f"{API_URL}/settings").json().get("settings", {})

        try:
            page.goto(f"{BASE_URL}/admin/settings")
            page.wait_for_load_state("networkidle")
            page.get_by_label("Notification email").fill(CLIENT_EMAIL)
            page.get_by_label("Redirect after submission").fill("/library")
            page.get_by_label("Redirect delay (seconds)").fill("0")
            page.get_by_role("button", name="Save settings").click()
            page.get_by_text("Settings saved successfully.").wait_for()

            configure_response = page.request.put(
                f"{API_URL}/settings",
                headers=headers,
                data={
                    "settings": {
                        "contact_notify_email": CLIENT_EMAIL,
                        "contact_redirect_url": "/library",
                        "contact_redirect_delay": "0",
                        "block_contact_show": "true",
                    }
                },
            )
            assert configure_response.ok, configure_response.text()

            page.goto(BASE_URL)
            page.wait_for_load_state("networkidle")
            page.locator("#contact-name").wait_for()
            page.locator("#contact-name").fill("Codex Verification")
            page.locator("#contact-email").fill("verification@example.com")
            page.locator("#contact-message").fill(unique_message)
            page.locator(".k5-contact-form").get_by_role("button", name="Submit").click()
            page.wait_for_url("**/library")

            page.goto(f"{BASE_URL}/admin/contact-messages")
            page.wait_for_load_state("networkidle")
            page.get_by_role("heading", name="Contact Messages").wait_for()
            page.get_by_text(unique_message, exact=True).first.click()

            page.get_by_role("button", name="Mark as read").click()
            page.get_by_role("button", name="Mark as unread").wait_for()
            page.get_by_role("button", name="Mark as unread").click()
            page.get_by_role("button", name="Mark as read").wait_for()

            reply = page.get_by_role("link", name="Reply")
            assert reply.get_attribute("href") == "mailto:verification@example.com"

            page.once("dialog", lambda dialog: dialog.accept())
            page.get_by_role("button", name="Delete").click()
            page.wait_for_function(
                "(text) => !document.body.innerText.includes(text)",
                arg=unique_message,
            )

            print("CONTACT_E2E_OK")
            print("settings_saved=true")
            print("safe_redirect=true")
            print("message_inbox=true")
            print("read_unread=true")
            print("reply_link=true")
            print("delete=true")
        finally:
            restore = {
                "contact_notify_email": original_settings.get(
                    "contact_notify_email", CLIENT_EMAIL
                ),
                "contact_redirect_url": original_settings.get(
                    "contact_redirect_url", ""
                ),
                "contact_redirect_delay": str(
                    original_settings.get("contact_redirect_delay", "0")
                ),
                "block_contact_show": original_settings.get(
                    "block_contact_show", "false"
                ),
            }
            page.request.put(
                f"{API_URL}/settings",
                headers=headers,
                data={"settings": restore},
            )

            inbox = page.request.get(
                f"{API_URL}/admin/contact-messages", headers=headers
            )
            if inbox.ok:
                for message in inbox.json().get("messages", []):
                    if message.get("message") == unique_message:
                        page.request.delete(
                            f"{API_URL}/admin/contact-messages/{message['id']}",
                            headers=headers,
                        )
            browser.close()


if __name__ == "__main__":
    main()
