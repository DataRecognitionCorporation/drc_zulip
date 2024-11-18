import $ from "jquery";
import { parseInt } from "lodash";
import assert from "minimalistic-assert";

import render_stream_folders from "../templates/stream_sidebar_folders.hbs";
import render_stream_sub_subfolders from "../templates/stream_sidebar_sub_subfolder.hbs";
import render_stream_subfolders from "../templates/stream_sidebar_subfolder.hbs";

import {
    subscribed_stream_ids
} from "./stream_data";
import { // eslint-disable-line import/no-cycle
    StreamSidebarRow,
    build_stream_list,
} from "./stream_list";
import * as unread from "./unread";
import { update_unread_counts } from "./unread_ui";


const REGEX_NUM_LETTERS = new RegExp('^[a-zA-Z0-9\'_,.-]*$')


function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { // eslint-disable-line no-plusplus
    const char = str.charCodeAt(i); // eslint-disable-line unicorn/prefer-code-point
    hash = (hash << 5) - hash + char; // eslint-disable-line no-bitwise

    // Convert to 32bit integer
    hash |= 0; // eslint-disable-line no-bitwise, unicorn/prefer-math-trunc
  }
  return hash >>> 0; // eslint-disable-line no-bitwise

}


function assert_proper_name_array(name_array: string[]): void {
    assert(name_array.length === 4);
    assert(name_array[0] !== undefined);
    assert(name_array[1] !== undefined);
    assert(name_array[2] !== undefined);
    assert(name_array[3] !== undefined);
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
        assert_proper_name_array(name_array);
        assert(name_array[2] !== undefined);

        // check if subfolder name is index 1 or 2
        if(this.subfolder_name === name_array[1]){
            const subfolder_id = simpleHash(`${name_array[0]}${name_array[1]}${name_array[2]}`);

            // create sub-subfolder does not exist
            if(!this.sub_folders.has(subfolder_id)) {
                assert(name_array[2] !== undefined);
                this.sub_folders.set(subfolder_id, new StreamSubFolder(subfolder_id, name_array[2]));
            }

            // add to sub-subfolder if index 1
            widget.set_subfolder(true, name_array[2]);
            this.sub_folders.get(subfolder_id)?.set_row(stream_id, widget, name_array)

        } else if(this.subfolder_name === name_array[2]) {
            // if index 2, add to rows
            widget.set_subfolder(true, name_array[3]);
            this.sidebar_rows.set(stream_id, widget);

        }
    }


    get_row(stream_id: number): StreamSidebarRow | undefined {
        if(this.sub_folders.size > 0) {
            // search in subfoldrs
            for(const [_, sub] of this.sub_folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
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


    get_ids(): number[] {
        let all_ids: number[] = [];
        if(this.sub_folders.size > 0) {
            // search in subfoldrs
            for(const [_, sub] of this.sub_folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
                all_ids = [...all_ids, ...sub.get_ids()];
            }

        } else {
            return [...this.sidebar_rows.keys()];
        }
        return all_ids;
    }


    get_render_data(): Record<number,string> {
        const temp = {
            subfolder_id: this.subfolder_id,
            subfolder_name: this.subfolder_name,
        }
        return temp;
    }


    paint_sub_subfolders(): void {
        const streams = subscribed_stream_ids();
        const $parent = $(`#stream_sub_subfolder_${this.subfolder_id}`);
        const elems: JQuery[] = [];

        if (streams.length === 0) {
            $parent.empty();
            return;
        }

        for(const [_, subfolder] of this.sub_folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
            const $list_item = $(render_stream_sub_subfolders(subfolder.get_render_data()));
            elems.push($list_item);
        }

        $parent.empty();
        $parent.append(elems); // eslint-disable-line no-jquery/no-append-html
        update_unread_counts();

        const stream_subfolder_name = `#stream_sub_subfolder_${this.subfolder_id}`;
        $(stream_subfolder_name).on("click", ".stream_sub_subfolder_item ", (e) => {
            const $elt = $(e.target).parents("li");
            const subfolder_id_str = $elt.attr("subfolder_id");

            assert(subfolder_id_str !== undefined);

            const subfolder_id = parseInt(subfolder_id_str);
            const subfolder = this.sub_folders.get(subfolder_id);

            assert(subfolder !== undefined);

            const subfolder_stream_ids = [...subfolder.sidebar_rows.keys()]
            const $parent = $(`#subfolder_rows_${subfolder.subfolder_id}`);

            const length_of_ul = $(`#subfolder_rows_${subfolder_id}`).children("li").length;

            this.update_unread_counts();
            if(length_of_ul > 0) {
                $(`#subfolder_rows_${subfolder_id}`).off("click");
                $(`#subfolder_rows_${subfolder_id}`).empty();
                return;
            }

            build_stream_list(true, true, $parent, subfolder_stream_ids);
        });
    }


    update_unread_counts(): number {
        let total_count = 0;

        if(this.sub_folders.size > 0) {
            const $subfolder_unread = $(`.subfolder_${this.subfolder_id} .subfolder_unread_count`);
            // search in subfoldrs
            for(const [_, sub] of this.sub_folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
                const count = sub.update_unread_counts();
                total_count += count;
            }
            this.unread_count = total_count;

            if(total_count !== 0) {
                $subfolder_unread.show();
                $subfolder_unread.text(total_count);
            } else {
                $subfolder_unread.text("");
                $subfolder_unread.hide();
            }

        } else {
            const $subfolder_unread = $(`.sub_sub_folder_li_${this.subfolder_id} .sub_subfolder_unread_count`);
            for(const [stream_id, _] of this.sidebar_rows) { // eslint-disable-line @typescript-eslint/no-unused-vars
                const count = unread.unread_count_info_for_stream(stream_id);
                total_count += count.unmuted_count;
            }
            this.unread_count = total_count;

            if(total_count !== 0) {
                $subfolder_unread.show();
                $subfolder_unread.text(total_count);
            } else {
                $subfolder_unread.text("");
                $subfolder_unread.hide();
            }

        }
        return total_count;
    }
}



class StreamFolder {
    folder_name: string;
    sub_folders = new Map<number, StreamSubFolder>(); // stream id -> row widget
    unread_count = 0;


    constructor(folder_name: string) {
        this.folder_name = folder_name;
    }


    set_row(stream_id: number, widget: StreamSidebarRow, name_array: string[]): void {
        assert(name_array[1] !== undefined);
        const subfolder_id = simpleHash(`${name_array[0]}${name_array[1]}`)

        // create a subfodler of none exist
        if(!this.sub_folders.has(subfolder_id)) {
            this.sub_folders.set(subfolder_id, new StreamSubFolder(subfolder_id, name_array[1]));
        }

        // add row to folder
        this.sub_folders.get(subfolder_id)?.set_row(stream_id, widget, name_array)
    }


    get_row(stream_id: number): StreamSidebarRow | undefined {
        for(const [_, sub] of this.sub_folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
            if(sub.get_row(stream_id) !== undefined) {
                return sub.get_row(stream_id);
            }
        }

        return undefined
    }


    get_render_data(): Record<string, string> {
        const temp = {
            folder_name: this.folder_name
        }
        return temp
    }


    get_ids(): number[] {
        let all_ids: number[] = [];
        if(this.sub_folders.size > 0) {
            // search in subfoldrs
            for(const [_, sub] of this.sub_folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
                all_ids = [...all_ids, ...sub.get_ids()];
            }
        }
        return all_ids;
    }


    paint_subfolders(): void {
        const streams = subscribed_stream_ids();
        const $parent = $(`#stream_subfolder_${this.folder_name}`);
        const elems: JQuery[] = [];

        if (streams.length === 0) {
            $parent.empty();
            return;
        }

        for(const [_, subfolder] of this.sub_folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
            const $list_item = $(render_stream_subfolders(subfolder.get_render_data()));
            elems.push($list_item);
        }

        $parent.empty();
        $parent.append(elems); // eslint-disable-line no-jquery/no-append-html


        const stream_subfolder_name = `#stream_subfolder_${this.folder_name}`;
        $(stream_subfolder_name).on("click", ".stream_subfolder_item", (e) => {
            const $elt = $(e.target).parents("li");
            const subfolder_id_str = $elt.attr("subfolder_id")

            assert(subfolder_id_str !== undefined);

            const subfolder_id = parseInt(subfolder_id_str);
            const length_of_ul = $(`#stream_sub_subfolder_${subfolder_id}`).children("li").length;

            if(length_of_ul > 0) {
                $(`#stream_sub_subfolder_${subfolder_id}`).off("click");
                $(`#stream_sub_subfolder_${subfolder_id}`).empty();
                return;
            }

            this.sub_folders.get(subfolder_id)?.paint_sub_subfolders();
            this.update_unread_counts();
        });
    }


    update_unread_counts(): void {
        // search in subfoldrs
        let total_count = 0;
        for(const [_, sub] of this.sub_folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
            const count =sub.update_unread_counts();
            total_count += count;
        }

        this.unread_count = total_count;
        let this_str = `.folder_name_${this.folder_name} .folder_unread_count`
        const $subfolder_unread = $(this_str);

        if(total_count !== 0) {
            $subfolder_unread.show();
            $subfolder_unread.text(total_count);
        } else {
            $subfolder_unread.text("");
            $subfolder_unread.hide();

        }
    }
}


export class StreamSidebarDrc {
    rows = new Map<number, StreamSidebarRow>(); // stream id -> row widget
    folders = new Map<string, StreamFolder>(); // folder id -> folder
    search_rows = new Map<number, StreamSidebarRow>();
    use_folders = false;
    subfolder_id_latest = 0;
    current_open_folder: StreamFolder | null;


    constructor(use_folders: boolean) {
        this.use_folders = use_folders;
        this.current_open_folder = null;
    }


    set_row(stream_id: number, widget: StreamSidebarRow): void {
        // stash an unchanged vanilla version of stream sidebar row
        // this is used for search to show the entire row name instead of the last index
        this.search_rows.set(stream_id, new StreamSidebarRow(widget.sub));

        if(this.use_folders) {
            const name_array = widget.sub.name.split(" - ");
            if(name_array.length !== 4){
                widget.set_subfolder(false, widget.sub.name);
                this.rows.set(stream_id, widget);
                return;
            }

            // this is the only way i can silance cascading errors... deal with it... ts sucks
            if(name_array[0] === undefined) { // eslint-disable-line unicorn/prefer-switch
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
                widget.set_subfolder(false, widget.sub.name);
                this.rows.set(stream_id, widget);
            }
        } else {
            this.rows.set(stream_id, widget);
        }
    }


    get_row(stream_id: number): StreamSidebarRow | undefined {
        if(this.use_folders) {
            if(this.rows.has(stream_id)) {
                return this.rows.get(stream_id);
            }
            for(const [_, sub] of this.folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
                if(sub.get_row(stream_id) !== undefined) {
                    return sub.get_row(stream_id);
                }
            }
            return undefined

        }
        return this.rows.get(stream_id);
    }


    get_row_from_search(stream_id: number): StreamSidebarRow | undefined {
        return this.search_rows.get(stream_id);
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


    get_all_folder_ids(): number[] {
        let all_ids: number[] = []
        for(const [_, folder] of this.folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
            all_ids = [...all_ids, ...folder.get_ids()]
        }
        return all_ids;
    }


    get_all_row_ids(): number[] {
        return [...this.rows.keys()]
    }


    paint_folders(): void {
        const streams = subscribed_stream_ids();
        const $parent = $("#stream_folders");
        const elems: JQuery[] = [];

        if (streams.length === 0) {
            $parent.empty();
            return;
        }

        for(const [_, folder] of this.folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
            const $list_item = $(render_stream_folders(folder.get_render_data()));
            elems.push($list_item);
        }

        $parent.empty();
        $parent.append(elems); // eslint-disable-line no-jquery/no-append-html

        for(const [_, folder] of this.folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
            const this_folder = `.folder_name_${folder.folder_name} .folder_unread_count`
            const $folder_unread = $(this_folder);
            $folder_unread.text("");
            $folder_unread.hide();
        }
    }


    paint_subfolders(folder_name: string): void {
        this.folders.get(folder_name)?.paint_subfolders()
        this.update_unread_counts();
    }


    hide_folders(): void {
        const $parent = $("#stream_folders");
        $parent.empty();
    }


    update_unread_counts(): void {

        for(const [_, folder] of this.folders) { // eslint-disable-line @typescript-eslint/no-unused-vars
            folder.update_unread_counts();
        }
    }
}

