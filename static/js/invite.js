import autosize from "autosize";
import ClipboardJS from "clipboard";
import {
    add
} from "date-fns";
import $ from "jquery";

import copy_invite_link from "../templates/copy_invite_link.hbs";
import render_invitation_failed_error from "../templates/invitation_failed_error.hbs";
import render_invite_subscription from "../templates/invite_subscription.hbs";
import render_invite_user from "../templates/invite_user.hbs";
import render_settings_dev_env_email_access from "../templates/settings/dev_env_email_access.hbs";
import render_invite_subscription_row from "../templates/invite_subscription_row.hbs";

import * as browser_history from "./browser_history";
import * as channel from "./channel";
import * as common from "./common";
import {
    $t,
    $t_html
} from "./i18n";
import * as keydown_util from "./keydown_util";
import * as overlays from "./overlays";
import {
    page_params
} from "./page_params";
import * as settings_config from "./settings_config";
import * as stream_data from "./stream_data";
import * as ui from "./ui";
import * as ui_report from "./ui_report";
import {
    user_settings
} from "./user_settings";
import * as util from "./util";

let custom_expiration_time_input = 10;
let custom_expiration_time_unit = "days";
let stream_list = null;

function reset_error_messages() {
    $("#invite_status").hide().text("").removeClass(common.status_classes);
    $("#multiuse_invite_status").hide().text("").removeClass(common.status_classes);

    if (page_params.development_environment) {
        $("#dev_env_msg").hide().text("").removeClass(common.status_classes);
    }
}

function build_stream_li(sub, checked) {
    const name = sub.name;
    // alert(name)
    const args = {
        name,
        checked: checked,
        stream_id: sub.stream_id,
        invite_only: sub.invite_only,
        default_stream: sub.default_stream,
    };
    // args.dark_background = color_class.get_css_class(args.color);
    const $list_item = $(render_invite_subscription_row(args));
    return $list_item;
}

class StreamRow {
    constructor(sub) {
        this.sub = sub;
        this.name = sub.name;
        this.default_stream = sub.default_stream;
        this.stream_id = sub.stream_id;
        this.checked = false;
        if(this.default_stream){
          this.checked = true;
        } else {
          this.checked = false;
        }
        this.$list_item = build_stream_li(sub, this.checked);
    }

    get_li() {
        return this.$list_item;
    }

    remove() {
        this.$list_item.remove();
    }

    get_name(){
      return this.name;
    }

    get_checked(){
      return this.checked;
    }

    set_checked(checked) {
      this.checked = checked;
      this.$list_item = build_stream_li(this.sub, checked);
    }

}

class StreamList {
  constructor(display_all) {
    // this.all_streams = all_streams;
    this.row_list = [];
    this.stream_ids = new Set();
    var streams = null;
    if (display_all == true) {
      streams = get_all_invite_streams();
    } else {
      streams = get_invite_streams();
    }

    for (const stream of streams) {
      const row_item = new StreamRow(stream);
      this.row_list.push(row_item);
      this.stream_ids.add(row_item.stream_id);
    }
  }

  get_set() {
    return this.stream_ids;
  }

  input(stream_id) {
    remove(stream_id);
    this.stream_ids.add(stream_id);

  }

  remove(stream_id){
    var index = 0;
    for(stream of this.row_list){
      if(stream.stream_id == stream_id){
        // this.row_list.splice(index, 1);
        this.stream_ids.delete(stream_id);
      }
      index += 1;
    }
  }

  switch_checked(stream_id){
    var index = 0;
    for(const stream of this.row_list){
      if(stream.stream_id == stream_id){
        var temp_obj = this.row_list[index];
        var checked = temp_obj.get_checked();
        if(checked == true){
          this.row_list[index].desc = temp_obj.set_checked(false);
        } else {
          this.row_list[index].desc = temp_obj.set_checked(true);
        }
        return
      }
      index += 1;
    }
  }

  get_streams(filter){
    var temp_streams = [];

    for (const stream of this.row_list) {
      if(this.stream_ids.has(stream.stream_id) ){
        const stream_name_lower = stream.name.toLowerCase();
        const filter_text_lower = filter.toLowerCase();
        if (stream_name_lower.includes(filter_text_lower)) {
          temp_streams.push(stream.get_li());
        }
      }
    }
    return temp_streams;
  }

  set_all_default_checked() {
    this.set_all_checked_status(false);
    for(const stream of this.row_list) {
      if(stream.default_stream) {
          stream.set_checked(true);
      }
    }
  }

  set_all_checked_status(checked) {
    for (const stream of this.row_list) {
        stream.set_checked(checked);
    }
  }

  get_all_checked() {
    var temp_streams = [];

    for (const stream of this.row_list) {
      if(stream.checked){
          temp_streams.push(stream.stream_id);
      }
    }
    return temp_streams;
  }
}

export function build_stream_list() {
  var filter_text = $("#stream_search").val()
  var $parent = $("#invite_rows");

  $("#invite-stream-checkboxes").on("click", () => {
      const stream_id = Number.parseInt($(this).val(), 10);
      stream_list.switch_checked(stream_id);
  });

  $parent.empty();

  $parent.append(stream_list.get_streams(filter_text));
}


function get_common_invitation_data() {
    const invite_as = Number.parseInt($("#invite_as").val(), 10);
    let expires_in = $("#expires_in").val();
    // See settings_config.expires_in_values for why we do this conversion.
    if (expires_in === "null") {
        expires_in = JSON.stringify(null);
    } else if (expires_in === "custom") {
        expires_in = Number.parseFloat(get_expiration_time_in_minutes());
    } else {
        expires_in = Number.parseFloat($("#expires_in").val());
    }


    const stream_ids = [];
    $("#invite-stream-checkboxes input:checked").each(function() {
        const stream_id = Number.parseInt($(this).val(), 10);
        stream_ids.push(stream_id);
    });

    const data = {
        csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken"]').attr("value"),
        invite_as,
        stream_ids: JSON.stringify(stream_list.get_all_checked()),
        invite_expires_in_minutes: expires_in,
    };
    return data;
}

function beforeSend() {
    reset_error_messages();
    // TODO: You could alternatively parse the textarea here, and return errors to
    // the user if they don't match certain constraints (i.e. not real email addresses,
    // aren't in the right domain, etc.)
    //
    // OR, you could just let the server do it. Probably my temptation.
    const loading_text = $("#submit-invitation").data("loading-text");
    $("#submit-invitation").text(loading_text);
    $("#submit-invitation").prop("disabled", true);
    return true;
}

function submit_invitation_form() {
    const $invite_status = $("#invite_status");
    const $invitee_emails = $("#invitee_emails");
    const data = get_common_invitation_data();
    data.invitee_emails = $("#invitee_emails").val();

    channel.post({
        url: "/json/invites",
        data,
        beforeSend,
        success() {
            ui_report.success(
                $t_html({
                    defaultMessage: "User(s) invited successfully."
                }),
                $invite_status,
            );
            $invitee_emails.val("");

            if (page_params.development_environment) {
                const rendered_email_msg = render_settings_dev_env_email_access();
                $("#dev_env_msg").html(rendered_email_msg).addClass("alert-info").show();
            }

            if ($("#expires_in").val() === "custom") {
                // Hide the custom inputs if the custom input is set
                // to one of the dropdown's standard options.
                const time_in_minutes = get_expiration_time_in_minutes();
                for (const option of Object.values(settings_config.expires_in_values)) {
                    if (option.value === time_in_minutes) {
                        $("#custom-invite-expiration-time").hide();
                        $("#expires_in").val(time_in_minutes);
                        return;
                    }
                }
            }
        },
        error(xhr) {
            const arr = JSON.parse(xhr.responseText);
            if (arr.errors === undefined) {
                // There was a fatal error, no partial processing occurred.
                ui_report.error("", xhr, $invite_status);
            } else {
                // Some users were not invited.
                const invitee_emails_errored = [];
                const error_list = [];
                let is_invitee_deactivated = false;
                for (const value of arr.errors) {
                    const [email, error_message, deactivated] = value;
                    error_list.push(`${email}: ${error_message}`);
                    if (deactivated) {
                        is_invitee_deactivated = true;
                    }
                    invitee_emails_errored.push(email);
                }

                const error_response = render_invitation_failed_error({
                    error_message: arr.msg,
                    error_list,
                    is_admin: page_params.is_admin,
                    is_invitee_deactivated,
                    license_limit_reached: arr.license_limit_reached,
                    has_billing_access: page_params.is_owner || page_params.is_billing_admin,
                    daily_limit_reached: arr.daily_limit_reached,
                });
                ui_report.message(error_response, $invite_status, "alert-warning");

                if (arr.sent_invitations) {
                    $invitee_emails.val(invitee_emails_errored.join("\n"));
                }
            }
        },
        complete() {
            $("#submit-invitation").text($t({
                defaultMessage: "Invite"
            }));
            $("#submit-invitation").prop("disabled", false);
            $("#invitee_emails").trigger("focus");
            ui.get_scroll_element($("#invite_user_form .modal-body"))[0].scrollTop = 0;
        },
    });
}

function generate_multiuse_invite() {
    const $invite_status = $("#multiuse_invite_status");
    const data = get_common_invitation_data();
    channel.post({
        url: "/json/invites/multiuse",
        data,
        beforeSend,
        success(data) {
            const copy_link_html = copy_invite_link(data);
            ui_report.success(copy_link_html, $invite_status);
            new ClipboardJS("#copy_generated_invite_link");
        },
        error(xhr) {
            ui_report.error("", xhr, $invite_status);
        },
        complete() {
            $("#submit-invitation").text($t({
                defaultMessage: "Generate invite link"
            }));
            $("#submit-invitation").prop("disabled", false);
        },
    });
}

export function get_invite_streams() {
    const streams = stream_data.get_invite_stream_data();
    streams.sort((a, b) => util.strcmp(a.name, b.name));
    return streams;
}

export function get_all_invite_streams() {
    const streams = stream_data.get_all_invite_stream_data();
    streams.sort((a, b) => util.strcmp(a.name, b.name));
    return streams;
}

// DRC MODIFICATION - get filtered invite streams base off of string input
export function get_filtered_invite_streams(str_filter) {
    const streams = stream_data.get_invite_stream_data();
    const filtered_streams = [];


    for (const stream of streams) {
        if (stream.name.includes(str_filter)) {
            // alert(stream.name)
            filtered_streams.push(stream);
        }
    }

    filtered_streams.sort((a, b) => util.strcmp(a.name, b.name));
    return filtered_streams;
}


function update_subscription_checkboxes() {
    const data = {
        streams: get_invite_streams(),
        notifications_stream: stream_data.get_notifications_stream(),
        show_select_default_streams_option: stream_data.get_default_stream_ids().length !== 0,
    };
    const html = render_invite_subscription(data);
    $("#streams_to_add").html(html);
    set_streams_to_join_list_visibility();
}

// DRC MODIFICATION - update filtered checkboxes
function update_filtered_subscription_checkboxes(str_filter) {
    const data = {
        streams: get_filtered_invite_streams(str_filter),
        notifications_stream: stream_data.get_notifications_stream(),
    };
    const html = render_invite_subscription(data);


    $("#streams_to_add").html(html);
    reset_error_messages();
}


function prepare_form_to_be_shown() {
    update_subscription_checkboxes();
    reset_error_messages();
}

export function launch() {
    $("#submit-invitation").button();
    prepare_form_to_be_shown();
    $(".display_all_streams").prop("checked", false);

    stream_list = new StreamList(false);
    build_stream_list();

    overlays.open_overlay({
        name: "invite",
        $overlay: $("#invite-user"),
        on_close() {
            browser_history.exit_overlay();
        },
    });

    autosize($("#invitee_emails").trigger("focus"));

    // Ctrl + Enter key to submit form
    $("#invite-user").on("keydown", (e) => {
        if (keydown_util.is_enter_event(e) && e.ctrlKey) {
            submit_invitation_form();
        }
    });
}

function valid_to(expires_in) {
    const time_valid = Number.parseFloat(expires_in);
    if (!time_valid) {
        return $t({
            defaultMessage: "Never expires"
        });
    }
    const valid_to = add(new Date(), {
        minutes: time_valid
    });
    const options = {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: !user_settings.twenty_four_hour_time,
    };
    return $t({
        defaultMessage: "Expires on {date}"
    }, {
        date: valid_to.toLocaleTimeString([], options)
    }, );
}

function get_expiration_time_in_minutes() {
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

function set_expires_on_text() {
    if ($("#expires_in").val() === "custom") {
        $("#expires_on").hide();
        $("#custom_expires_on").text(valid_to(get_expiration_time_in_minutes()));
    } else {
        $("#expires_on").show();
        $("#expires_on").text(valid_to($("#expires_in").val()));
    }
}

function set_custom_time_inputs_visibility() {
    if ($("#expires_in").val() === "custom") {
        $("#custom-expiration-time-input").val(custom_expiration_time_input);
        $("#custom-expiration-time-unit").val(custom_expiration_time_unit);
        $("#custom-invite-expiration-time").show();
    } else {
        $("#custom-invite-expiration-time").hide();
    }
}

function set_streams_to_join_list_visibility() {
    const default_streams_selected = $("#invite_select_default_streams").prop("checked");
    if (default_streams_selected) {
        $("#streams_to_add .invite-stream-controls").hide();
        $("#invite-stream-checkboxes").hide();
    } else {
        $("#streams_to_add .invite-stream-controls").show();
        $("#invite-stream-checkboxes").show();
    }
}

export function initialize() {
    const time_unit_choices = ["minutes", "hours", "days", "weeks"];
    const rendered = render_invite_user({
        is_admin: page_params.is_admin,
        is_owner: page_params.is_owner,
        development_environment: page_params.development_environment,
        invite_as_options: settings_config.user_role_values,
        expires_in_options: settings_config.expires_in_values,
        time_choices: time_unit_choices,
    });

    $(".app").append(rendered);
    set_custom_time_inputs_visibility();
    set_expires_on_text();



    $(document).on("click", "#invite_check_all_button", () => {
        $("#invite-stream-checkboxes :checkbox").prop("checked", true);
        stream_list.set_all_checked_status(true);
    });

    $(document).on("click", "#invite_uncheck_all_button", () => {
        $("#invite-stream-checkboxes :checkbox").prop("checked", false);
        stream_list.set_all_checked_status(false);
    });

    $(document).on("change", "#invite_select_default_streams", () => {
        set_streams_to_join_list_visibility();
        stream_list.set_all_default_checked();
    });

    $(document).on("click", ".checkbox_alert", () => {
        const temp_val = $(".checkbox_alert").val();
        // stream_ids.delete(temp_val);
        // alert(temp_val);
    });

    // $(document).on("click", "#stream_search_btn", () => {
    $(".invite_clear_search_button").on("click", () => {
        const $filter = $(".stream_search");
        // alert('hello')
        $filter.val("");
        build_stream_list();
    });

    $(".display_all_streams").on("click", () => {
        // var checkbox_val = $(".display_all_streams").val();
        // alert(checkbox_val)
        if($(".display_all_streams").is(":checked")){
          stream_list = new StreamList(true);
        } else {
          stream_list = new StreamList(false);
        }
        build_stream_list();
    });

    $("#submit-invitation").on("click", () => {
        const is_generate_invite_link = $("#generate_multiuse_invite_radio").prop("checked");
        if (is_generate_invite_link) {
            generate_multiuse_invite();
        } else {
            submit_invitation_form();
        }
    });

    $("#generate_multiuse_invite_button").on("click", () => {
        $("#generate_multiuse_invite_radio").prop("checked", true);
        $("#multiuse_radio_section").show();
        $("#invite-method-choice").hide();
        $("#invitee_emails").prop("disabled", true);
        $("#submit-invitation").text($t({
            defaultMessage: "Generate invite link"
        }));
        $("#submit-invitation").data("loading-text", $t({
            defaultMessage: "Generating link..."
        }));
        reset_error_messages();
    });

    $("#invite-user").on("change", "#generate_multiuse_invite_radio", () => {
        $("#invitee_emails").prop("disabled", false);
        $("#submit-invitation").text($t({
            defaultMessage: "Invite"
        }));
        $("#submit-invitation").data("loading-text", $t({
            defaultMessage: "Inviting..."
        }));
        $("#multiuse_radio_section").hide();
        $("#invite-method-choice").show();
        reset_error_messages();
    });

    $("#expires_on").text(valid_to($("#expires_in").val()));
    $("#expires_in").on("change", () => {
        set_custom_time_inputs_visibility();
        set_expires_on_text();
    });

    $(".custom-expiration-time").on("change", () => {
        custom_expiration_time_input = $("#custom-expiration-time-input").val();
        custom_expiration_time_unit = $("#custom-expiration-time-unit").val();
        $("#custom_expires_on").text(valid_to(get_expiration_time_in_minutes()));
    });

    $("#custom-expiration-time-input").on("keydown", (e) => {
        if (keydown_util.is_enter_event(e)) {
            e.preventDefault();
            return;
        }
    });

    const $search_input = $("#stream_search");

    $search_input.on("input", () => build_stream_list());
}