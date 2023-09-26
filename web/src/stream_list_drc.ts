import {
    get_sub_by_id
} from "./stream_data";
import render_stream_sidebar_row from "../templates/stream_sidebar_row.hbs";
import { 
    stream_has_any_unread_mentions, 
    stream_has_any_unmuted_mentions,
    num_unread_for_stream
}from "./unread";
import { 
    build_stream_sidebar_li,
    update_count_in_dom
} from "./stream_list";
import { has_recent_activity } from "./stream_list_sort"

import type {
    ApiStreamSubscription,
    NeverSubscribedStream,
    Stream,
    StreamSpecificNotificationSettings,
    StreamSubscription,
} from "./sub_store";


export class StreamSidebar {
    all_rows = new Map();
    rows = new Map(); // stream id -> row widget
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
            this.set_folder(name_array[0], new StreamFolder(name_array[0]))
            console.log(name_array[0])

            // add subfolder

            // add stream name to subfolder
            sub.name = name_array[2];
            const stream_name = new StreamSidebarRow(sub);
            
        } else {
            // add to list below folders
        }
    }

    set_row(stream_id: number, widget: StreamSidebarRow) {
        this.rows.set(stream_id, widget);
    }

    set_row_all(stream_id: number, widget: StreamSidebarRow){
        this.all_rows.set(stream_id, widget);
    }

    set_folder(folder_name: string, folder: StreamFolder) {
      this.folders.set(folder_name, folder);
    }

    get_row(stream_id: number) {
        return this.rows.get(stream_id);
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
        return this.rows.has(stream_id);
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

    update_sidebar_unread_count(counts: number){
    //   if(counts == null) {
    //     counts = this.counts;
    //   } else {
    //     this.counts = counts;
    //   }
      this.counts = counts;

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

class StreamFolder {
    constructor(folder_name: string) {
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

class StreamSubFolder {
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

class StreamList {

}

export class StreamSidebarRow {
    sub: StreamSubscription;
    $list_item: JQuery<any>;

    constructor(sub: StreamSubscription) {
        this.sub = sub;
        this.$list_item = build_stream_sidebar_li(sub);
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


export function update_subfolder_count_in_dom(subfolder_id: number, count: number) {
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

export function update_folder_count_in_dom(folder_name: string, count: number) {
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