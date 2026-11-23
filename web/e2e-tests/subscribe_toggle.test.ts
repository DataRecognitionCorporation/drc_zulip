import type {ElementHandle, Page} from "puppeteer";

import * as common from "./lib/common.ts";

async function test_subscription_button(page: Page): Promise<void> {
    const all_stream_selector = "[data-tab-key='all-streams']";
    await page.waitForSelector(all_stream_selector, {visible: true});
    await page.click(all_stream_selector);
    const stream_selector = "[data-stream-name='Venice']";
    // DRC: The checkmark in the channel list is always disabled, so
    // subscribing is done with the button in the channel header.
    const row_check_selector = `${stream_selector} .check.disabled`;
    const subscribed_selector = `${row_check_selector}.checked`;
    const unsubscribed_selector = `${row_check_selector}:not(.checked)`;

    function header_button_xpath(label: string): string {
        return `xpath///*[${common.has_class_x("stream-info-title")}]//*[${common.has_class_x(
            "sub_unsub_button",
        )} and normalize-space()="${label}"]`;
    }

    async function subscribed(): Promise<ElementHandle | null> {
        await page.waitForSelector(subscribed_selector, {visible: true});
        return await page.waitForSelector(header_button_xpath("Unsubscribe"), {visible: true});
    }

    async function unsubscribed(): Promise<ElementHandle | null> {
        await page.waitForSelector(unsubscribed_selector, {visible: true});
        return await page.waitForSelector(header_button_xpath("Subscribe"), {visible: true});
    }

    // Make sure that Venice is even in our list of streams.
    await page.waitForSelector(stream_selector, {visible: true});
    await page.waitForSelector(row_check_selector, {visible: true});

    await page.click(stream_selector);

    // Clicking the disabled checkmark must not unsubscribe.
    // We assume Venice is already subscribed.
    await subscribed();
    await page.click(row_check_selector);
    await subscribed();

    // Note that we intentionally re-find the button after each click, since
    // the live-update code may replace the whole row.
    await (await subscribed())!.click();
    await (await unsubscribed())!.click();
    await (await subscribed())!.click();
    await (await unsubscribed())!.click();
    await subscribed();
}

async function subscriptions_tests(page: Page): Promise<void> {
    await common.log_in(page);
    await common.open_streams_modal(page);
    await test_subscription_button(page);
}

await common.run_test(subscriptions_tests);
