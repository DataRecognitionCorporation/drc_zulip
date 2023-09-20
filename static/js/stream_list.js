import $ from "jquery";
import _ from "lodash";

import render_filter_topics from "../templates/filter_topics.hbs";
import render_stream_privacy from "../templates/stream_privacy.hbs";
import render_stream_sidebar_row from "../templates/stream_sidebar_row.hbs";
import render_stream_sidebar_dropdown from "../templates/stream_sidebar_dropdown.hbs";
import render_stream_sidebar_dropdown_subfolder from "../templates/stream_sidebar_dropdown_subfolder.hbs";
import render_stream_subheader from "../templates/streams_subheader.hbs";
import render_subscribe_to_more_streams from "../templates/subscribe_to_more_streams.hbs";

import * as activity from "./activity";
import * as blueslip from "./blueslip";
import * as color_class from "./color_class";
import * as hash_util from "./hash_util";
import {
    $t
} from "./i18n";
import * as keydown_util from "./keydown_util";
import {
    ListCursor
} from "./list_cursor";
import * as narrow from "./narrow";
import * as narrow_state from "./narrow_state";
import {page_params} from "./page_params";
import * as peer_data from "./peer_data";
import * as pm_list from "./pm_list";
import * as popovers from "./popovers";
import * as resize from "./resize";
import * as scroll_util from "./scroll_util";
import * as settings_data from "./settings_data";
import * as stream_data from "./stream_data";
import * as stream_popover from "./stream_popover";
import * as stream_sort from "./stream_sort";
import * as sub_store from "./sub_store";
import * as topic_list from "./topic_list";
import * as topic_zoom from "./topic_zoom";
import * as ui from "./ui";
import * as ui_util from "./ui_util";
import * as unread from "./unread";
import * as unread_ui from "./unread_ui";

export let stream_cursor;

let has_scrolled = false;

export function update_count_in_dom($stream_li, count, stream_has_any_unread_mention_messages) {
    // The subscription_block properly excludes the topic list,
    // and it also has sensitive margins related to whether the
    // count is there or not.
    const $subscription_block = $stream_li.find(".subscription_block");

    ui_util.update_unread_count_in_dom($subscription_block, count);
    ui_util.update_unread_mention_info_in_dom(
        $subscription_block,
        stream_has_any_unread_mention_messages,
    );

    if (count === 0) {
        $subscription_block.removeClass("stream-with-count");
    } else {
        $subscription_block.addClass("stream-with-count");
    }
}

export function update_subfolder_count_in_dom(subfolder_id, count) {
    // The subscription_block properly excludes the topic list,
    // and it also has sensitive margins related to whether the
    // count is there or not.
    let subfolder_dom = ".subfolder_" + subfolder_id;
    const $subfolder_unread = $(subfolder_dom).find(".subfolder_unread_count");

    if (count === 0) {
        $subfolder_unread.text("");
        $subfolder_unread.hide();
        return;
    }

    $subfolder_unread.show();
    $subfolder_unread.text(count);
}

export function update_folder_count_in_dom(folder_name, count) {
    // The subscription_block properly excludes the topic list,
    // and it also has sensitive margins related to whether the
    // count is there or not.
    let test = "." + folder_name;
    const $subscription_block = $(test).find(".folder_unread_count");

    if (count === 0) {
        $subscription_block.text("");
        $subscription_block.hide();
        return;
    }


    $subscription_block.show();
    $subscription_block.text(count);
}

class StreamSidebar {
    all_rows = new Map();
    rows = new Map(); // stream id -> row widget
    folders = new Map(); // map of folder objects
    use_folders = true;
    counts = null;
    subfolder_id_latest = 0;

    set_row(stream_id, widget) {
        this.rows.set(stream_id, widget);
    }

    set_row_all(stream_id, widget){
        this.all_rows.set(stream_id, widget);
    }

    set_folder(folder_name, folder_obj) {
      this.folders.set(folder_name, folder_obj);
    }

    get_row(stream_id) {
        return this.rows.get(stream_id);
    }

    get_row_from_all(stream_id) {
        return this.all_rows.get(stream_id);
    }

    get_rows_from_all(stream_id) {
        return this.all_rows;
    }

    get_folder(folder_name) {
        return this.folders.get(folder_name);
    }

    get_rows() {
        return this.rows;
    }

    get_folders() {
        return this.folders;
    }

    has_row_for(stream_id) {
        return this.rows.has(stream_id);
    }

    set_use_folders(set_use_folders) {
        this.use_folders = true;
    }

    get_use_folders() {
        return this.use_folders;
    }

    remove_row(stream_id) {
        // This only removes the row from our data structure.
        // Our caller should use build_stream_list() to re-draw
        // the sidebar, so that we don't have to deal with edge
        // cases like removing the last pinned stream (and removing
        // the divider).

        this.rows.delete(stream_id);
    }

    get_folder_by_name(folder_name) {
        this.rows.forEach(function(value, key) {
            if (key == folder_name) {
                return value;
            }
        })

    }

    get_row_by_id(stream_id) {
      for(let [folder_name, folder_obj] of this.folders) {
        let row = folder_obj.get_row_by_id(stream_id);
        if(row != null){
          return row;
        }
      }
      let row = this.rows.get(stream_id);
      if(row != null) {
        return row;
      }
      return null;
    }

    get_folder_stream_ids() {
      const all_ids = [];
      for(let [key, folder] of this.folders) {
        // for(let subfolder of folder.sub_folders) {
        for (const [key, value] of Object.entries(folder.sub_folders)) {
          for(let row of value){
            all_ids.push(parseInt(row.sub.stream_id));
          }
        }

      }
      return all_ids;
    }

    get_subfolder_stream_ids(folder, subfolder_name) {
      let subfolders = this.get_folder(folder).get_subfolders();
      for(const subfolder of subfolders) {
        const name = subfolder.subfolder_name;
        if(name == subfolder_name){
          let all_ids = subfolder.get_all_ids();
          return all_ids;
        }
      }
      return null;
    }

    update_sidebar_unread_count(counts){
      if(counts == null) {
        counts = this.counts;
      } else {
        this.counts = counts;
      }

      for(let [folder_name, folder] of this.folders) {

        let folder_count = 0;
        const all_subfolders = folder.get_subfolders();
        for (let subfolder of all_subfolders) {
          let subfolder_count = 0;
          const all_rows = subfolder.get_rows();
          for(let row of all_rows){
            if(counts.has(row.sub.stream_id)) {
              subfolder_count = subfolder_count + counts.get(row.sub.stream_id);
            }
          }
          folder_count = folder_count + subfolder_count;

          update_subfolder_count_in_dom(subfolder.id, subfolder_count);
        }
        update_folder_count_in_dom(folder.folder_name, folder_count);
      }
    }

}
export const stream_sidebar = new StreamSidebar();

function get_search_term() {
    const $search_box = $(".stream-list-filter");
    const search_term = $search_box.expectOne().val().trim();
    return search_term;
}

export function add_sidebar_row(sub) {
    if(stream_sidebar.get_use_folders()) {
        build_subfolder_rows();
    } else {
        build_stream_list();
    }

    create_sidebar_row(sub);
    stream_cursor.redraw();
}

export function remove_sidebar_row(stream_id) {
    stream_sidebar.remove_row(stream_id);
    if(stream_sidebar.get_use_folders()) {
        build_subfolder_rows();
    } else {
        build_stream_list();
    }

    stream_cursor.redraw();
}

export function create_initial_sidebar_rows() {
    // This code is slightly opaque, but it ends up building
    // up list items and attaching them to the "sub" data
    // structures that are kept in stream_data.js.
    const subs = stream_data.subscribed_subs();

    for (const sub of subs) {
        create_sidebar_row(sub);
    }
}

export function create_initial_sidebar_folders() {
    const subs = stream_data.subscribed_subs();

    const regex = new RegExp('^[A-Z]{3}[0-9]{3}$');
    const regex_num_letters = new RegExp('^[a-zA-Z0-9\'_,.-]*$')
    let dict = {}

    for (const sub of subs) {
        stream_sidebar.set_row_all(sub.stream_id, new StreamSidebarRow(sub, ""));

        const myArray = sub.name.split(" - ");

        let val_continue = false;
        if (regex_num_letters.test(myArray[0]) && myArray.length == 3) {
            // for(let item of myArray) {
            //   if(!regex_num_letters.test(item)){
            //     val_continue = true;
            //     create_sidebar_row(sub);
            //     break;
            //   }
            // }
            if(val_continue){
              continue;
            }
            
            if (!(myArray[0] in dict)) {
                dict[myArray[0]] = {};
            }

            if (!(myArray[1] in dict[myArray[0]])) {
                let tmp_dict = dict[myArray[0]];
                tmp_dict[myArray[1]] = [];
                dict[myArray[0]] = tmp_dict;
            }
            let leader_name = myArray[2];
            let tmp = dict[myArray[0]][myArray[1]];
            const stream_row = new StreamSidebarRow(sub, leader_name);

            tmp.push(stream_row);
            dict[myArray[0]][myArray[1]] = tmp;
        } else {
            create_sidebar_row(sub);
        }
    }

    for (const [folder_name, subfolders] of Object.entries(dict)) {
        stream_sidebar.set_folder(folder_name, new StreamSidebarFolder(folder_name, subfolders));
    }
}

export function build_stream_folder(force_rerender) {
    const streams = stream_data.subscribed_stream_ids();

    const $parent = $("#stream_folders");
    if (streams.length === 0) {
        $parent.empty();
        return;
    }
    const elems = [];

    let all_folders = stream_sidebar.get_folders();
    all_folders.forEach((folder) => {
        const $list_item = $(render_stream_sidebar_dropdown(folder.get_render_data()));
        elems.push($list_item);
    })

    $parent.empty();
    $parent.append(elems);
}

export function remove_stream_folders() {
    const $parent = $("#stream_folders");
    $parent.empty();
}

export function build_subfolder_rows(folder_name) {
    if(folder_name == null || folder_name == undefined) {
      return;
    }

    let folder = stream_sidebar.get_folder(folder_name);
    let subfolders = folder.get_subfolders();
    const parent = ".subfolder_" + folder_name;
    const $parent = $(parent);

    const elems = [];
    for (const subfolder of subfolders) {
        let tmp_dict = {
          folder_name: folder_name,
          subfolder_name: subfolder.subfolder_name,
          subfolder_id: subfolder.id,
          // subfolder_name_underscore: key.replaceAll(' ', '_')
        }

        elems.push($(render_stream_sidebar_dropdown_subfolder(tmp_dict)));
    }

    // $parent.removeClass("expand");
    topic_list.clear();
    $parent.empty();
    $parent.append(elems);

    let stream_subfolder_id = "#stream_subfolder_" + folder_name;
    $(stream_subfolder_id).on("click", "li", (e) => {
        const $elt = $(e.target).parents("li");
        const subfolder_name = $elt.attr("subfolder_name");
        const subfolder_id = $elt.attr("subfolder_id");
        const folder_name = $elt.attr("folder_name");

        if(subfolder_name == null) {
          return;
        }

        const folder_rows_ul = ".subfolder_rows_" + subfolder_id;
        let length_of_li = $(folder_rows_ul).children("li").length;

        if(length_of_li > 0){
          $("ul#stream_folders li").removeClass("active-filter");
          const $folder = $(folder_rows_ul);
          $folder.empty();
          return;
        } else {
          build_stream_list_folders(folder_name, subfolder_name, subfolder_id);
        }
    });
}

// export function close_subfolder(subfolder_name) {
//   deselect_stream_items();
//   const folder = ".subfolder_rows_" + subfolder_name;
//   const $folder = $(folder);
//
//   topic_list.clear();
//   $folder.empty();
// }


export function build_stream_list_below_folders(render_all_streams) {
    if(render_all_streams == true) {
      let force_render = true;
      build_stream_list(force_render);
      return;
    }

    const $parent = $("#stream_filters");
    let unsorted_rows;

    unsorted_rows = stream_sidebar.get_rows();

    let stream_ids = [];
    for(let stream of unsorted_rows) {
      stream_ids.push(stream[0]);
    }
    const stream_groups = stream_sort.sort_groups(stream_ids, get_search_term());
    let folder_stream_groups = {
        dormant_streams: [],
        muted_active_streams: [],
        muted_pinned_streams: [],
        normal_streams: [],
        normal_streams: [],
        pinned_streams: []
    }

    for (const stream_group_name in stream_groups) {
        for (let i in stream_groups[stream_group_name]) {

          let stream_id = stream_groups[stream_group_name][i]

          if(stream_ids.includes(parseInt(stream_id))) {
              let temp_list = folder_stream_groups[stream_group_name]
              temp_list.push(stream_id);
              folder_stream_groups[stream_group_name] = temp_list;
            }
        }
    }

    topic_list.clear();
    $parent.empty();

    let elems = [];
    const any_pinned_streams =
        folder_stream_groups.pinned_streams.length > 0 || folder_stream_groups.muted_pinned_streams.length > 0;
    const any_normal_streams =
        folder_stream_groups.normal_streams.length > 0 || folder_stream_groups.muted_active_streams.length > 0;
    const any_dormant_streams = folder_stream_groups.dormant_streams.length > 0;

    const need_section_subheaders =
        (any_pinned_streams ? 1 : 0) +
            (any_normal_streams ? 1 : 0) +
            (any_dormant_streams ? 1 : 0) >=
        2;

    if (any_pinned_streams && need_section_subheaders) {
        elems.push(
            render_stream_subheader({
                subheader_name: $t({
                    defaultMessage: "Pinned",
                }),
            }),
        );
    }

    for (const stream_id of folder_stream_groups.pinned_streams) {
        let list_item = unsorted_rows.get(stream_id);
        list_item.update_whether_active();
        elems.push(list_item.get_li())
    }

    for (const stream_id of folder_stream_groups.muted_pinned_streams) {
        let list_item = unsorted_rows.get(stream_id);
        list_item.update_whether_active();
        elems.push(list_item.get_li())
    }

    if (any_normal_streams && need_section_subheaders) {
        elems.push(
            render_stream_subheader({
                subheader_name: $t({
                    defaultMessage: "Active",
                }),
            }),
        );
    }

    for (const stream_id of folder_stream_groups.normal_streams) {
        let list_item = unsorted_rows.get(stream_id);
        list_item.update_whether_active();
        elems.push(list_item.get_li())
    }

    for (const stream_id of folder_stream_groups.muted_active_streams) {
        let list_item = unsorted_rows.get(stream_id);
        list_item.update_whether_active();
        elems.push(list_item.get_li())
    }

    if (any_dormant_streams && need_section_subheaders) {
        elems.push(
            render_stream_subheader({
                subheader_name: $t({
                    defaultMessage: "Inactive",
                }),
            }),
        );
    }

    for (const stream_id of folder_stream_groups.dormant_streams) {
        let list_item = unsorted_rows.get(stream_id);
        list_item.update_whether_active();
        elems.push(list_item.get_li())
    }


    $parent.append(elems);

}

export function build_stream_list(force_rerender) {

    
    // The stream list in the left sidebar contains 3 sections:
    // pinned, normal, and dormant streams, with headings above them
    // as appropriate.
    //
    // Within the first two sections, muted streams are sorted to the
    // bottom; we skip that for dormant streams to simplify discovery.
    const streams = stream_data.subscribed_stream_ids();
    const $parent = $("#stream_filters");
    if (streams.length === 0) {
        $parent.empty();
        return;
    }

    // The main logic to build the list is in stream_sort.js, and
    // we get five lists of streams (pinned/normal/muted_pinned/muted_normal/dormant).
    const stream_groups = stream_sort.sort_groups(streams, get_search_term());

    if (stream_groups.same_as_before && !force_rerender) {
        return;
    }

    const elems = [];

    function add_sidebar_li(stream_id) {
        let sidebar_row;
        if(stream_sidebar.get_use_folders()) {
          sidebar_row = stream_sidebar.get_row_from_all(stream_id);
        } else {
          sidebar_row = stream_sidebar.get_row(stream_id);
        }
        if(sidebar_row == null) {
          return;
        }
        sidebar_row.update_whether_active();
        elems.push(sidebar_row.get_li());
    }

    topic_list.clear();
    $parent.empty();

    const any_pinned_streams =
        stream_groups.pinned_streams.length > 0 || stream_groups.muted_pinned_streams.length > 0;
    const any_normal_streams =
        stream_groups.normal_streams.length > 0 || stream_groups.muted_active_streams.length > 0;
    const any_dormant_streams = stream_groups.dormant_streams.length > 0;

    const need_section_subheaders =
        (any_pinned_streams ? 1 : 0) +
            (any_normal_streams ? 1 : 0) +
            (any_dormant_streams ? 1 : 0) >=
        2;

    if (any_pinned_streams && need_section_subheaders) {
        elems.push(
            render_stream_subheader({
                subheader_name: $t({
                    defaultMessage: "Pinned",
                }),
            }),
        );
    }

    for (const stream_id of stream_groups.pinned_streams) {
        add_sidebar_li(stream_id);
    }

    for (const stream_id of stream_groups.muted_pinned_streams) {
        add_sidebar_li(stream_id);
    }

    if (any_normal_streams && need_section_subheaders) {
        elems.push(
            render_stream_subheader({
                subheader_name: $t({
                    defaultMessage: "Active",
                }),
            }),
        );
    }

    for (const stream_id of stream_groups.normal_streams) {
        add_sidebar_li(stream_id);
    }

    for (const stream_id of stream_groups.muted_active_streams) {
        add_sidebar_li(stream_id);
    }

    if (any_dormant_streams && need_section_subheaders) {
        elems.push(
            render_stream_subheader({
                subheader_name: $t({
                    defaultMessage: "Inactive",
                }),
            }),
        );
    }

    for (const stream_id of stream_groups.dormant_streams) {
        add_sidebar_li(stream_id);
    }

    $parent.append(elems);
}

export function build_stream_list_folders(folder_name, subfolder_name, subfolder_id) {
    if(folder_name == null || subfolder_name == null){
      return;
    }
    let folder = stream_sidebar.get_folder(folder_name);
    const subfolders = folder.get_subfolders();

    const streams = stream_data.subscribed_stream_ids();
    if (streams.length === 0) {
        topic_list.clear();
        $parent.empty();
        return;
    }

    const all_folder_stream_ids = stream_sidebar.get_subfolder_stream_ids(folder_name, subfolder_name);
    const elems = [];
    const stream_groups = stream_sort.sort_groups(streams, get_search_term());

    let folder_stream_groups = {
        dormant_streams: [],
        muted_active_streams: [],
        muted_pinned_streams: [],
        normal_streams: [],
        normal_streams: [],
        pinned_streams: []
    }

    for (const stream_group_name in stream_groups) {
        for (let i in stream_groups[stream_group_name]) {

          let stream_id = stream_groups[stream_group_name][i]

          if(all_folder_stream_ids.includes(parseInt(stream_id))) {
              let temp_list = folder_stream_groups[stream_group_name]
              temp_list.push(stream_id);
              folder_stream_groups[stream_group_name] = temp_list;
            }
        }
    }

    const parent = ".subfolder_rows_" + subfolder_id;

    const $parent = $(parent);

    topic_list.clear();
    $parent.empty();

    const any_pinned_streams =
        folder_stream_groups.pinned_streams.length > 0 || folder_stream_groups.muted_pinned_streams.length > 0;
    const any_normal_streams =
        folder_stream_groups.normal_streams.length > 0 || folder_stream_groups.muted_active_streams.length > 0;
    const any_dormant_streams = folder_stream_groups.dormant_streams.length > 0;

    const need_section_subheaders =
        (any_pinned_streams ? 1 : 0) +
            (any_normal_streams ? 1 : 0) +
            (any_dormant_streams ? 1 : 0) >=
        2;

    if (any_pinned_streams && need_section_subheaders) {
        elems.push(
            render_stream_subheader({
                subheader_name: $t({
                    defaultMessage: "Pinned",
                }),
            }),
        );
    }

    for (let subfolder of subfolders) {
      for(let row of subfolder.get_rows()){
        if(folder_stream_groups.pinned_streams.includes(parseInt(row.sub.stream_id))) {
          row.update_whether_active();
          elems.push(row.get_li())
        }
      }
    }

    for (let subfolder of subfolders) {
      for(let row of subfolder.get_rows()){
        if(folder_stream_groups.muted_pinned_streams.includes(parseInt(row.sub.stream_id))) {
          row.update_whether_active();
          elems.push(row.get_li())
        }
      }
    }

    if (any_normal_streams && need_section_subheaders) {
        elems.push(
            render_stream_subheader({
                subheader_name: $t({
                    defaultMessage: "Active",
                }),
            }),
        );
    }

    for (let subfolder of subfolders) {
      for(let row of subfolder.get_rows()){
        if(folder_stream_groups.normal_streams.includes(parseInt(row.sub.stream_id))) {
          row.update_whether_active();
          elems.push(row.get_li())
        }
      }
    }

    for (let subfolder of subfolders) {
      for(let row of subfolder.get_rows()){
        if(folder_stream_groups.muted_active_streams.includes(parseInt(row.sub.stream_id))) {
          row.update_whether_active();
          elems.push(row.get_li())
        }
      }
    }

    if (any_dormant_streams && need_section_subheaders) {
        elems.push(
            render_stream_subheader({
                subheader_name: $t({
                    defaultMessage: "Inactive",
                }),
            }),
        );
    }

    for (let subfolder of subfolders) {
      for(let row of subfolder.get_rows()){
        if(folder_stream_groups.dormant_streams.includes(parseInt(row.sub.stream_id))) {
          row.update_whether_active();
          elems.push(row.get_li())
        }
      }
    }

    $parent.append(elems);
}

export function get_stream_li(stream_id) {
    let row = null;
    if(stream_sidebar.get_use_folders()){
        row = stream_sidebar.get_row_by_id(stream_id);
    } else {
        row = stream_sidebar.get_row(stream_id);
    }

    if (!row) {
        // Not all streams are in the sidebar, so we don't report
        // an error here, and it's up for the caller to error if
        // they expected otherwise.
        return undefined;
    }

    const $li = row.get_li();
    if (!$li) {
        blueslip.error("Cannot find li for id " + stream_id);
        return undefined;
    }

    if ($li.length > 1) {
        blueslip.error("stream_li has too many elements for " + stream_id);
        return undefined;
    }

    return $li;
}

export function update_subscribe_to_more_streams_link() {
    const can_subscribe_stream_count = stream_data
        .unsubscribed_subs()
        .filter((sub) => stream_data.can_toggle_subscription(sub)).length;

    const can_create_streams =
        settings_data.user_can_create_private_streams() ||
        settings_data.user_can_create_public_streams() ||
        settings_data.user_can_create_web_public_streams();

    $("#subscribe-to-more-streams").html(
        render_subscribe_to_more_streams({
            can_subscribe_stream_count,
            can_create_streams,
            exactly_one_unsubscribed_stream: can_subscribe_stream_count === 1,
        }),
    );
}

function stream_id_for_elt($elt) {
    return Number.parseInt($elt.attr("data-stream-id"), 10);
}

export function zoom_in_topics(options) {
    // This only does stream-related tasks related to zooming
    // in to more topics, which is basically hiding all the
    // other streams.

    $("#streams_list").expectOne().removeClass("zoom-out").addClass("zoom-in");

    // Hide stream list titles and pinned stream splitter
    $(".stream-filters-label").each(function() {
        $(this).hide();
    });
    $(".streams_subheader").each(function() {
        $(this).hide();
    });

    $("#stream_filters li.narrow-filter").each(function() {
        const $elt = $(this);
        const stream_id = options.stream_id;

        if (stream_id_for_elt($elt) === stream_id) {
            $elt.show();
            // Add search box for topics list.
            $elt.children("div.bottom_left_row").append(render_filter_topics());
            $("#filter-topic-input").trigger("focus");
            $("#clear_search_topic_button").hide();
        } else {
            $elt.hide();
        }
    });

    stream_popover.register_click_handlers();
}

export function zoom_out_topics() {
    // Show stream list titles and pinned stream splitter
    $(".stream-filters-label").each(function() {
        $(this).show();
    });
    $(".streams_subheader").each(function() {
        $(this).show();
    });

    $("#streams_list").expectOne().removeClass("zoom-in").addClass("zoom-out");
    $("#stream_filters li.narrow-filter").show();
    // Remove search box for topics list from DOM.
    $(".filter-topics").remove();
}

export function set_in_home_view(stream_id, in_home) {
    const $li = get_stream_li(stream_id);
    if (!$li) {
        blueslip.error("passed in bad stream id " + stream_id);
        return;
    }

    if (in_home) {
        $li.removeClass("out_of_home_view");
    } else {
        $li.addClass("out_of_home_view");
    }
}

function build_stream_sidebar_li(sub, leader_name) {
    const name = sub.name;
    const args = {
        name,
        leader_name: leader_name,
        id: sub.stream_id,
        uri: hash_util.by_stream_url(sub.stream_id),
        is_muted: stream_data.is_muted(sub.stream_id) === true,
        invite_only: sub.invite_only,
        is_web_public: sub.is_web_public,
        color: sub.color,
        pin_to_top: sub.pin_to_top,
    };
    args.dark_background = color_class.get_css_class(args.color);
    const $list_item = $(render_stream_sidebar_row(args));
    return $list_item;
}

class StreamSidebarFolder {

    constructor(folder_name, sub_folders) {
        this.folder_name = folder_name;
        this.sub_folders = [];

        for (const [subfolder_name, rows] of Object.entries(sub_folders)) {
          let id = stream_sidebar.subfolder_id_latest + 1;
          this.sub_folders.push(new StreamSidebarSubFolder(id, subfolder_name, rows));
          stream_sidebar.subfolder_id_latest = id;
        }
    }

    get_subfolder_name() {
        return this.folder_name;
    }

    get_subfolders() {
        return this.sub_folders;
    }

    get_all_rows() {
      let all_rows = [];
      for(let subfolder of this.sub_folders) {
        all_rows.push(subfolder.get_rows());
      }
      return all_rows;
    }

    get_all_row_ids() {
      let ids = [];
      for(let subfolder of this.sub_folders) {
        ids.concat(subfolder.get_all_ids());
      }
      return ids;
    }

    get_row_by_id(id) {
      for(let subfolder of this.sub_folders) {
        let row = subfolder.get_row_by_id(id);
        if(row != null) {
          return row;
        }
      }
      return null;
    }

    get_render_data() {
      const temp = {
        name: this.folder_name
      }
      return temp;
    }
}

class StreamSidebarSubFolder {

    constructor(id, name, rows) {
      this.id = id;
      this.subfolder_name = name;
      this.rows = rows;
    }

    get_rows() {
      return this.rows;
    }

    // return a list of ids of all rows within subfolder
    get_all_ids() {
      let ids = [];
      for(let row of this.rows) {
        ids.push(row.sub.stream_id);
      }
      return ids;
    }

    get_row_by_id(id) {
      for(let row of this.rows) {
        if(id == row.sub.stream_id){
          return row;
        }
      }
      return null;
    }

    get_render_data() {
      const temp = {
        subfolder_name: this.subfolder_name,
        subfolder_id: this.id
      }
      return temp;
    }
}

class StreamSidebarRow {
    constructor(sub, leader_name) {
        this.leader_name = leader_name;
        this.sub = sub;
        this.$list_item = build_stream_sidebar_li(sub, leader_name);
        this.update_unread_count();
    }

    update_whether_active() {
        if (stream_data.is_active(this.sub) || this.sub.pin_to_top === true) {
            this.$list_item.removeClass("inactive_stream");
        } else {
            this.$list_item.addClass("inactive_stream");
        }
    }

    get_li() {
        return this.$list_item;
    }

    remove() {
        this.$list_item.remove();
    }

    update_unread_count() {
        const count = unread.num_unread_for_stream(this.sub.stream_id);
        const stream_has_any_unread_mention_messages = unread.stream_has_any_unread_mentions(
            this.sub.stream_id,
        );
        update_count_in_dom(this.$list_item, count, stream_has_any_unread_mention_messages);
    }
}

function build_stream_sidebar_row(sub) {
    stream_sidebar.set_row(sub.stream_id, new StreamSidebarRow(sub, ""));
    // stream_sidebar.set_row_all(sub.stream_id, new StreamSidebarRow(sub, ""));
}


export function create_sidebar_row(sub) {
    if (stream_sidebar.has_row_for(sub.stream_id)) {
        // already exists
        blueslip.warn("Dup try to build sidebar row for stream " + sub.stream_id);
        return;
    }
    build_stream_sidebar_row(sub);
}



export function redraw_stream_privacy(sub) {
    const $li = get_stream_li(sub.stream_id);
    if (!$li) {
        // We don't want to raise error here, if we can't find stream in subscription
        // stream list. Cause we allow org admin to update stream privacy
        // even if they don't subscribe to public stream.
        return;
    }

    const $div = $li.find(".stream-privacy");
    const dark_background = color_class.get_css_class(sub.color);

    const args = {
        invite_only: sub.invite_only,
        is_web_public: sub.is_web_public,
        dark_background,
    };

    const html = render_stream_privacy(args);
    $div.html(html);
}

function set_stream_unread_count(stream_id, count, stream_has_any_unread_mention_messages) {
    const $stream_li = get_stream_li(stream_id);
    if (!$stream_li) {
        // This can happen for legitimate reasons, but we warn
        // just in case.
        blueslip.warn("stream id no longer in sidebar: " + stream_id);
        return;
    }
    update_count_in_dom($stream_li, count, stream_has_any_unread_mention_messages);
}

export function update_streams_sidebar(force_rerender) {

    if (!force_rerender && topic_zoom.is_zoomed_in()) {
        // We do our best to update topics that are displayed
        // in case user zoomed in. Streams list will be updated,
        // once the user zooms out. This avoids user being zoomed out
        // when a new message causes streams to re-arrange.
        const filter = narrow_state.filter();
        update_stream_sidebar_for_narrow(filter);
        topic_zoom.set_pending_stream_list_rerender(true);
        return;
    }
    topic_zoom.set_pending_stream_list_rerender(false);

    build_stream_list(force_rerender);

    if(stream_sidebar.use_folders){
      let render_all_streams = false
      build_stream_list_below_folders(render_all_streams);
    } else {
      build_stream_list(force_rerender);
    }

    stream_cursor.redraw();

    if (!narrow_state.active()) {
        return;
    }

    const filter = narrow_state.filter();

    update_stream_sidebar_for_narrow(filter);
}

export function update_dom_with_unread_counts(counts) {
    // counts.stream_count maps streams to counts
    for (const [stream_id, count] of counts.stream_count) {
        const stream_has_any_unread_mention_messages =
            counts.streams_with_mentions.includes(stream_id);
        set_stream_unread_count(stream_id, count, stream_has_any_unread_mention_messages);
    }

    // add upp all folders counts
    stream_sidebar.update_sidebar_unread_count(counts.stream_count);
}

export function rename_stream(sub) {
    // The sub object is expected to already have the updated name
    if(stream_sidebar.use_folders){
      update_streams_sidebar(true); // big hammer
      return;
    }
    build_stream_sidebar_row(sub);
}

export function refresh_pinned_or_unpinned_stream(sub) {
    // Pinned/unpinned streams require re-ordering.
    // We use kind of brute force now, which is probably fine.
    if(stream_sidebar.use_folders) {

      let render_all_streams = false
      build_stream_list_below_folders(render_all_streams);
    } else {
      build_stream_sidebar_row(sub);
      update_streams_sidebar();
    }

    // Only scroll pinned topics into view.  If we're unpinning
    // a topic, we may be literally trying to get it out of
    // our sight.
    if (sub.pin_to_top) {
        const $stream_li = get_stream_li(sub.stream_id);
        if (!$stream_li) {
            blueslip.error("passed in bad stream id " + sub.stream_id);
            return;
        }
        scroll_stream_into_view($stream_li);
    }
}

export function refresh_muted_or_unmuted_stream(sub) {
    if(stream_sidebar.use_folders){
      update_streams_sidebar();
      return;
    }
    build_stream_sidebar_row(sub);
    update_streams_sidebar();
}

export function get_sidebar_stream_topic_info(filter) {
    const result = {
        stream_id: undefined,
        topic_selected: false,
    };

    const op_stream = filter.operands("stream");
    if (op_stream.length === 0) {
        return result;
    }

    const stream_name = op_stream[0];
    const stream_id = stream_data.get_stream_id(stream_name);

    if (!stream_id) {
        return result;
    }

    if (!stream_data.is_subscribed(stream_id)) {
        return result;
    }

    result.stream_id = stream_id;

    const op_topic = filter.operands("topic");
    result.topic_selected = op_topic.length === 1;

    return result;
}

function deselect_stream_items() {
    $("ul#stream_filters li").removeClass("active-filter");
    $("ul#stream_folders li").removeClass("active-filter");
}

export function update_stream_sidebar_for_narrow(filter) {
    const info = get_sidebar_stream_topic_info(filter);

    deselect_stream_items();

    const stream_id = info.stream_id;

    if (!stream_id) {
        topic_zoom.clear_topics();
        return undefined;
    }

    const $stream_li = get_stream_li(stream_id);

    if (!$stream_li) {
        // This is a sanity check.  When we narrow to a subscribed
        // stream, there will always be a stream list item
        // corresponding to that stream in our sidebar.  This error
        // stopped appearing from March 2018 until at least
        // April 2020, so if it appears again, something regressed.
        blueslip.error("No stream_li for subscribed stream " + stream_id);
        topic_zoom.clear_topics();
        return undefined;
    }

    if (!info.topic_selected) {
        $stream_li.addClass("active-filter");
    }

    if (stream_id !== topic_list.active_stream_id()) {
        topic_zoom.clear_topics();
    }

    topic_list.rebuild($stream_li, stream_id);

    // DRC MODIFICATION
    let stream_name = $("ul .active-filter .stream-name").text();
    let id = stream_data.get_stream_id(stream_name);
    let is_private = stream_data.is_private(stream_name);
    if(stream_name == ""){
      return $stream_li;
    }

    if(page_params.is_guest && is_private){
      let user_ids = peer_data.get_subscribers(stream_id);
      activity.drc_build_user_sidebar(user_ids);
    } else if(page_params.is_guest && !is_private){
      activity.drc_build_user_sidebar(0);
    }

    return $stream_li;
}

export function handle_narrow_activated(filter) {
    const $stream_li = update_stream_sidebar_for_narrow(filter);
    if ($stream_li) {
        scroll_stream_into_view($stream_li);
    }
}

export function handle_narrow_deactivated() {
    deselect_stream_items();
    topic_zoom.clear_topics();
}

function focus_stream_filter(e) {
    stream_cursor.reset();
    e.stopPropagation();
}

function keydown_enter_key() {
    const stream_id = stream_cursor.get_key();

    if (stream_id === undefined) {
        // This can happen for empty searches, no need to warn.
        return;
    }

    const sub = sub_store.get(stream_id);

    if (sub === undefined) {
        blueslip.error("Unknown stream_id for search/enter: " + stream_id);
        return;
    }

    clear_and_hide_search();
    narrow.by("stream", sub.name, {
        trigger: "sidebar enter key"
    });
}

function actually_update_streams_for_search() {
    // stream_sidebar.use_folders = false;
    if(stream_sidebar.use_folders){
      let render_all_streams = true;
      build_stream_list_below_folders(render_all_streams);
    } else {
      let force_render = true;
      build_stream_list(force_render);
    }

    stream_cursor.redraw();

    if (!narrow_state.active()) {
        return;
    }

    const filter = narrow_state.filter();
    update_stream_sidebar_for_narrow(filter);
    resize.resize_page_components();
    stream_cursor.reset();
}

const update_streams_for_search = _.throttle(actually_update_streams_for_search, 50);

export function initialize() {
    if(stream_sidebar.get_use_folders() && !page_params.is_guest) {
        create_initial_sidebar_folders();
        build_stream_folder();
        let render_all_streams = true;
        build_stream_list_below_folders(render_all_streams);
    } else {
        create_initial_sidebar_rows();
        build_stream_list();
    }

    // We build the stream_list now.  It may get re-built again very shortly
    // when new messages come in, but it's fairly quick.

    update_subscribe_to_more_streams_link();
    set_event_handlers();
}

export function set_event_handlers() {
    $("#stream_folders").on("click", "li .folder_name", (e) => {
        let $elt = $(e.target).parents("li");
        let folder_name =  $(e.target).attr("folder_name");
        const subfolder_name = ".subfolder_" + folder_name;
        let length_of_ul = $(subfolder_name).children("li").length;

        if(length_of_ul > 0) {
            $(".subfolders").off("click");
            $(".subfolders").empty();
            return;
        }
        $(".subfolders").off("click");
        $(".subfolders").empty();


        build_subfolder_rows(folder_name);
        stream_sidebar.update_sidebar_unread_count(null);
    });

    $("#stream_filters").on("click", "li .subscription_block", (e) => {
        if (e.metaKey || e.ctrlKey) {
            return;
        }
        const stream_id = stream_id_for_elt($(e.target).parents("li"));
        const sub = sub_store.get(stream_id);
        popovers.hide_all();
        narrow.by("stream", sub.name, {trigger: "sidebar"});

        clear_and_hide_search();

        e.preventDefault();
        e.stopPropagation();
    });

    $("#clear_search_stream_button").on("click", clear_search);

    $("#streams_header")
        .expectOne()
        .on("click", (e) => {
            e.preventDefault();
            if (e.target.id === "streams_inline_icon") {
                return;
            }
            toggle_filter_displayed(e);
        });

    function toggle_pm_header_icon() {
        if (pm_list.is_private_messages_collapsed()) {
            return;
        }

        const scroll_position = $(
            "#left_sidebar_scroll_container .simplebar-content-wrapper",
        ).scrollTop();
        const pm_list_height = $("#private_messages_list").height();
        if (scroll_position > pm_list_height) {
            $("#toggle_private_messages_section_icon").addClass("fa-caret-right");
            $("#toggle_private_messages_section_icon").removeClass("fa-caret-down");
        } else {
            $("#toggle_private_messages_section_icon").addClass("fa-caret-down");
            $("#toggle_private_messages_section_icon").removeClass("fa-caret-right");
        }
    }

    // check for user scrolls on streams list for first time
    ui.get_scroll_element($("#left_sidebar_scroll_container")).on("scroll", () => {
        has_scrolled = true;
        toggle_pm_header_icon();
    });

    stream_cursor = new ListCursor({
        list: {
            scroll_container_sel: "#left_sidebar_scroll_container",
            find_li(opts) {
                const stream_id = opts.key;
                const li = get_stream_li(stream_id);
                return li;
            },
            first_key: stream_sort.first_stream_id,
            prev_key: stream_sort.prev_stream_id,
            next_key: stream_sort.next_stream_id,
        },
        highlight_class: "highlighted_stream",
    });

    const $search_input = $(".stream-list-filter").expectOne();

    keydown_util.handle({
        $elem: $search_input,
        handlers: {
            Enter() {
                keydown_enter_key();
                return true;
            },
            ArrowUp() {
                stream_cursor.prev();
                return true;
            },
            ArrowDown() {
                stream_cursor.next();
                return true;
            },
        },
    });

    $search_input.on("click", focus_stream_filter);
    $search_input.on("focusout", () => stream_cursor.clear());
    $search_input.on("input", update_streams_for_search);
}

export function searching() {
    return $(".stream-list-filter").expectOne().is(":focus");
}

export function escape_search() {
    const $filter = $(".stream-list-filter").expectOne();
    if ($filter.val() === "") {
        clear_and_hide_search();
        return;
    }
    $filter.val("");
    update_streams_for_search();
}

export function clear_search(e) {
    e.stopPropagation();
    const $filter = $(".stream-list-filter").expectOne();
    if ($filter.val() === "") {
        clear_and_hide_search();
        return;
    }
    $filter.val("");
    $filter.trigger("blur");
    update_streams_for_search();
}

export function show_search_section() {
    $(".stream_search_section").expectOne().removeClass("notdisplayed");
    resize.resize_stream_filters_container();
}

export function hide_search_section() {
    $(".stream_search_section").expectOne().addClass("notdisplayed");
    resize.resize_stream_filters_container();
}

export function initiate_search() {
    remove_stream_folders();
    let render_all_streams = true;
    build_stream_list_below_folders(render_all_streams);

    show_search_section();
    const $filter = $(".stream-list-filter").expectOne();

    if (
        // Check if left column is a popover and is not visible.
        $("#streamlist-toggle").is(":visible") &&
        !$(".app-main .column-left").hasClass("expanded")
    ) {
        popovers.hide_all();
        stream_popover.show_streamlist_sidebar();
    }
    $filter.trigger("focus");

    stream_cursor.reset();
}

export function clear_and_hide_search() {
    const $filter = $(".stream-list-filter");
    if ($filter.val() !== "") {
        $filter.val("");
        update_streams_for_search();
    }
    stream_cursor.clear();
    $filter.trigger("blur");

    build_stream_folder();
    let render_all_streams = false;
    build_stream_list_below_folders(render_all_streams);
    unread_ui.update_unread_counts();

    hide_search_section();
}

export function toggle_filter_displayed(e) {
    if ($(".stream_search_section.notdisplayed").length === 0) {
        clear_and_hide_search();
    } else {
        initiate_search();
    }
    e.preventDefault();
}

export function scroll_stream_into_view($stream_li) {
    const $container = $("#left_sidebar_scroll_container");

    if ($stream_li.length !== 1) {
        blueslip.error("Invalid stream_li was passed in");
        return;
    }
    const stream_header_height = $("#streams_header").outerHeight();
    scroll_util.scroll_element_into_container($stream_li, $container, stream_header_height);
}

export function maybe_scroll_narrow_into_view() {
    // we don't want to interfere with user scrolling once the page loads
    if (has_scrolled) {
        return;
    }

    const $stream_li = get_current_stream_li();
    if ($stream_li) {
        scroll_stream_into_view($stream_li);
    }
}

export function get_current_stream_li() {
    const stream_id = topic_list.active_stream_id();

    if (!stream_id) {
        // stream_id is undefined in non-stream narrows
        return undefined;
    }

    const $stream_li = get_stream_li(stream_id);

    if (!$stream_li) {
        // This code path shouldn't ever be reached.
        blueslip.warn("No active stream_li found for defined id " + stream_id);
        return undefined;
    }

    return $stream_li;
}
