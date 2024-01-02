/* Module for popovers that have been ported to the modern
   TippyJS/Popper popover library from the legacy Bootstrap
   popovers system in popovers.js. */

import $ from "jquery";
import tippy from "tippy.js";

import * as blueslip from "./blueslip";
import {media_breakpoints_num} from "./css_variables";
import * as modals from "./modals";
import * as overlays from "./overlays";
import * as popovers from "./popovers";
import * as util from "./util";

export const popover_instances = {
    compose_control_buttons: null,
    starred_messages: null,
    drafts: null,
    left_sidebar_inbox_popover: null,
    left_sidebar_all_messages_popover: null,
    left_sidebar_recent_view_popover: null,
    top_left_sidebar: null,
    message_actions: null,
    stream_settings: null,
    compose_mobile_button: null,
    topics_menu: null,
    send_later: null,
    change_visibility_policy: null,
    personal_menu: null,
    gear_menu: null,
    help_menu: null,
};

/* Keyboard UI functions */
export function popover_items_handle_keyboard(key, $items) {
    if (!$items) {
        return;
    }

    let index = $items.index($items.filter(":focus"));

    if (key === "enter" && index >= 0 && index < $items.length) {
        // This is not enough for some elements which need to trigger
        // natural click for them to work like ClipboardJS and follow
        // the link for anchor tags. For those elements, we need to
        // use `.navigate-link-on-enter` class on them.
        $items.eq(index).trigger("click");
        return;
    }

    if (index === -1) {
        index = 0;
    } else if ((key === "down_arrow" || key === "vim_down") && index < $items.length - 1) {
        index += 1;
    } else if ((key === "up_arrow" || key === "vim_up") && index > 0) {
        index -= 1;
    }
    $items.eq(index).trigger("focus");
}

export function focus_first_popover_item($items, index = 0) {
    if (!$items) {
        return;
    }

    $items.eq(index).expectOne().trigger("focus");
}

export function sidebar_menu_instance_handle_keyboard(instance, key) {
    const items = get_popover_items_for_instance(instance);
    popover_items_handle_keyboard(key, items);
}

export function get_visible_instance() {
    return Object.values(popover_instances).find(Boolean);
}

export function get_topic_menu_popover() {
    return popover_instances.topics_menu;
}

export function get_scheduled_messages_popover() {
    return popover_instances.send_later;
}

export function is_scheduled_messages_popover_displayed() {
    return popover_instances.send_later?.state.isVisible;
}

export function get_compose_control_buttons_popover() {
    return popover_instances.compose_control_buttons;
}

export function get_starred_messages_popover() {
    return popover_instances.starred_messages;
}

export function is_personal_menu_popover_displayed() {
    return popover_instances.personal_menu?.state.isVisible;
}

export function is_gear_menu_popover_displayed() {
    return popover_instances.gear_menu?.state.isVisible;
}

export function get_gear_menu_instance() {
    return popover_instances.gear_menu;
}

export function is_help_menu_popover_displayed() {
    return popover_instances.help_menu?.state.isVisible;
}

export function is_message_actions_popover_displayed() {
    return popover_instances.message_actions?.state.isVisible;
}

function get_popover_items_for_instance(instance) {
    const $current_elem = $(instance.popper);
    const class_name = $current_elem.attr("class");

    if (!$current_elem) {
        blueslip.error("Trying to get menu items when popover is closed.", {class_name});
        return undefined;
    }

    return $current_elem.find("a:visible");
}

export const default_popover_props = {
    delay: 0,
    appendTo: () => document.body,
    trigger: "click",
    interactive: true,
    hideOnClick: true,
    /* The light-border TippyJS theme is a bit of a misnomer; it
       is a popover styling similar to Bootstrap.  We've also customized
       its CSS to support Zulip's dark theme. */
    theme: "light-border",
    // The maxWidth has been set to "none" to avoid the default value of 300px.
    maxWidth: "none",
    touch: true,
    /* Don't use allow-HTML here since it is unsafe. Instead, use `parse_html`
       to generate the required html */
    popperOptions: {
        modifiers: [
            {
                // Hide popover for which the reference element is hidden.
                // References:
                // https://popper.js.org/docs/v2/modifiers/
                // https://github.com/atomiks/tippyjs/blob/ad85f6feb79cf6c5853c43bf1b2a50c4fa98e7a1/src/createTippy.ts#L608
                name: "destroy-popover-if-reference-hidden",
                enabled: true,
                phase: "beforeWrite",
                requires: ["$$tippy"],
                fn({state}) {
                    const instance = state.elements.reference._tippy;
                    const $popover = $(state.elements.popper);
                    const $tippy_box = $popover.find(".tippy-box");
                    if ($tippy_box.hasClass("show-when-reference-hidden")) {
                        return;
                    }

                    // $tippy_box[0].hasAttribute("data-reference-hidden"); is the real check
                    // but linter wants us to write it like this.
                    const is_reference_outside_window = Object.hasOwn(
                        $tippy_box[0].dataset,
                        "referenceHidden",
                    );
                    if (is_reference_outside_window) {
                        instance.hide();
                        return;
                    }

                    const $reference = $(state.elements.reference);
                    // Hide popover if the reference element is below another element.
                    //
                    // We only care about the reference element if it is inside the message feed since
                    // hiding elements outside the message feed is tricky and expensive due to stacking context.
                    // References in overlays, modal, sidebar overlays, popovers, etc. can make the below logic hard
                    // to live with if we take elements outside message feed into account.
                    // Since `.sticky_header` is inside `#message_feed_container`, we allow popovers from reference inside
                    // `.sticky_header` to be visible.
                    if (
                        $reference.parents("#message_feed_container, .sticky_header").length !== 1
                    ) {
                        return;
                    }

                    const reference_rect = $reference[0].getBoundingClientRect();
                    // This is the logic we want but since it is too expensive to run
                    // on every scroll, we run a cheaper version of this to just check if
                    // compose, sticky header or navbar are not obscuring the reference
                    // in message list where we want a better experience.
                    // Also, elementFromPoint can be quite buggy since element can be temporarily
                    // hidden or obscured by other elements like `simplebar-wrapper`.
                    //
                    // const topmost_element = document.elementFromPoint(
                    //     reference_rect.left,
                    //     reference_rect.top,
                    // );
                    // if (
                    //     !topmost_element ||
                    //     ($(topmost_element).closest($reference).length === 0 &&
                    //         $(topmost_element).find($reference).length === 0)
                    // ) {
                    //     instance.hide();
                    // }

                    // Hide popover if the reference element is below compose, sticky header or navbar.

                    // These are elements covering the reference element (intersection of elements at top
                    // top left and bottom right)
                    const elements_at_reference_position = document
                        .elementsFromPoint(reference_rect.left, reference_rect.top)
                        .filter((element) =>
                            document
                                .elementsFromPoint(reference_rect.right, reference_rect.bottom)
                                .includes(element),
                        );

                    if (
                        elements_at_reference_position.some(
                            (element) =>
                                element.id === "navbar-fixed-container" ||
                                element.id === "compose-content" ||
                                element.classList.contains("sticky_header"),
                        )
                    ) {
                        instance.hide();
                    }
                },
            },
        ],
    },
};

export const left_sidebar_tippy_options = {
    placement: "right",
    popperOptions: {
        modifiers: [
            {
                name: "flip",
                options: {
                    fallbackPlacements: "bottom",
                },
            },
        ],
    },
};

export function on_show_prep(instance) {
    $(instance.popper).on("click", (e) => {
        // Popover is not hidden on click inside it unless the click handler for the
        // element explicitly hides the popover when handling the event.
        // `stopPropagation` is required here to avoid global click handlers from
        // being triggered.
        e.stopPropagation();
    });
    $(instance.popper).one("click", ".navigate_and_close_popover", (e) => {
        // Handler for links inside popover which don't need a special click handler.
        e.stopPropagation();
        instance.hide();
    });
}

function get_props_for_popover_centering(popover_props) {
    return {
        arrow: false,
        getReferenceClientRect: () => ({
            width: 0,
            height: 0,
            left: 0,
            top: 0,
        }),
        placement: "top",
        popperOptions: {
            modifiers: [
                {
                    name: "offset",
                    options: {
                        offset({popper}) {
                            // Calculate the offset needed to place the reference in the center
                            const x_offset_to_center = window.innerWidth / 2;
                            let y_offset_to_center = window.innerHeight / 2 - popper.height / 2;

                            // Move popover to the top of the screen if user is focused on an element which can
                            // open keyboard on a mobile device causing the screen to resize.
                            // Resize doesn't happen on iOS when keyboard is open, and typing text in input field just works.
                            // For other browsers, we need to check if the focused element is an text field and
                            // is causing a resize (thus calling this `offset` modifier function), in which case
                            // we need to move the popover to the top of the screen.
                            if (util.is_mobile()) {
                                const $focused_element = $(document.activeElement);
                                if (
                                    $focused_element.is(
                                        "input[type=text], input[type=number], textarea",
                                    )
                                ) {
                                    y_offset_to_center = 10;
                                }
                            }
                            return [x_offset_to_center, y_offset_to_center];
                        },
                    },
                },
            ],
        },
        onShow(instance) {
            // By default, Tippys with the `data-reference-hidden` attribute aren't displayed.
            // But when we render them as centered overlays on mobile and use
            // `getReferenceClientRect` for a virtual reference, Tippy slaps this
            // hidden attribute on our element, making it invisible. We want to bypass
            // this in scenarios where we're centering popovers on mobile screens.
            $(instance.popper).find(".tippy-box").addClass("show-when-reference-hidden");
            if (popover_props.onShow) {
                popover_props.onShow(instance);
            }
        },
        onMount(instance) {
            $("body").append($("<div>").attr("id", "popover-overlay-background"));
            if (popover_props.onMount) {
                popover_props.onMount(instance);
            }
        },
        onHidden(instance) {
            $("#popover-overlay-background").remove();
            if (popover_props.onHidden) {
                popover_props.onHidden(instance);
            }
        },
    };
}

// Toggles a popover menu directly; intended for use in keyboard
// shortcuts and similar alternative ways to open a popover menu.
export function toggle_popover_menu(target, popover_props, options) {
    const instance = target._tippy;
    if (instance) {
        instance.hide();
        return;
    }

    let mobile_popover_props = {};

    // If the window is mobile-sized, we will render the
    // popover centered on the screen as an overlay.
    if (options?.show_as_overlay_on_mobile && window.innerWidth <= media_breakpoints_num.md) {
        mobile_popover_props = {
            ...get_props_for_popover_centering(popover_props),
        };
    }

    if (popover_props.popperOptions?.modifiers) {
        popover_props.popperOptions.modifiers = [
            ...default_popover_props.popperOptions.modifiers,
            ...popover_props.popperOptions.modifiers,
        ];
    }

    tippy(target, {
        ...default_popover_props,
        showOnCreate: true,
        ...popover_props,
        ...mobile_popover_props,
    });
}

// Main function to define a popover menu, opened via clicking on the
// target selector.
export function register_popover_menu(target, popover_props) {
    // For some elements, such as the click target to open the message
    // actions menu, we want to avoid propagating the click event to
    // parent elements. Tippy's built-in `delegate` method does not
    // have an option to do stopPropagation, so we use this method to
    // open the Tippy popovers associated with such elements.
    //
    // A click on the click target will close the menu; for this to
    // work correctly without leaking, all callers need call
    // `instance.destroy()` inside their `onHidden` handler.
    //
    // TODO: Should we instead we wrap the caller's `onHidden` hook,
    // if any, to add `instance.destroy()`?
    $("body").on("click", target, (e) => {
        e.preventDefault();
        e.stopPropagation();

        toggle_popover_menu(e.currentTarget, popover_props);
    });
}

export function initialize() {
<<<<<<< HEAD
    register_popover_menu("#streams_inline_icon", {
        onShow(instance) {
            const can_create_streams =
                settings_data.user_can_create_private_streams() ||
                settings_data.user_can_create_public_streams() ||
                settings_data.user_can_create_web_public_streams();

            if (!can_create_streams) {
                // If the user can't create streams, we directly
                // navigate them to the Manage streams subscribe UI.
                window.location.assign("#streams/all");
                // Returning false from an onShow handler cancels the show.
                return false;
            }

            // Assuming that the instance can be shown, track and
            // prep the instance for showing
            popover_instances.stream_settings = instance;
            instance.setContent(parse_html(render_left_sidebar_stream_setting_popover()));
            on_show_prep(instance);

            //  When showing the popover menu, we want the
            // "Add streams" and the "Filter streams" tooltip
            //  to appear below the "Add streams" icon.
            const add_streams_tooltip = $("#add_streams_tooltip").get(0);
            add_streams_tooltip._tippy?.setProps({
                placement: "bottom",
            });
            const filter_streams_tooltip = $("#filter_streams_tooltip").get(0);
            // If `filter_streams_tooltip` is not triggered yet, this will set its initial placement.
            filter_streams_tooltip.dataset.tippyPlacement = "bottom";
            filter_streams_tooltip._tippy?.setProps({
                placement: "bottom",
            });

            // The linter complains about unbalanced returns
            return true;
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.stream_settings = undefined;
            //  After the popover menu is closed, we want the
            //  "Add streams" and the "Filter streams" tooltip
            //  to appear at it's original position that is
            //  above the "Add streams" icon.
            const add_streams_tooltip = $("#add_streams_tooltip").get(0);
            add_streams_tooltip._tippy?.setProps({
                placement: "top",
            });
            const filter_streams_tooltip = $("#filter_streams_tooltip").get(0);
            filter_streams_tooltip.dataset.tippyPlacement = "top";
            filter_streams_tooltip._tippy?.setProps({
                placement: "top",
            });
        },
    });

    // compose box buttons popover shown on mobile widths.
    // We want this click event to propagate and hide other popovers
    // that could possibly obstruct user from using this popover.
    delegate("body", {
        ...default_popover_props,
        // Attach the click event to `.mobile_button_container`, since
        // the button (`.compose_mobile_button`) already has a hover
        // action attached, for showing the keyboard shortcut,
        // and Tippy cannot handle events that trigger two different
        // actions
        target: ".mobile_button_container",
        placement: "top",
        onShow(instance) {
            popover_instances.compose_mobile_button = instance;
            on_show_prep(instance);
            instance.setContent(
                parse_html(
                    render_mobile_message_buttons_popover_content({
                        is_in_private_narrow: narrow_state.narrowed_to_pms(),
                    }),
                ),
            );
        },
        onMount(instance) {
            const $popper = $(instance.popper);
            $popper.one("click", ".compose_mobile_stream_button", (e) => {
                compose_actions.start("stream", {trigger: "new topic button"});
                e.stopPropagation();
                instance.hide();
            });
            $popper.one("click", ".compose_mobile_private_button", (e) => {
                compose_actions.start("private");
                e.stopPropagation();
                instance.hide();
            });
        },
        onHidden(instance) {
            // Destroy instance so that event handlers
            // are destroyed too.
            instance.destroy();
            popover_instances.compose_control_button = undefined;
        },
    });

    // Click event handlers for it are handled in `compose_ui` and
    // we don't want to close this popover on click inside it but
    // only if user clicked outside it.
    register_popover_menu(".compose_control_menu_wrapper", {
        placement: "top",
        onShow(instance) {
            const parent_row = rows.get_closest_row(instance.reference);
            let preview_mode_on;
            // If the popover is opened from a message edit form, we want to
            // infer the preview mode from that row, else from the compose box.
            if (parent_row.length) {
                preview_mode_on = parent_row.hasClass("preview_mode");
            } else {
                preview_mode_on = $("#compose").hasClass("preview_mode");
            }
            instance.setContent(
                parse_html(
                    render_compose_control_buttons_popover({
                        giphy_enabled: giphy.is_giphy_enabled(),
                        preview_mode_on,
                    }),
                ),
            );
            popover_instances.compose_control_buttons = instance;
            popovers.hide_all_except_sidebars();
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.compose_control_buttons = undefined;
        },
    });

    // DRC MODIFICATION - copy of register_popover_menu("#stream_filter... but with #stream_folders
    register_popover_menu("#stream_folders .topic-sidebar-menu-icon", {
        ...left_sidebar_tippy_options,
        onShow(instance) {
            popover_instances.topics_menu = instance;
            on_show_prep(instance);
            const elt = $(instance.reference).closest(".topic-sidebar-menu-icon").expectOne()[0];
            const $stream_li = $(elt).closest(".narrow-filter").expectOne();
            const topic_name = $(elt).closest("li").expectOne().attr("data-topic-name");
            const url = $(elt).closest("li").find(".topic-name").expectOne().prop("href");
            const stream_id = stream_popover.elem_to_stream_id($stream_li);

            instance.context = popover_menus_data.get_topic_popover_content_context({
                stream_id,
                topic_name,
                url,
            });
            instance.setContent(parse_html(render_topic_sidebar_actions(instance.context)));
        },
        onMount(instance) {
            const $popper = $(instance.popper);
            const {stream_id, topic_name} = instance.context;

            if (!stream_id) {
                instance.hide();
                return;
            }

            $popper.on("click", ".tab-option", (e) => {
                $(".tab-option").removeClass("selected-tab");
                $(e.currentTarget).addClass("selected-tab");

                const visibility_policy = $(e.currentTarget).attr("data-visibility-policy");
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    visibility_policy,
                );
            });

            $popper.one("click", ".sidebar-popover-unmute-topic", () => {
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    user_topics.all_visibility_policies.UNMUTED,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-remove-unmute", () => {
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    user_topics.all_visibility_policies.INHERIT,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-mute-topic", () => {
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    user_topics.all_visibility_policies.MUTED,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-remove-mute", () => {
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    user_topics.all_visibility_policies.INHERIT,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-unstar-all-in-topic", () => {
                starred_messages_ui.confirm_unstar_all_messages_in_topic(
                    Number.parseInt(stream_id, 10),
                    topic_name,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-mark-topic-read", () => {
                unread_ops.mark_topic_as_read(stream_id, topic_name);
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-delete-topic-messages", () => {
                const html_body = render_delete_topic_modal({topic_name});

                confirm_dialog.launch({
                    html_heading: $t_html({defaultMessage: "Delete topic"}),
                    help_link: "/help/delete-a-topic",
                    html_body,
                    on_click() {
                        message_edit.delete_topic(stream_id, topic_name);
                    },
                });

                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-toggle-resolved", () => {
                message_edit.with_first_message_id(stream_id, topic_name, (message_id) => {
                    message_edit.toggle_resolve_topic(message_id, topic_name, true);
                });

                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-move-topic-messages", () => {
                stream_popover.build_move_topic_to_stream_popover(stream_id, topic_name, false);
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-rename-topic-messages", () => {
                stream_popover.build_move_topic_to_stream_popover(stream_id, topic_name, true);
                instance.hide();
            });

            new ClipboardJS($popper.find(".sidebar-popover-copy-link-to-topic")[0]).on(
                "success",
                () => {
                    instance.hide();
                },
            );
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.topics_menu = undefined;
        },
    });

    register_popover_menu("#stream_filters .topic-sidebar-menu-icon", {
        ...left_sidebar_tippy_options,
        onShow(instance) {
            popover_instances.topics_menu = instance;
            on_show_prep(instance);
            const elt = $(instance.reference).closest(".topic-sidebar-menu-icon").expectOne()[0];
            const $stream_li = $(elt).closest(".narrow-filter").expectOne();
            const topic_name = $(elt).closest("li").expectOne().attr("data-topic-name");
            const url = $(elt).closest("li").find(".topic-name").expectOne().prop("href");
            const stream_id = stream_popover.elem_to_stream_id($stream_li);

            instance.context = popover_menus_data.get_topic_popover_content_context({
                stream_id,
                topic_name,
                url,
            });
            console.log(instance.context)
            instance.setContent(parse_html(render_topic_sidebar_actions(instance.context)));
        },
        onMount(instance) {
            const $popper = $(instance.popper);
            const {stream_id, topic_name} = instance.context;

            if (!stream_id) {
                instance.hide();
                return;
            }

            $popper.on("click", ".tab-option", (e) => {
                $(".tab-option").removeClass("selected-tab");
                $(e.currentTarget).addClass("selected-tab");

                const visibility_policy = $(e.currentTarget).attr("data-visibility-policy");
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    visibility_policy,
                );
            });

            $popper.one("click", ".sidebar-popover-unmute-topic", () => {
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    user_topics.all_visibility_policies.UNMUTED,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-remove-unmute", () => {
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    user_topics.all_visibility_policies.INHERIT,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-mute-topic", () => {
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    user_topics.all_visibility_policies.MUTED,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-remove-mute", () => {
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    user_topics.all_visibility_policies.INHERIT,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-unstar-all-in-topic", () => {
                starred_messages_ui.confirm_unstar_all_messages_in_topic(
                    Number.parseInt(stream_id, 10),
                    topic_name,
                );
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-mark-topic-read", () => {
                unread_ops.mark_topic_as_read(stream_id, topic_name);
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-delete-topic-messages", () => {
                const html_body = render_delete_topic_modal({topic_name});

                confirm_dialog.launch({
                    html_heading: $t_html({defaultMessage: "Delete topic"}),
                    help_link: "/help/delete-a-topic",
                    html_body,
                    on_click() {
                        message_edit.delete_topic(stream_id, topic_name);
                    },
                });

                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-toggle-resolved", () => {
                message_edit.with_first_message_id(stream_id, topic_name, (message_id) => {
                    message_edit.toggle_resolve_topic(message_id, topic_name, true);
                });

                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-move-topic-messages", () => {
                stream_popover.build_move_topic_to_stream_popover(stream_id, topic_name, false);
                instance.hide();
            });

            $popper.one("click", ".sidebar-popover-rename-topic-messages", () => {
                stream_popover.build_move_topic_to_stream_popover(stream_id, topic_name, true);
                instance.hide();
            });

            new ClipboardJS($popper.find(".sidebar-popover-copy-link-to-topic")[0]).on(
                "success",
                () => {
                    instance.hide();
                },
            );
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.topics_menu = undefined;
        },
    });

    register_popover_menu(".open_enter_sends_dialog", {
        placement: "top",
        onShow(instance) {
            on_show_prep(instance);
            instance.setContent(
                parse_html(
                    render_compose_select_enter_behaviour_popover({
                        enter_sends_true: user_settings.enter_sends,
                    }),
                ),
            );
        },
        onMount(instance) {
            popover_instances.compose_enter_sends = instance;
            common.adjust_mac_kbd_tags(".enter_sends_choices kbd");

            $(instance.popper).one("click", ".enter_sends_choice", (e) => {
                let selected_behaviour = $(e.currentTarget)
                    .find("input[type='radio']")
                    .attr("value");
                selected_behaviour = selected_behaviour === "true"; // Convert to bool
                user_settings.enter_sends = selected_behaviour;
                $(`.enter_sends_${!selected_behaviour}`).hide();
                $(`.enter_sends_${selected_behaviour}`).show();

                // Refocus in the content box so you can continue typing or
                // press Enter to send.
                $("#compose-textarea").trigger("focus");

                channel.patch({
                    url: "/json/settings",
                    data: {enter_sends: selected_behaviour},
                });
                e.stopPropagation();
                instance.hide();
            });
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.compose_enter_sends = undefined;
        },
    });

    register_popover_menu(".change_visibility_policy", {
        placement: "bottom",
        popperOptions: {
            modifiers: [
                {
                    // The placement is set to bottom, but if that placement does not fit,
                    // the opposite top placement will be used.
                    name: "flip",
                    options: {
                        fallbackPlacements: ["top", "left"],
                    },
                },
            ],
        },
        onShow(instance) {
            popover_instances.change_visibility_policy = instance;
            on_show_prep(instance);
            const elt = $(instance.reference).closest(".change_visibility_policy").expectOne()[0];
            const stream_id = $(elt).attr("data-stream-id");
            const topic_name = $(elt).attr("data-topic-name");

            instance.context =
                popover_menus_data.get_change_visibility_policy_popover_content_context(
                    Number.parseInt(stream_id, 10),
                    topic_name,
                );
            instance.setContent(
                parse_html(render_change_visibility_policy_popover(instance.context)),
            );
        },
        onMount(instance) {
            const $popper = $(instance.popper);
            const {stream_id, topic_name} = instance.context;

            if (!stream_id) {
                instance.hide();
                return;
            }

            // TODO: Figure out a good way to offer feedback if this request fails.
            $popper.on("click", ".visibility_policy_option", (e) => {
                $(".visibility_policy_option").removeClass("selected_visibility_policy");
                $(e.currentTarget).addClass("selected_visibility_policy");

                const visibility_policy = $(e.currentTarget).attr("data-visibility-policy");
                user_topics.set_user_topic_visibility_policy(
                    stream_id,
                    topic_name,
                    visibility_policy,
                );
                instance.hide();
            });
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.change_visibility_policy = undefined;
        },
    });

    register_popover_menu(".actions_hover .message-actions-menu-button", {
        // 320px is our minimum supported width for mobile. We will allow the value to flex
        // to a max of 350px but we shouldn't make the popover wider than this.
        maxWidth: "min(max(320px, 100vw), 350px)",
        placement: "bottom",
        popperOptions: {
            modifiers: [
                {
                    // The placement is set to bottom, but if that placement does not fit,
                    // the opposite top placement will be used.
                    name: "flip",
                    options: {
                        fallbackPlacements: ["top", "left"],
                    },
                },
            ],
        },
        onShow(instance) {
            on_show_prep(instance);
            const $row = $(instance.reference).closest(".message_row");
            const message_id = rows.id($row);
            message_lists.current.select_id(message_id);
            const args = popover_menus_data.get_actions_popover_content_context(message_id);
            instance.setContent(parse_html(render_actions_popover_content(args)));
            $row.addClass("has_popover has_actions_popover");
        },
        onMount(instance) {
            if (message_actions_popover_keyboard_toggle) {
                popovers.focus_first_action_popover_item();
                message_actions_popover_keyboard_toggle = false;
            }
            popover_instances.message_actions = instance;

            // We want click events to propagate to `instance` so that
            // instance.hide gets called.
            const $popper = $(instance.popper);
            $popper.one("click", ".respond_button", (e) => {
                // Arguably, we should fetch the message ID to respond to from
                // e.target, but that should always be the current selected
                // message in the current message list (and
                // compose_actions.respond_to_message doesn't take a message
                // argument).
                compose_actions.quote_and_reply({trigger: "popover respond"});
                e.preventDefault();
                e.stopPropagation();
                instance.hide();
            });

            $popper.one("click", ".popover_edit_message, .popover_view_source", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                const $row = message_lists.current.get_row(message_id);
                message_edit.start($row);
                e.preventDefault();
                e.stopPropagation();
                instance.hide();
            });

            $popper.one("click", ".popover_move_message", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                const message = message_lists.current.get(message_id);
                stream_popover.build_move_topic_to_stream_popover(
                    message.stream_id,
                    message.topic,
                    false,
                    message,
                );
                e.preventDefault();
                e.stopPropagation();
                instance.hide();
            });

            $popper.one("click", ".mark_as_unread", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                unread_ops.mark_as_unread_from_here(message_id);
                e.preventDefault();
                e.stopPropagation();
                instance.hide();
            });

            $popper.one("click", ".popover_toggle_collapse", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                const $row = message_lists.current.get_row(message_id);
                const message = message_lists.current.get(rows.id($row));
                if ($row) {
                    if (message.collapsed) {
                        condense.uncollapse($row);
                    } else {
                        condense.collapse($row);
                    }
                }
                e.preventDefault();
                e.stopPropagation();
                instance.hide();
            });

            $popper.one("click", ".rehide_muted_user_message", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                const $row = message_lists.current.get_row(message_id);
                const message = message_lists.current.get(rows.id($row));
                const message_container = message_lists.current.view.message_containers.get(
                    message.id,
                );
                if ($row && !message_container.is_hidden) {
                    message_lists.current.view.hide_revealed_message(message_id);
                }
                e.preventDefault();
                e.stopPropagation();
                instance.hide();
            });

            $popper.one("click", ".view_read_receipts", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                read_receipts.show_user_list(message_id);
                e.preventDefault();
                e.stopPropagation();
                instance.hide();
            });

            $popper.one("click", ".delete_message", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                message_edit.delete_message(message_id);
                e.preventDefault();
                e.stopPropagation();
                instance.hide();
            });

            $popper.one("click", ".reaction_button", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                // Don't propagate the click event since `toggle_emoji_popover` opens a
                // emoji_picker which we don't want to hide after actions popover is hidden.
                e.stopPropagation();
                e.preventDefault();
                emoji_picker.toggle_emoji_popover(instance.reference.parentElement, message_id, {
                    placement: "bottom",
                });
                instance.hide();
            });

            new ClipboardJS($popper.find(".copy_link")[0]).on("success", () => {
                show_copied_confirmation($(instance.reference).closest(".message_controls")[0]);
                setTimeout(() => {
                    // The Clipboard library works by focusing to a hidden textarea.
                    // We unfocus this so keyboard shortcuts, etc., will work again.
                    $(":focus").trigger("blur");
                }, 0);
                instance.hide();
            });
        },
        onHidden(instance) {
            const $row = $(instance.reference).closest(".message_row");
            $row.removeClass("has_popover has_actions_popover");
            instance.destroy();
            popover_instances.message_actions = undefined;
            message_actions_popover_keyboard_toggle = false;
        },
    });

    // Starred messages popover
    register_popover_menu(".starred-messages-sidebar-menu-icon", {
        ...left_sidebar_tippy_options,
        onMount(instance) {
            const $popper = $(instance.popper);
            popover_instances.starred_messages = instance;

            $popper.one("click", "#unstar_all_messages", () => {
                starred_messages_ui.confirm_unstar_all_messages();
                instance.hide();
            });
            $popper.one("click", "#toggle_display_starred_msg_count", () => {
                const data = {};
                const starred_msg_counts = user_settings.starred_message_counts;
                data.starred_message_counts = JSON.stringify(!starred_msg_counts);

                channel.patch({
                    url: "/json/settings",
                    data,
                });
                instance.hide();
            });
        },
        onShow(instance) {
            popovers.hide_all_except_sidebars();
            const show_unstar_all_button = starred_messages.get_count() > 0;

            instance.setContent(
                parse_html(
                    render_starred_messages_sidebar_actions({
                        show_unstar_all_button,
                        starred_message_counts: user_settings.starred_message_counts,
                    }),
                ),
            );
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.starred_messages = undefined;
        },
    });

    // Drafts popover
    register_popover_menu(".drafts-sidebar-menu-icon", {
        ...left_sidebar_tippy_options,
        onMount(instance) {
            const $popper = $(instance.popper);
            $popper.addClass("drafts-popover");
            popover_instances.drafts = instance;

            $popper.one("click", "#delete_all_drafts_sidebar", () => {
                drafts.confirm_delete_all_drafts();
                instance.hide();
            });
        },
        onShow(instance) {
            popovers.hide_all_except_sidebars();

            instance.setContent(parse_html(render_drafts_sidebar_actions({})));
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.drafts = undefined;
        },
    });

    // All messages popover
    register_popover_menu(".all-messages-sidebar-menu-icon", {
        ...left_sidebar_tippy_options,
        onMount(instance) {
            const $popper = $(instance.popper);
            $popper.addClass("all-messages-popover");
            popover_instances.all_messages = instance;

            $popper.one("click", "#mark_all_messages_as_read", () => {
                unread_ops.confirm_mark_all_as_read();
                instance.hide();
            });
        },
        onShow(instance) {
            popovers.hide_all_except_sidebars();
            instance.setContent(parse_html(render_all_messages_sidebar_actions()));
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.all_messages = undefined;
        },
    });

    delegate("body", {
        ...default_popover_props,
        target: "#send_later i",
        onUntrigger() {
            // This is only called when the popover is closed by clicking on `target`.
            $("#compose-textarea").trigger("focus");
        },
        onShow(instance) {
            popovers.hide_all_except_sidebars(instance);
            const formatted_send_later_time = get_formatted_selected_send_later_time();
            instance.setContent(
                parse_html(
                    render_send_later_popover({
                        formatted_send_later_time,
                    }),
                ),
            );
            popover_instances.send_later = instance;
            $(instance.popper).one("click", instance.hide);
        },
        onMount(instance) {
            const $popper = $(instance.popper);
            $popper.one("click", ".send_later_selected_send_later_time", () => {
                const send_at_timestamp = get_selected_send_later_timestamp();
                do_schedule_message(send_at_timestamp);
            });
            $popper.one("click", ".open_send_later_modal", open_send_later_menu);
        },
        onHidden(instance) {
            instance.destroy();
            popover_instances.send_later = undefined;
        },
    });
=======
    /* Configure popovers to hide when toggling overlays. */
    overlays.register_pre_open_hook(popovers.hide_all);
    overlays.register_pre_close_hook(popovers.hide_all);
    modals.register_pre_open_hook(popovers.hide_all);
    modals.register_pre_close_hook(popovers.hide_all);
>>>>>>> 8.0
}
