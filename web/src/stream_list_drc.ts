import { has_recent_activity } from "./stream_list_sort"
import render_stream_sidebar_row from "../templates/stream_sidebar_row.hbs";
import render_stream_sidebar_dropdown from "../templates/stream_sidebar_dropdown.hbs";
import render_stream_sidebar_dropdown_subfolder from "../templates/stream_sidebar_dropdown_subfolder.hbs";
import render_stream_sidebar_dropdown_sub_subfolder from "../templates/stream_sidebar_dropdown_sub_subfolder.hbs";
import * as topic_list from "./topic_list";
import * as stream_list_sort from "./stream_list_sort";
import * as hash_util from "./hash_util";
import * as settings_data from "./settings_data";
import render_stream_subheader from "../templates/streams_subheader.hbs";
import {$t} from "./i18n";
import {
    subscribed_stream_ids,
    is_muted
} from "./stream_data";

import {
    get_counts,
    stream_has_any_unread_mentions,
    stream_has_any_unmuted_mentions,
    num_unread_for_stream
}from "./unread";

import {
    update_count_in_dom,
    get_search_term,
} from "./stream_list";

import type {
    StreamSubscription,
} from "./sub_store";
import { warn } from "console";


type folder_stream_grouping = {
    dormant_streams: number[],
    muted_active_streams: number[],
    muted_pinned_streams: number[],
    normal_streams: number[],
    pinned_streams: number[]
}

type message_counts = {
    direct_message_count: number,
    direct_message_with_mention_count: number,
    home_unread_messages: number,
    mentioned_message_count: number,
    pm_count: Map<string, number>,
    right_sidebar_direct_message_count: number,
    stream_count:  Map<number, {
        muted_count: number,
        stream_is_muted: boolean,
        unmuted_count: number
    }>,
    streams_with_mentions: number[],
    streams_with_unmuted_mentions: number[]
}

export class StreamSidebar {
    use_folders: boolean = false;

    all_rows = new Map();
    rows = new Map(); // stream id -> row widget
    folders = new Map(); // map of folder objects

    counts: message_counts;
    subfolder_id_latest = 0;
    //sub_sub_folder_id_latest = 0;

    current_open_folder: string = '';
    current_open_subfolder_id: number = -1;

    constructor(use_folders: boolean) {
        this.use_folders = use_folders;
        this.counts = get_counts();
    }

    set_row(sub: StreamSubscription) {

        if(sub == undefined) {
            return;
        }

        if(!this.use_folders) {
            this.all_rows.set(sub.stream_id, new StreamSidebarRow(sub, sub.name));
            return;
        }

        const regex_num_letters = new RegExp('^[a-zA-Z0-9\'_,.-]*$')
        const name_array = sub.name.split(" - ");

        if (regex_num_letters.test(name_array[0]) && name_array.length == 4) {

            // add folder to folder list
            if(!this.folders.has(name_array[0])){
                this.set_folder(name_array[0], new StreamFolder(name_array[0]))
            }

            // add subfolder
            let folder = this.get_folder(name_array[0]);
            let subfolder = folder.get_subfolder_by_name(name_array[1]);

            if(subfolder == undefined) {
                subfolder = new StreamSubFolder(this.subfolder_id_latest, name_array[1]);
                folder.set_subfoler(subfolder);
                this.subfolder_id_latest++;
            }

            let sub_sub_folder = subfolder.get_subfolder_by_name(name_array[2])

            if(sub_sub_folder == undefined) {
               sub_sub_folder = new StreamSubFolder(this.subfolder_id_latest, name_array[2]);
               subfolder.add_subfolder(sub_sub_folder);
               this.subfolder_id_latest++;
            }

            // add stream name to subfolder
            sub_sub_folder.set_row(new StreamSidebarRow(sub, name_array[3]));
        } else {
            this.rows.set(sub.stream_id, new StreamSidebarRow(sub, sub.name))
        }
        this.all_rows.set(sub.stream_id, new StreamSidebarRow(sub, sub.name))

    }

    build_stream_folder() {
        const streams = subscribed_stream_ids();
        const $parent = $("#stream_folders");
        const elems: JQuery<any>[] = [];

        if (streams.length === 0) {
            $parent.empty();
            return;
        }

        let all_folders = this.get_folders();

        all_folders.forEach((folder) => {
            const $list_item = $(render_stream_sidebar_dropdown(folder.get_render_data()));
            elems.push($list_item);
        })

        $parent.empty();
        $parent.append(elems);
    }

    build_subfolder_rows(folder_name: string) {
        this.current_open_folder = folder_name;

        //if(!folder_name) {
        //    return;
        //}

        let folder = this.get_folder(folder_name);
        let subfolders = folder.get_subfolders();
        const parent = ".subfolder_" + folder_name;
        const $parent = $(parent);

        const elems = [];
        for (const subfolder of subfolders) {
            let tmp_dict = {
              folder_name: folder_name,
              subfolder_name: subfolder.subfolder_name,
              subfolder_id: subfolder.id,
              subfolders: subfolder.subfolders,
              // subfolder_name_underscore: key.replaceAll(' ', '_')
            }
            elems.push($(render_stream_sidebar_dropdown_subfolder(tmp_dict)));
        }

        // $parent.removeClass("expand");
        // topic_list.clear();
        $parent.empty();
        $parent.append(elems);
        this.update_sidebar_unread_count(null);

        let stream_subfolder_id = ".subfolder_" + folder_name;
        $(stream_subfolder_id).on("click", "li", (e) => {

            const $elt = $(e.target).parents("li");
            const subfolder_name = $elt.attr("subfolder_name");
            const subfolder_id = $elt.attr("subfolder_id");
            const folder_name = $elt.attr("folder_name");

            if(subfolder_id != undefined) {
                let subfolder_id_int = parseInt(subfolder_id);
                this.current_open_subfolder_id = subfolder_id_int;
            } else {
                // this.current_open_subfolder_id = -1;
            }
            if(folder_name == null || subfolder_name == null || subfolder_id == null) {
              return;
            }

            const folder_rows_ul = ".sub_sub_folder_" + subfolder_id;
            let length_of_li = $(folder_rows_ul).children("li").length;

            if(length_of_li > 0){
                //this.current_open_subfolder_id = -1;
                //$(folder_rows_ul).removeClass("active-filter");
                $(".sub_sub_folder").off("click");
                $(".sub_sub_folder").empty();
                //const $folder = $(folder_rows_ul);
                //$folder.empty();
                return;
            } else {
                this.build_sub_subfolder_rows(folder_name, parseInt(subfolder_id));
            }
        });
    }

    build_sub_subfolder_rows(folder_name: string, subfolder_id: number) {
        this.current_open_folder = folder_name;
        if(!folder_name) {
            return;
        }

        let folder = this.get_folder(folder_name);
        let subfolder = folder.get_subfolder_by_id(subfolder_id);
        const parent = ".sub_sub_folder_" + subfolder_id;
        const $parent = $(parent);

        const elems = [];
        for (const sub_subfolder of subfolder.get_subfolders()) {
            let tmp_dict = {
              folder_name: folder_name,
              subfolder_name: sub_subfolder.subfolder_name,
              subfolder_id: sub_subfolder.id,
              subfolders: sub_subfolder.subfolders,
              // subfolder_name_underscore: key.replaceAll(' ', '_')
            }
            elems.push($(render_stream_sidebar_dropdown_sub_subfolder(tmp_dict)));
        }

        // $parent.removeClass("expand");
        // topic_list.clear();
        $parent.empty();
        $parent.append(elems);
        this.update_sidebar_unread_count(null);

        let stream_subfolder_id = ".sub_sub_folder_" + subfolder_id;
        //let stream_subfolder_id = "#stream_subfolder_" + folder_name;
        $(stream_subfolder_id).on("click", "li", (e) => {

            const $elt = $(e.target).parents("li");
            const subfolder_name = $elt.attr("subfolder_name");
            const subfolder_id = $elt.attr("subfolder_id");
            const folder_name = $elt.attr("folder_name");

            if(subfolder_id != undefined) {
                let subfolder_id_int = parseInt(subfolder_id);
                this.current_open_subfolder_id = subfolder_id_int;
            } else {
                // this.current_open_subfolder_id = -1;
            }
            if(subfolder_id == null) {
              return;
            }

            const folder_rows_ul = ".subfolder_rows_" + subfolder_id;
            let length_of_li = $(folder_rows_ul).children("li").length;

            if(length_of_li > 0){
                this.current_open_subfolder_id = -1;

                //$(folder_rows_ul).removeClass("active-filter");
                $(folder_rows_ul).off("click");
                $(folder_rows_ul).empty();
                const $folder = $(folder_rows_ul);
                //$folder.empty();
                return;
            } else {
                this.build_stream_list_folders(folder_name, parseInt(subfolder_id));
            }
        });
    }

    build_stream_list_folders(folder_name: string, subfolder_id: number) {
        if(folder_name == null || subfolder_id == null){
           return;
        }

        const parent = ".subfolder_rows_" + subfolder_id;
        const $parent = $(parent);
        let folder = this.get_folder(folder_name);
        const subfolder = folder.get_subfolder_by_id(subfolder_id);
        const streams = subscribed_stream_ids();
        if (streams.length === 0) {
            topic_list.clear();
            $parent.empty();
            return;
        }

        const all_folder_stream_ids = subfolder.get_all_ids();

        const elems = [];
        const stream_groups = stream_list_sort.sort_groups(streams, get_search_term());

        let folder_stream_groups: folder_stream_grouping = {
            dormant_streams: [],
            muted_active_streams: [],
            muted_pinned_streams: [],
            normal_streams: [],
            pinned_streams: []
        }

        // errors caused from any types coming from stream_list_sort.
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

        //topic_list.clear();
        //$parent.empty();

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


        for(let row of subfolder.get_rows()){
            if(folder_stream_groups.pinned_streams.includes(parseInt(row.sub.stream_id))) {
                row.update_whether_active();
                elems.push(row.get_li())
            }
        }



        for(let row of subfolder.get_rows()){
            if(folder_stream_groups.muted_pinned_streams.includes(parseInt(row.sub.stream_id))) {
                row.update_whether_active();
                elems.push(row.get_li())
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


        for(let row of subfolder.get_rows()){
            if(folder_stream_groups.normal_streams.includes(parseInt(row.sub.stream_id))) {
                row.update_whether_active();
                elems.push(row.get_li())
            }
        }



        for(let row of subfolder.get_rows()){
            if(folder_stream_groups.muted_active_streams.includes(parseInt(row.sub.stream_id))) {
                row.update_whether_active();
                elems.push(row.get_li())
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


        for(let row of subfolder.get_rows()){
            if(folder_stream_groups.dormant_streams.includes(parseInt(row.sub.stream_id))) {
                row.update_whether_active();
                elems.push(row.get_li())
            }
        }

        $parent.append(elems);

    }

    build_stream_list_below_folders(force_rerender: any, render_all_streams: any) {
        let search_term = get_search_term();

        let search_bar_hidden = $(".stream_search_section").expectOne().hasClass("notdisplayed");
        const $parent = $("#stream_filters");
        let unsorted_rows;

        if(render_all_streams == true || this.use_folders == false) {
            unsorted_rows = this.all_rows;
        } else if(search_term || !search_bar_hidden) {
            unsorted_rows = this.all_rows;
        } else {
            unsorted_rows = this.rows;
        }

        let stream_ids = [];
        for(let stream of unsorted_rows) {
            stream_ids.push(stream[0]);
        }
        const stream_groups = stream_list_sort.sort_groups(stream_ids, search_term);

        let folder_stream_groups = {
            dormant_streams: [],
            muted_active_streams: [],
            muted_pinned_streams: [],
            normal_streams: [],
            pinned_streams: []
        }

        // errors caused from any types coming from stream_list_sort.
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

    // set_row_all(stream_id: number, widget: StreamSidebarRow){
    //     this.all_rows.set(stream_id, widget);
    // }

    set_folder(folder_name: string, folder: StreamFolder) {
      this.folders.set(folder_name, folder);
    }

    get_row(stream_id: number) {
        if(this.use_folders) {
            return this.get_row_by_id(stream_id);
        } else {
            return this.all_rows.get(stream_id);
        }
    }

    // get_row_from_all(stream_id: number) {
    //     return this.all_rows.get(stream_id);
    // }

    // get_rows_from_all(stream_id: number) {
    //     return this.all_rows;
    // }

    get_folder(folder_name: string) {
        return this.folders.get(folder_name);
    }

    get_rows() {
        return this.rows;
    }

    get_folders() {
        return this.folders;
    }

    has_row_for(stream_id: number) {
        return this.get_row_by_id(stream_id);
    }

    // set_use_folders(set_use_folders: boolean) {
    //     this.use_folders = true;
    // }

    // get_use_folders() {
    //     return this.use_folders;
    // }

    remove_row(stream_id: number) {
        // This only removes the row from our data structure.
        // Our caller should use build_stream_list() to re-draw
        // the sidebar, so that we don't have to deal with edge
        // cases like removing the last pinned stream (and removing
        // the divider).

        this.all_rows.delete(stream_id);
    }

    remove_stream_folders() {
        const $parent = $("#stream_folders");
        $parent.empty();
    }

    remove_rows_below_folders() {
        const $parent = $("#stream_filters");
        $parent.empty();
    }

    get_folder_by_name(folder_name_search: string): StreamFolder | null  {
        for(let [folder_name, folder] of this.folders) {
            if (folder_name_search == folder_name) {
                return folder;
            }
        }

        return null;
    }

    get_row_by_id(stream_id: number) {
        if(this.rows.has(stream_id)) {
            return this.rows.get(stream_id);
        }

        for(let folder of this.folders.values()) {
            let row = folder.get_row_by_id(stream_id);

            if(row != null){
                return row;
            }
        }

        return null;
    }

    // get_folder_stream_ids() {
    //     const all_ids = [];
    //     for(let folder of this.folders.values()) {
    //         for (const subfolder in folder.sub_folders) {
    //             for(const row of subfolder.sidebar_row){
    //                 all_ids.push(parseInt(row.sub.stream_id));
    //             }
    //         }

    //     }
    //     return all_ids;
    // }

    get_subfolder_stream_ids(folder: string, subfolder_name: string) {
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

    update_sidebar_unread_count(counts: message_counts | null | undefined){
        if(!counts) {
            counts = this.counts;;
        } else {
            this.counts = counts;
        }
        let stream_counts = counts.stream_count;

        for(let folder of this.folders.values()) {
            let folder_count = 0;
            const all_subfolders = folder.get_subfolders();
            for (let subfolder of all_subfolders) {
                let subfolder_count = 0;
                if(subfolder.subfolders.length > 0) {
                    for(let sub_subfolder of subfolder.subfolders) {
                        let sub_subfolder_count = 0;
                        const all_rows = sub_subfolder.get_rows();

                        for(let row of all_rows){

                            if(stream_counts.has(row.sub.stream_id)) {
                                let stream = stream_counts.get(row.sub.stream_id);
                                if(!stream) {
                                    return;
                                }
                                sub_subfolder_count = sub_subfolder_count + stream.unmuted_count;
                            }
                        }
                        subfolder_count = subfolder_count + sub_subfolder_count;

                        this.update_subfolder_count_in_dom(sub_subfolder.id, sub_subfolder_count)
                    }

                    folder_count = folder_count + subfolder_count;
                    this.update_subfolder_count_in_dom(subfolder.id, subfolder_count)

                } else {
                    let subfolder_count = 0;
                    const all_rows = subfolder.get_rows();

                    for(let row of all_rows){
                        if(stream_counts.has(row.sub.stream_id)) {
                            let stream = stream_counts.get(row.sub.stream_id);
                            if(!stream) {
                                return;
                            }
                            subfolder_count = subfolder_count + stream.unmuted_count;
                        }
                    }
                    folder_count = folder_count + subfolder_count;

                    this.update_subfolder_count_in_dom(subfolder.id, subfolder_count);
                }
            }
            this.update_folder_count_in_dom(folder.folder_name, folder_count);
        }
    }

    update_folder_count_in_dom(folder_name: string, count: number) {
        // The subscription_block properly excludes the topic list,
        // and it also has sensitive margins related to whether the
        // count is there or not.
        let dom_folder = "." + folder_name;
        const $subscription_block = $(dom_folder).find(".folder_unread_count");

        if (count === 0) {
            $subscription_block.text("");
            $subscription_block.hide();
            return;
        }

        $subscription_block.show();
        $subscription_block.text(count);
    }

    update_subfolder_count_in_dom(subfolder_id: number, count: number) {
        let  $subfolder_unread = $(".subfolder_unread_count_" + subfolder_id);

        if (count === 0) {
            $subfolder_unread.text("");
            $subfolder_unread.hide();
            return;
        }
        $subfolder_unread.show();
        $subfolder_unread.text(count);
    }

    clear_sidebar() {
        this.current_open_folder = '';
        this.current_open_subfolder_id = -1;
        this.remove_stream_folders();
        this.remove_rows_below_folders();
    }

    focus_on_stream(stream_id: number) {
        if(!this.use_folders) {
            return
        }

        let row = this.get_row_by_id(stream_id);
        let name_array = row.sub.name.split(" - ");
        let folder = this.get_folder_by_name(name_array[0]);

        if(folder != null) {
            let subfolder = folder.get_subfolder_by_name(name_array[1]);
            if(subfolder != undefined) {
                //this.build_subfolder_rows(name_array[0]);
                this.build_stream_list_folders(name_array[0], subfolder.get_id());
            }
        } else {
            return
        }
    }
}

class StreamFolder {
    folder_name: string;
    sub_folders: StreamSubFolder[];

    constructor(folder_name: string) {
        this.folder_name = folder_name;
        this.sub_folders = [];


        // for (const [subfolder_name, rows] of Object.entries(sub_folders)) {
        //   let id = stream_sidebar.subfolder_id_latest + 1;
        //   this.sub_folders.push(new StreamSidebarSubFolder(id, subfolder_name, rows));
        //   stream_sidebar.subfolder_id_latest = id;
        // }
    }

    get_subfolder_by_name(subfolder_name: string): StreamSubFolder | undefined {
        for(let sub_folder of this.sub_folders) {

            if(sub_folder.get_name() == subfolder_name) {
                return sub_folder;
            }
        }

        return undefined;
    }

    get_subfolder_by_id(subfolder_id: number): StreamSubFolder | undefined {
        for(let sub_folder of this.sub_folders) {
            if(sub_folder.get_subfolders().length > 0) {
                for(let sub_sub_folder of sub_folder.get_subfolders()) {
                    if(sub_sub_folder.get_id() == subfolder_id) {
                        return sub_sub_folder;
                    }
                }
            }
            if(sub_folder.get_id() == subfolder_id) {
                return sub_folder;
            }
        }
        return undefined;
    }

    get_subfolder_name(): string {
        return this.folder_name;
    }

    get_subfolders(): StreamSubFolder[] {
        return this.sub_folders;
    }

    set_subfoler(sub_folder: StreamSubFolder) {
        this.sub_folders.push(sub_folder);
    }

    get_all_rows() {
      let all_rows = [];
      for(let subfolder of this.sub_folders) {
        all_rows.push(subfolder.get_rows());
      }
      return all_rows;
    }

    get_all_row_ids() {
      let ids: number[] = [];
      for(let subfolder of this.sub_folders) {
        ids.concat(subfolder.get_all_ids());
      }
      return ids;
    }

    get_row_by_id(id: number) {
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

class StreamSubFolder {
    id: number;
    subfolder_name: string;
    subfolders: StreamSubFolder[];
    sidebar_row: StreamSidebarRow[];
    unread_count: number = 0;


    constructor(id: number, subfolder_name: string) {
        this.subfolders = [];
        this.id = id;
        this.subfolder_name = subfolder_name;
        this.sidebar_row = [];
    }

    get_name(): string {
        return this.subfolder_name;
    }

    get_id(): number {
        return this.id;
    }

    add_subfolder(sub_sub_folder: StreamSubFolder) {
        this.subfolders.push(sub_sub_folder);
    }

    get_subfolder_by_name(subfolder_name: string): StreamSubFolder | undefined {
        for(let sub_folder of this.subfolders) {
            if(sub_folder.get_name() == subfolder_name) {
                return sub_folder;
            }
        }

        return undefined;
    }

    get_subfolders(): StreamSubFolder[] {
        return this.subfolders
    }

    get_rows(): StreamSidebarRow[] {
        let all_rows: StreamSidebarRow[] = [];
        if(this.subfolders.length > 0) {
            for(let subfolder of this.subfolders) {
                all_rows = all_rows.concat(subfolder.get_rows());
            }
            return all_rows;
        } else {
            return this.sidebar_row;
        }
    }

    set_row(widget: StreamSidebarRow) {
        this.sidebar_row.push(widget);
    }

    // return a list of ids of all rows within subfolder
    get_all_ids() {
        let ids = [];
        for(let row of this.get_rows()) {
            ids.push(row.sub.stream_id);
        }
        return ids;
    }

    get_row_by_id(id: number) {
        for(let row of this.get_rows()) {
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

    // set_unread_count(count: number) {
    //     this.set_unread_count = count;
    // }
}


export class StreamSidebarRow {
    sub: StreamSubscription;
    $list_item: JQuery<any>;
    leader_name: string;

    constructor(sub: StreamSubscription, leader_name: string) {
        this.leader_name = leader_name;
        this.sub = sub;
        this.$list_item = this.build_stream_sidebar_li(sub, leader_name);
        this.update_unread_count();
    }

    update_whether_active() {
        if (has_recent_activity(this.sub) || this.sub.pin_to_top === true) {
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
        const count = num_unread_for_stream(this.sub.stream_id);
        const stream_has_any_unread_mention_messages = stream_has_any_unread_mentions(
            this.sub.stream_id,
        );
        const stream_has_any_unmuted_unread_mention = stream_has_any_unmuted_mentions(
            this.sub.stream_id,
        );
        const stream_has_only_muted_unread_mentions =
            !this.sub.is_muted &&
            stream_has_any_unread_mention_messages &&
            !stream_has_any_unmuted_unread_mention;
        update_count_in_dom(
            this.$list_item,
            count,
            stream_has_any_unread_mention_messages,
            stream_has_any_unmuted_unread_mention,
            stream_has_only_muted_unread_mentions,
        );
    }

    build_stream_sidebar_li(sub: StreamSubscription, leader_name: string) {
        const name = sub.name;
        const is_stream_muted = is_muted(sub.stream_id);
        const args = {
            name,
            leader_name: leader_name,
            id: sub.stream_id,
            url: hash_util.by_stream_url(sub.stream_id),
            is_stream_muted,
            invite_only: sub.invite_only,
            is_web_public: sub.is_web_public,
            color: sub.color,
            pin_to_top: sub.pin_to_top,
            hide_unread_count: settings_data.should_mask_unread_count(is_stream_muted),
        };

        let $list_item = undefined;
        $list_item = $(render_stream_sidebar_row(args));
        return $list_item;
    }
}
