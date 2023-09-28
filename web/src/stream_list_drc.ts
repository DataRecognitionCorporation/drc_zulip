import render_stream_sidebar_row from "../templates/stream_sidebar_row.hbs";
import { list } from "postcss";
import { has_recent_activity } from "./stream_list_sort"
// import render_stream_sidebar_row from "../templates/stream_sidebar_row.hbs";
import render_stream_sidebar_dropdown from "../templates/stream_sidebar_dropdown.hbs";
import render_stream_sidebar_dropdown_subfolder from "../templates/stream_sidebar_dropdown_subfolder.hbs";
import * as topic_list from "./topic_list";
import * as stream_list_sort from "./stream_list_sort";
import * as hash_util from "./hash_util";
import * as settings_data from "./settings_data";

import render_stream_subheader from "../templates/streams_subheader.hbs";
import {$t} from "./i18n";
import {
    get_sub_by_id,
    subscribed_stream_ids,
    is_muted
} from "./stream_data";

import { 
    stream_has_any_unread_mentions, 
    stream_has_any_unmuted_mentions,
    num_unread_for_stream
}from "./unread";

import {
    update_count_in_dom,
    get_search_term,
    update_dom_with_unread_counts
} from "./stream_list";

import type {
    ApiStreamSubscription,
    NeverSubscribedStream,
    Stream,
    StreamSpecificNotificationSettings,
    StreamSubscription,
} from "./sub_store";



export function remove_stream_folders() {
    const $parent = $("#stream_folders");
    $parent.empty();
}


export class StreamSidebar {
    // all_rows = new Map();
    // rows = new Map(); // stream id -> row widget
    folders = new Map(); // map of folder objects

    use_folders = true;
    counts = null;
    subfolder_id_latest = 0;

    add_row(sub: StreamSubscription, widget: StreamSidebarRow) {
        
        if(sub == undefined) {
            console.log('sub is undefined')
            return;
        }

        const regex_num_letters = new RegExp('^[a-zA-Z0-9\'_,.-]*$')
        const name_array = sub.name.split(" - ");
        
        if (regex_num_letters.test(name_array[0]) && name_array.length == 3) {

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

            // add stream name to subfolder 
            subfolder.set_row(new StreamSidebarRow(sub, name_array[2]));
        } else {
            // add to list below folders
        }
    }

    build_stream_folder(force_rerender: boolean) {
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
        if(folder_name == null || folder_name == undefined) {
            console.log('errror')
            return;
        }
    
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
              // subfolder_name_underscore: key.replaceAll(' ', '_')
            }
    
            elems.push($(render_stream_sidebar_dropdown_subfolder(tmp_dict)));
        }
    
        // $parent.removeClass("expand");
        // topic_list.clear();
        $parent.empty();
        $parent.append(elems);
        this.update_sidebar_unread_count(null);

        let stream_subfolder_id = "#stream_subfolder_" + folder_name;
        $(stream_subfolder_id).on("click", "li", (e) => {
            
            const $elt = $(e.target).parents("li");
            const subfolder_name = $elt.attr("subfolder_name");
            const subfolder_id = $elt.attr("subfolder_id");
            const folder_name = $elt.attr("folder_name");
    
            if(folder_name == null || subfolder_name == null || subfolder_id == null) {
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
              this.build_stream_list_folders(folder_name, subfolder_name, parseInt(subfolder_id));
            }
        });
    }

    build_stream_list_folders(folder_name: string, subfolder_name: string, subfolder_id: number) {
        if(folder_name == null || subfolder_name == null){
          return;
        }
        const parent = ".subfolder_rows_" + subfolder_id;
        const $parent = $(parent);
        let folder = this.get_folder(folder_name);
        const subfolders = folder.get_subfolders();
    
        const streams = subscribed_stream_ids();
        if (streams.length === 0) {
            topic_list.clear();
            $parent.empty();
            return;
        }
    
        const all_folder_stream_ids = this.get_subfolder_stream_ids(folder_name, subfolder_name);
        const elems = [];
        const stream_groups = stream_list_sort.sort_groups(streams, get_search_term());
    
        let folder_stream_groups = {
            dormant_streams: [],
            muted_active_streams: [],
            muted_pinned_streams: [],
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

    set_row(stream_id: number, widget: StreamSidebarRow) {
        // this.rows.set(stream_id, widget);
    }

    set_row_all(stream_id: number, widget: StreamSidebarRow){
        this.all_rows.set(stream_id, widget);
    }

    set_folder(folder_name: string, folder: StreamFolder) {
      this.folders.set(folder_name, folder);
    }

    get_row(stream_id: number) {
        return this.get_row_by_id(stream_id);
    }

    get_row_from_all(stream_id: number) {
        return this.all_rows.get(stream_id);
    }

    get_rows_from_all(stream_id: number) {
        return this.all_rows;
    }

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

    set_use_folders(set_use_folders: boolean) {
        this.use_folders = true;
    }

    get_use_folders() {
        return this.use_folders;
    }

    remove_row(stream_id: number) {
        // This only removes the row from our data structure.
        // Our caller should use build_stream_list() to re-draw
        // the sidebar, so that we don't have to deal with edge
        // cases like removing the last pinned stream (and removing
        // the divider).
        
        this.rows.delete(stream_id);
    }

    get_folder_by_name(folder_name: string) {
        this.rows.forEach(function(value, key) {
            if (key == folder_name) {
                return value;
            }
        })

    }

    get_row_by_id(stream_id: number) {
        for(let [folder_name, folder] of this.folders) {
            let row = folder.get_row_by_id(stream_id);

            if(row != null){
                return row;
            }
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

    update_sidebar_unread_count(counts){
        if(counts == null || counts == undefined) {
            counts = this.counts;
        } else {
            this.counts = counts;
        }
        let stream_counts = counts.stream_count;
        
        for(let [folder_name, folder] of this.folders) {
            let folder_count = 0;
            const all_subfolders = folder.get_subfolders();
            for (let subfolder of all_subfolders) {
                let subfolder_count = 0;
                const all_rows = subfolder.get_rows();
                
                for(let row of all_rows){
                    if(stream_counts.has(row.sub.stream_id)) {
                        subfolder_count = subfolder_count + stream_counts.get(row.sub.stream_id).unmuted_count;
                    }
                }
                folder_count = folder_count + subfolder_count;
                
                this.update_subfolder_count_in_dom(subfolder.id, subfolder_count);
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
    sidebar_row: StreamSidebarRow[];
    unread_count: number = 0;


    constructor(id: number, subfolder_name: string) {
        this.id = id;
        this.subfolder_name = subfolder_name;
        this.sidebar_row = [];
    }

    get_name(): string {
        return this.subfolder_name;
    }

    get_rows() {
        return this.sidebar_row;
    }

    set_row(widget: StreamSidebarRow) {
        this.sidebar_row.push(widget);
    }

    // return a list of ids of all rows within subfolder
    get_all_ids() {
        let ids = [];
        for(let row of this.sidebar_row) {
            ids.push(row.sub.stream_id);
        }
        return ids;
    }

    get_row_by_id(id: number) {
        for(let row of this.sidebar_row) {
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

    set_unread_count(count: number) {
        this.set_unread_count = count;
    }
}


export class StreamSidebarRow {
    sub: StreamSubscription;
    $list_item: JQuery<any>;
    row_name: string;

    constructor(sub: StreamSubscription, name: string) {
        this.row_name = name;
        this.sub = sub;
        this.$list_item = build_stream_sidebar_li(sub, name);
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
}






function build_stream_sidebar_li(sub: StreamSubscription, leader_name: string) {
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
    const $list_item = $(render_stream_sidebar_row(args));
    return $list_item;
}