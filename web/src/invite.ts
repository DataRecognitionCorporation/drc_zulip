import ClipboardJS from "clipboard";
import {add} from "date-fns";
import $ from "jquery";
import assert from "minimalistic-assert";
import {z} from "zod";

import copy_invite_link from "../templates/copy_invite_link.hbs";
import render_invitation_failed_error from "../templates/invitation_failed_error.hbs";
import render_invite_user_modal from "../templates/invite_user_modal.hbs";
import render_invite_tips_banner from "../templates/modal_banner/invite_tips_banner.hbs";
import render_settings_dev_env_email_access from "../templates/settings/dev_env_email_access.hbs";

import * as channel from "./channel";
import * as common from "./common";
import * as components from "./components";
import * as compose_banner from "./compose_banner";
import {show_copied_confirmation} from "./copied_tooltip";
import {csrf_token} from "./csrf";
import * as dialog_widget from "./dialog_widget";
import * as email_pill from "./email_pill";
import {$t, $t_html} from "./i18n";
import * as input_pill from "./input_pill";
import * as invite_stream_picker_pill from "./invite_stream_picker_pill";
import {page_params} from "./page_params";
import * as settings_config from "./settings_config";
import * as settings_data from "./settings_data";
import {current_user, realm} from "./state_data";
import * as stream_data from "./stream_data";
import * as stream_pill from "./stream_pill";
import * as timerender from "./timerender";
import type {HTMLSelectOneElement} from "./types";
import * as ui_report from "./ui_report";

let custom_expiration_time_input = 10;
let custom_expiration_time_unit = "days";
let pills: email_pill.EmailPillWidget;
let stream_pill_widget: stream_pill.StreamPillWidget;

function reset_error_messages(): void {
    $("#dialog_error").hide().text("").removeClass(common.status_classes);

    if (page_params.development_environment) {
        $("#dev_env_msg").hide().text("").removeClass(common.status_classes);
    }
}

function get_common_invitation_data(): {
    csrfmiddlewaretoken: string;
    invite_as: number;
    notify_referrer_on_join: boolean;
    invite_multiple: boolean;
    stream_ids: string;
    invite_expires_in_minutes: string;
    invitee_emails: string;
    include_realm_default_subscriptions: string;
} {
    const invite_as = Number.parseInt(
        $<HTMLSelectOneElement>("select:not([multiple])#invite_as").val()!,
        10,
    );
    const invite_multiple = $("#invite_multiple").is(":checked");


    let stream_ids: number[] = [];
    let include_realm_default_subscriptions = false;
    if (!settings_data.user_can_subscribe_other_users()) {
        include_realm_default_subscriptions = true;
    } else {
        stream_ids = stream_pill.get_stream_ids(stream_pill_widget);
    }
    const invitee_emails =  $("#invitee_emails").val();




    assert(csrf_token !== undefined);
    const data = {
        csrfmiddlewaretoken: csrf_token,
        invite_as,
        invite_multiple,
        stream_ids: JSON.stringify(stream_ids),
        invite_expires_in_minutes: JSON.stringify(14400),
        invitee_emails: invitee_emails,
        include_realm_default_subscriptions: JSON.stringify(include_realm_default_subscriptions),
    };
    /*
    const current_email = email_pill.get_current_email(pills);
    if (current_email) {
        if (pills.items().length === 0) {
            data.invitee_emails = current_email;
        } else {
            data.invitee_emails += "," + current_email;
        }
    }
    */
    return data;
}

function beforeSend(): void {
    reset_error_messages();
    // TODO: You could alternatively parse the emails here, and return errors to
    // the user if they don't match certain constraints (i.e. not real email addresses,
    // aren't in the right domain, etc.)
    //
    // OR, you could just let the server do it. Probably my temptation.
    const loading_text = $("#invite-user-modal .dialog_submit_button").attr("data-loading-text");
    assert(loading_text !== undefined);
    $("#invite-user-modal .dialog_submit_button").text(loading_text);
    //$("#invite-user-modal .dialog_submit_button").prop("disabled", true);
}

function submit_invitation_form(): void {
    const $expires_in = $<HTMLSelectOneElement>("select:not([multiple])#expires_in");
    const $invite_status = $("#dialog_error");
    const data = get_common_invitation_data();

    void channel.post({
        url: "/json/invites",
        data,
        beforeSend,
        success() {
            const number_of_invites_sent = 5;
            ui_report.success(
                $t_html(
                    {
                        defaultMessage:
                            "{N, plural, one {User invited successfully.} other {Users invited successfully.}}",
                    },
                    {N: number_of_invites_sent},
                ),
                $invite_status,
            );
            //pills.clear();
            $("#invitee_emails").val('');

            if (page_params.development_environment) {
                const rendered_email_msg = render_settings_dev_env_email_access();
                $("#dev_env_msg").html(rendered_email_msg).addClass("alert-info").show();
            }

            if ($expires_in.val() === "custom") {
                // Hide the custom inputs if the custom input is set
                // to one of the dropdown's standard options.
                const time_in_minutes = get_expiration_time_in_minutes();
                for (const option of Object.values(settings_config.expires_in_values)) {
                    if (option.value === time_in_minutes) {
                        $("#custom-invite-expiration-time").hide();
                        $expires_in.val(time_in_minutes);
                        return;
                    }
                }
            }
        },
        error(xhr) {
            const parsed = z
                .object({
                    result: z.literal("error"),
                    code: z.literal("INVITATION_FAILED"),
                    msg: z.string(),
                    errors: z.array(z.tuple([z.string(), z.string(), z.boolean()])),
                    sent_invitations: z.boolean(),
                    license_limit_reached: z.boolean(),
                    daily_limit_reached: z.boolean(),
                })
                .safeParse(xhr.responseJSON);
            if (!parsed.success) {
                // There was a fatal error, no partial processing occurred.
                ui_report.error("", xhr, $invite_status);
            } else {
                // Some users were not invited.
                const invitee_emails_errored = [];
                const error_list = [];
                let is_invitee_deactivated = false;
                for (const [email, error_message, deactivated] of parsed.data.errors) {
                    error_list.push(`${email}: ${error_message}`);
                    if (deactivated) {
                        is_invitee_deactivated = true;
                    }
                    invitee_emails_errored.push(email);
                }

                const error_response = render_invitation_failed_error({
                    error_message: parsed.data.msg,
                    error_list,
                    is_admin: current_user.is_admin,
                    is_invitee_deactivated,
                    license_limit_reached: parsed.data.license_limit_reached,
                    has_billing_access: current_user.is_owner || current_user.is_billing_admin,
                    daily_limit_reached: parsed.data.daily_limit_reached,
                });
                ui_report.message(error_response, $invite_status, "alert-error");

                if (parsed.data.sent_invitations) {
                    for (const email of invitee_emails_errored) {
                        pills.appendValue(email);
                    }
                }
            }
        },
        complete() {
            $("#invite-user-modal .dialog_submit_button").text($t({defaultMessage: "Invite"}));
            $("#invite-user-modal .dialog_submit_button").prop("disabled", false);
            $("#invite-user-modal .dialog_exit_button").prop("disabled", false);
            $invite_status[0]!.scrollIntoView();
        },
    });
}

function generate_multiuse_invite(): void {
    const $invite_status = $("#dialog_error");
    const data = get_common_invitation_data();
    void channel.post({
        url: "/json/invites/multiuse",
        data,
        beforeSend,
        success(data) {
            const copy_link_html = copy_invite_link(data);
            ui_report.success(copy_link_html, $invite_status);
            const clipboard = new ClipboardJS("#copy_generated_invite_link");

            clipboard.on("success", () => {
                const tippy_timeout_in_ms = 800;
                show_copied_confirmation(
                    $("#copy_generated_invite_link")[0]!,
                    () => {
                        // Do nothing on hide
                    },
                    tippy_timeout_in_ms,
                );
            });
        },
        error(xhr) {
            ui_report.error("", xhr, $invite_status);
        },
        complete() {
            $("#invite-user-modal .dialog_submit_button").text($t({defaultMessage: "Create link"}));
            $("#invite-user-modal .dialog_submit_button").prop("disabled", false);
            $("#invite-user-modal .dialog_exit_button").prop("disabled", false);
            $invite_status[0]!.scrollIntoView();
        },
    });
}

function valid_to(time_valid: number): string {
    if (!time_valid) {
        return $t({defaultMessage: "Never expires"});
    }

    // The below is a duplicate of timerender.get_full_datetime, with a different base string.
    const valid_to = add(new Date(), {minutes: time_valid});
    const date = timerender.get_localized_date_or_time_for_format(valid_to, "dayofyear_year");
    const time = timerender.get_localized_date_or_time_for_format(valid_to, "time");

    return $t({defaultMessage: "Expires on {date} at {time}"}, {date, time});
}

function get_expiration_time_in_minutes(): number {
    switch (custom_expiration_time_unit) {
        case "hours":
            return custom_expiration_time_input * 60;
        case "days":
            return custom_expiration_time_input * 24 * 60;
        case "weeks":
            return custom_expiration_time_input * 7 * 24 * 60;
        default:
            return custom_expiration_time_input;
    }
}

function set_expires_on_text(): void {
    const $expires_in = $<HTMLSelectOneElement>("select:not([multiple])#expires_in");
    if ($expires_in.val() === "custom") {
        $("#expires_on").hide();
        $("#custom_expires_on").text(valid_to(get_expiration_time_in_minutes()));
    } else {
        $("#expires_on").show();
        $("#expires_on").text(valid_to(Number.parseFloat($expires_in.val()!)));
    }
}

function set_custom_time_inputs_visibility(): void {
    const $expires_in = $<HTMLSelectOneElement>("select:not([multiple])#expires_in");
    if ($expires_in.val() === "custom") {
        $("#custom-expiration-time-input").val(custom_expiration_time_input);
        $<HTMLSelectOneElement>("select:not([multiple])#custom-expiration-time-unit").val(
            custom_expiration_time_unit,
        );
        $("#custom-invite-expiration-time").show();
    } else {
        $("#custom-invite-expiration-time").hide();
    }
}

function set_streams_to_join_list_visibility(): void {
    $(".add_streams_container").show();
    $(".select_default_streams").hide();
}

function generate_invite_tips_data(): Record<string, boolean> {
    const {realm_description, realm_icon_source, custom_profile_fields} = realm;

    return {
        realm_has_description:
            realm_description !== "" &&
            !/^Organization imported from [A-Za-z]+[!.]$/.test(realm_description),
        realm_has_user_set_icon: realm_icon_source !== "G",
        realm_has_custom_profile_fields: custom_profile_fields.length > 0,
    };
}

function open_invite_user_modal(e: JQuery.ClickEvent<Document, undefined>): void {
    e.stopPropagation();
    e.preventDefault();

    const time_unit_choices = ["minutes", "hours", "days", "weeks"];
    const html_body = render_invite_user_modal({
        is_admin: current_user.is_admin,
        is_owner: current_user.is_owner,
        development_environment: page_params.development_environment,
        invite_as_options: settings_config.user_role_values,
        expires_in_options: settings_config.expires_in_values,
        time_choices: time_unit_choices,
        show_select_default_streams_option: stream_data.get_default_stream_ids().length !== 0,
        user_has_email_set: !settings_data.user_email_not_configured(),
        can_subscribe_other_users: settings_data.user_can_subscribe_other_users(),
    });

    function invite_user_modal_post_render(): void {
        const $expires_in = $<HTMLSelectOneElement>("select:not([multiple])#expires_in");
        /*

        const $pill_container = $("#invitee_emails_container .pill-container");
        pills = input_pill.create({
            $container: $pill_container,
            create_item_from_text: email_pill.create_item_from_email,
            get_text_from_item: email_pill.get_email_from_item,
        });
        */

        //$("#invite-user-modal .dialog_submit_button").prop("disabled", true);

        const user_has_email_set = !settings_data.user_email_not_configured();

        set_custom_time_inputs_visibility();
        set_expires_on_text();

        if (settings_data.user_can_subscribe_other_users()) {
            set_streams_to_join_list_visibility();
            const $stream_pill_container = $("#invite_streams_container .pill-container");
            stream_pill_widget = invite_stream_picker_pill.create($stream_pill_container);
        }

        $("#invite-user-modal").on("click", ".setup-tips-container .banner_content a", () => {
            dialog_widget.close();
        });

        $("#invite-user-modal").on("click", ".main-view-banner-close-button", (e) => {
            e.preventDefault();
            $(e.target).parent().remove();
        });

        $("#invite_multiple").on("click", (e) => {
            if($("#invite_multiple").is(":checked")) {
                $('.invitee_emails').attr('placeholder', 'Last name, First name, Email.');

            } else {
                $('.invitee_emails').attr('placeholder', 'Email only.');

            }
        });

        function toggle_invite_submit_button(selected_tab?: string): void {
            if (selected_tab === undefined) {
                selected_tab = $(".invite_users_option_tabs")
                    .find(".selected")
                    .attr("data-tab-key");
            }
            const $button = $("#invite-user-modal .dialog_submit_button");
            /*
            $button.prop(
                "disabled",
                selected_tab === "invite-email-tab"
            );
            */
            if (selected_tab === "invite-email-tab") {
                $button.text($t({defaultMessage: "Invite"}));
                $button.attr("data-loading-text", $t({defaultMessage: "Inviting…"}));
            } else {
                $button.text($t({defaultMessage: "Create link"}));
                $button.attr("data-loading-text", $t({defaultMessage: "Creating link…"}));
            }
        }

        //pills.onPillCreate(toggle_invite_submit_button);
        //pills.onPillRemove(() => {
        //    toggle_invite_submit_button();
        //});
        //pills.onTextInputHook(toggle_invite_submit_button);

        $expires_in.on("change", () => {
            set_custom_time_inputs_visibility();
            set_expires_on_text();
        });

        $("#expires_on").text(valid_to(Number.parseFloat($expires_in.val()!)));

        $("#custom-expiration-time-input").on("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                return;
            }
        });

        $(".custom-expiration-time").on("change", () => {
            custom_expiration_time_input = Number.parseFloat(
                $<HTMLInputElement>("input#custom-expiration-time-input").val()!,
            );
            custom_expiration_time_unit = $<HTMLSelectOneElement>(
                "select:not([multiple])#custom-expiration-time-unit",
            ).val()!;
            $("#custom_expires_on").text(valid_to(get_expiration_time_in_minutes()));
        });

        $("#invite_check_all_button").on("click", () => {
            $("#invite-stream-checkboxes input[type=checkbox]").prop("checked", true);
        });

        $("#invite_uncheck_all_button").on("click", () => {
            $("#invite-stream-checkboxes input[type=checkbox]").prop("checked", false);
        });

        set_streams_to_join_list_visibility();

        if (!user_has_email_set) {
            $("#invite-user-form :input").prop("disabled", !user_has_email_set);
        }

        const invite_tips_data = generate_invite_tips_data();

        const context = {
            banner_type: compose_banner.INFO,
            classname: "setup_tips_banner",
            ...invite_tips_data,
        };

        $("#invite-user-form .setup-tips-container").html(render_invite_tips_banner(context));

        const toggler = components.toggle({
            html_class: "invite_users_option_tabs large allow-overflow",
            selected: 0,
            child_wants_focus: true,
            values: [
                {label: $t({defaultMessage: "Add/Invite"}), key: "invite-email-tab"},
                {label: $t({defaultMessage: "Invitation link"}), key: "invite-link-tab"},
            ],
            callback(_name, key) {
                switch (key) {
                    case "invite-email-tab":
                        $("#invitee_emails_container").show();
                        $("#invite_multiple_container").show();
                        break;
                    case "invite-link-tab":
                        $("#invitee_emails_container").hide();
                        $("#invite_multiple_container").hide();
                        break;
                }
                toggle_invite_submit_button(key);
                reset_error_messages();
            },
        });
        const $container = $("#invite_users_option_tabs_container");
        if (!settings_data.user_can_invite_users_by_email()) {
            toggler.disable_tab("invite-email-tab");
            toggler.goto("invite-link-tab");
        }
        if (!settings_data.user_can_create_multiuse_invite()) {
            toggler.disable_tab("invite-link-tab");
        }
        const $elem = toggler.get();
        $container.append($elem);
        setTimeout(() => {
            $(".invite_users_option_tabs .ind-tab.selected").trigger("focus");
        }, 0);
    }

    function invite_users(): void {
        const is_generate_invite_link =
            $(".invite_users_option_tabs").find(".selected").attr("data-tab-key") ===
            "invite-link-tab";
        if (is_generate_invite_link) {
            generate_multiuse_invite();
        } else {
            submit_invitation_form();
        }
    }

    dialog_widget.launch({
        html_heading: $t_html({defaultMessage: "Invite users to organization"}),
        html_body,
        html_submit_button: $t_html({defaultMessage: "Invite"}),
        id: "invite-user-modal",
        loading_spinner: true,
        on_click: invite_users,
        post_render: invite_user_modal_post_render,
        always_visible_scrollbar: true,
    });
}

export function initialize(): void {
    $(document).on("click", ".invite-user-link", open_invite_user_modal);
}
