
import { list } from "postcss";
import render_stream_sidebar_dropdown from "../templates/stream_sidebar_dropdown.hbs";
import render_stream_sidebar_dropdown_sub_subfolder from "../templates/stream_sidebar_dropdown_sub_subfolder.hbs";
import render_stream_sidebar_dropdown_subfolder from "../templates/stream_sidebar_dropdown_subfolder.hbs";
import render_stream_sidebar_row from "../templates/stream_sidebar_row.hbs";
import render_stream_subheader from "../templates/streams_subheader.hbs";

import * as hash_util from "./hash_util";
import {$t} from "./i18n";
import {
    is_muted,
    subscribed_stream_ids
} from "./stream_data";
import {
    StreamSidebarRow,
} from "./stream_list";
import {
    build_stream_sidebar_li
} from "./stream_list";
import * as stream_list_sort from "./stream_list_sort";
import type {
    StreamSubscription,
} from "./sub_store";
import * as topic_list from "./topic_list";
import * as ui_util from "./ui_util";
import type {FullUnreadCountsData} from "./unread";
import * as unread from"./unread"
import { stream_id } from "./narrow_state";
import { widget } from "./compose_pm_pill";


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


const REGEX_NUM_LETTERS = new RegExp('^[a-zA-Z0-9\'_,.-]*$')


function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}


class StreamSidebarRowDrc {
    sub: StreamSubscription;
    $list_item: JQuery;
    leader_name: string;

    constructor(sub: StreamSubscription, leader_name: string) {
        this.leader_name = leader_name;
        this.sub = sub;
        this.$list_item = build_stream_sidebar_li(sub);
    }

}


class StreamSubFolder {
    sub_folders = new Map<number, StreamSubFolder>(); // stream id -> row widget
    sidebar_rows = new Map<number, StreamSidebarRow>(); // stream id -> row widget
    subfolder_id: number;
    subfolder_name: string;
    unread_count = 0;


    constructor(subfolder_id: number, subfolder_name: string) {
        this.subfolder_id = subfolder_id;
        this.subfolder_name = subfolder_name;
    }

    set_row(stream_id: number, widget: StreamSidebarRow, name_array: string[]): void {
        // check if subfolder name is index 1 or 2
        if(this.subfolder_name === name_array[1]){
            const subfolder_id = simpleHash(widget.sub.name)

            // create sub-subfolder does not exist
            if(!this.sub_folders.has(subfolder_id)) {
                this.sub_folders.set(subfolder_id, new StreamSubFolder(subfolder_id, name_array[2]), name_array)
            }

            // add to sub-subfolder if index 1
            widget.set_display_name(name_array[2]);
            this.sub_folders.get(subfolder_id)?.set_row(stream_id, widget, name_array)

        } else if(this.subfolder_name === name_array[2]) {
            // if index 2, add to rows
            widget.set_display_name(name_array[2]);
            this.sidebar_rows.set(stream_id, widget);

        }
    }

    get_row(stream_id: number): StreamSidebarRow | undefined {
        if(this.sub_folders.size > 0) {
            // search in subfoldrs
            for(const [_, sub] of this.sub_folders) {
                if(sub.get_row(stream_id) !== undefined) {
                    return sub.get_row(stream_id);
                }

            }

        } else {
            return this.sidebar_rows.get(stream_id);
        }

        return undefined;
    }

    get_name(): string {
        return this.subfolder_name;
    }

    get_id(): number {
        return this.subfolder_id;
    }
}



class StreamFolder {
    folder_name: string;
    sub_folders = new Map<number, StreamSubFolder>(); // stream id -> row widget

    constructor(folder_name: string) {
        this.folder_name = folder_name;
    }

    set_row(stream_id: number, widget: StreamSidebarRow, name_array: string[]): void {
        const subfolder_id = simpleHash(widget.sub.name)

        // create a subfodler of none exist
        if(!this.sub_folders.has(subfolder_id)) {
            this.sub_folders.set(subfolder_id, new StreamSubFolder(subfolder_id, name_array[1]), name_array)
        }

        // add row to folder
        this.sub_folders.get(subfolder_id)?.set_row(stream_id, widget, name_array)
    }

    get_row(stream_id: number): StreamSidebarRow | undefined {
        for(const [id, sub] of this.sub_folders) {
            if(sub.get_row(stream_id) !== undefined) {
                return sub.get_row(stream_id);
            }
        }

        return undefined
    }
}


export class StreamSidebarDrc {
    rows = new Map<number, StreamSidebarRow>(); // stream id -> row widget
    folders = new Map<string, StreamFolder>(); // folder id -> folder
    use_folders = false;
    subfolder_id_latest = 0;
    current_open_folder: StreamFolder | null;

    constructor(use_folders: boolean) {
        this.use_folders = use_folders;
        this.current_open_folder = null;
    }


    set_row(stream_id: number, widget: StreamSidebarRow): void {
        if(this.use_folders) {
            const name_array = widget.sub.name.split(" - ");
            if(name_array.length !== 4){
                widget.set_display_name(widget.sub.name);
                this.rows.set(stream_id, widget);
                return;
            }


            // this is the only way i can silance cascading errors... deal with it... ts sucks
            if(name_array[0] === undefined) {
                this.rows.set(stream_id, widget);
                return;
            } else if(name_array[1] === undefined) {
                this.rows.set(stream_id, widget);
                return;
            } else if(name_array[2] === undefined) {
                this.rows.set(stream_id, widget);
                return;
            } else if(name_array[3] === undefined) {
                this.rows.set(stream_id, widget);
                return;
            }


            // check if row can be converted to folder, else add it to rows for display below
            // folders
            if (REGEX_NUM_LETTERS.test(name_array[0]) && name_array.length === 4) {
                const folder_name = name_array[0]

                // create to folders if folder doesn't exist
                if(!this.folders.has(folder_name)){
                    this.folders.set(folder_name, new StreamFolder(folder_name))
                }

                // add row to folder
                this.folders.get(folder_name)?.set_row(stream_id, widget, name_array)


            } else {
                // add to rows below folders
                widget.set_display_name(widget.sub.name);
                this.rows.set(stream_id, widget);
            }
        } else {
            widget.set_display_name(widget.sub.name);
            this.rows.set(stream_id, widget);
        }
    }

    get_row(stream_id: number): StreamSidebarRow | undefined {
        if(this.use_folders) {
            if(this.rows.has(stream_id)) {
                return this.rows.get(stream_id);
            }
            for(const [id, sub] of this.folders) {
                if(sub.get_row(stream_id) !== undefined) {
                    return sub.get_row(stream_id);
                }
            }
            return undefined

        }
        return this.rows.get(stream_id);
    }

    has_row_for(stream_id: number): boolean {
        return this.rows.has(stream_id);
    }

    remove_row(stream_id: number): void {
        // This only removes the row from our data structure.
        // Our caller should use build_stream_list() to re-draw
        // the sidebar, so that we don't have to deal with edge
        // cases like removing the last pinned stream (and removing
        // the divider).

        this.rows.delete(stream_id);
    }
}
