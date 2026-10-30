import $ from "jquery";
import * as z from "zod/mini";

import render_drc_admin_modal from "../templates/drc_admin_modal.hbs";

import * as channel from "./channel.ts";
import {csrf_token} from "./csrf.ts";
import * as dialog_widget from "./dialog_widget.ts";
import {$t_html} from "./i18n.ts";
import {current_user} from "./state_data.ts";
import * as ui_report from "./ui_report.ts";

const run_script_response_schema = z.object({
    html: z.string(),
});

function run_tool($form: JQuery): void {
    const tool = $form.attr("data-tool");
    if (tool === undefined) {
        return;
    }

    const $button = $form.find(".drc-tool-run");
    const $result = $form.find(".drc-tool-result");

    // The tool key must be sent as a POST field name (the server selects the
    // report by looking for a known key in request.POST), matching the
    // original DRC form-button convention.
    const data: Record<string, string> = {[tool]: "1"};
    for (const field of $form.serializeArray()) {
        data[field.name] = field.value;
    }
    if (csrf_token !== undefined) {
        data["csrfmiddlewaretoken"] = csrf_token;
    }

    $button.prop("disabled", true);
    $result.empty().removeClass("drc-tool-result-error");

    void channel.post({
        url: "/drc_admin/",
        data,
        success(raw_data) {
            const response = run_script_response_schema.parse(raw_data);
            // The result is HTML built by our own admin-only server view
            // (CSV-to-table fragments), so it is safe to inject directly.
            $result.html(response.html);
            $button.prop("disabled", false);
        },
        error(xhr) {
            $result.addClass("drc-tool-result-error");
            ui_report.error($t_html({defaultMessage: "Failed to run tool."}), xhr, $result);
            $button.prop("disabled", false);
        },
    });
}

function open_drc_admin_modal(e: JQuery.ClickEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const today = new Date();
    const last_month = new Date();
    last_month.setDate(last_month.getDate() - 30);

    const to_iso_date = (date: Date): string => date.toISOString().split("T")[0]!;

    const modal_content_html = render_drc_admin_modal({
        whoami: current_user.delivery_email ?? current_user.email,
        today: to_iso_date(today),
        last_month: to_iso_date(last_month),
    });

    dialog_widget.launch({
        modal_title_html: $t_html({defaultMessage: "Admin tools"}),
        modal_content_html,
        id: "drc-admin-modal",
        hide_footer: true,
        always_visible_scrollbar: true,
        post_render() {
            $("#drc-admin-modal").on(
                "submit",
                ".drc-tool-form",
                function (this: HTMLElement, submit_event) {
                    submit_event.preventDefault();
                    run_tool($(this));
                },
            );
        },
    });
}

export function initialize(): void {
    $("body").on("click", ".drc-admin-link", open_drc_admin_modal);
}
