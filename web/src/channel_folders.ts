import assert from "minimalistic-assert";
import type * as z from "zod/mini";

import {FoldDict} from "./fold_dict.ts";
import type {ChannelFolderUpdateEvent} from "./server_event_types.ts";
import {current_user} from "./state_data.ts";
import type {StateData, channel_folder_schema} from "./state_data.ts";
import * as stream_data from "./stream_data.ts";
import type {StreamSubscription} from "./sub_store.ts";
import {user_settings} from "./user_settings.ts";
import * as util from "./util.ts";

export type ChannelFolder = z.infer<typeof channel_folder_schema>;

// Whether the nested channel-folder view should be shown in the left sidebar.
// Guests only ever get a flat list of channels and never see any folder view,
// regardless of their personal setting.
export function should_show_channel_folders(): boolean {
    return user_settings.web_left_sidebar_show_channel_folders && !current_user.is_guest;
}

let channel_folder_name_dict: FoldDict<ChannelFolder>;
let channel_folder_by_id_dict: Map<number, ChannelFolder>;
let active_channel_folder_ids: Set<number>;

function compare_by_name(a: StreamSubscription, b: StreamSubscription): number {
    return util.strcmp(a.name, b.name);
}

export function clean_up_description(channel_folder: ChannelFolder): void {
    if (channel_folder.rendered_description !== undefined) {
        channel_folder.rendered_description = channel_folder.rendered_description
            .replace("<p>", "")
            .replace("</p>", "");
    }
}

export function add(channel_folder: ChannelFolder): void {
    clean_up_description(channel_folder);
    channel_folder_name_dict.set(channel_folder.name, channel_folder);
    channel_folder_by_id_dict.set(channel_folder.id, channel_folder);
    if (!channel_folder.is_archived) {
        active_channel_folder_ids.add(channel_folder.id);
    }
}

export function initialize(params: StateData["channel_folders"]): void {
    channel_folder_name_dict = new FoldDict();
    channel_folder_by_id_dict = new Map<number, ChannelFolder>();
    active_channel_folder_ids = new Set<number>();

    for (const channel_folder of params.channel_folders) {
        add(channel_folder);
    }
}

export function get_channel_folders(include_archived = false): ChannelFolder[] {
    const channel_folders = [...channel_folder_by_id_dict.values()];
    return channel_folders
        .filter((channel_folder) => {
            if (!include_archived && channel_folder.is_archived) {
                return false;
            }

            return true;
        })
        .toSorted((folder_a, folder_b) => folder_a.order - folder_b.order);
}

export function get_active_folder_ids(): Set<number> {
    return active_channel_folder_ids;
}

export function get_all_folder_ids(): Set<number> {
    return new Set(channel_folder_by_id_dict.keys());
}

export function is_valid_folder_id(folder_id: number): boolean {
    return channel_folder_by_id_dict.has(folder_id);
}

export function get_channel_folder_by_id(folder_id: number): ChannelFolder {
    const channel_folder = channel_folder_by_id_dict.get(folder_id);
    assert(channel_folder !== undefined);
    return channel_folder;
}

// Number of ancestors above this folder: 0 for a top-level folder, 1 for a
// folder whose parent is top-level, and so on. Used to indent nested folder
// sections in the left sidebar.
export function get_channel_folder_depth(folder_id: number): number {
    let depth = 0;
    let folder = channel_folder_by_id_dict.get(folder_id);
    while (folder !== undefined && folder.parent_id !== null) {
        depth += 1;
        folder = channel_folder_by_id_dict.get(folder.parent_id);
    }
    return depth;
}

// Ids of every ancestor of this folder, nearest parent first. Used to roll up
// unread counts from a folder to all of its ancestors.
export function get_channel_folder_ancestor_ids(folder_id: number): number[] {
    const ancestor_ids: number[] = [];
    let folder = channel_folder_by_id_dict.get(folder_id);
    while (folder !== undefined && folder.parent_id !== null) {
        ancestor_ids.push(folder.parent_id);
        folder = channel_folder_by_id_dict.get(folder.parent_id);
    }
    return ancestor_ids;
}

// Active folders in depth-first pre-order: each folder is immediately followed
// by its descendants, with siblings ordered by their `order` field. This is the
// order folder sections should appear in the sidebar so that the nesting reads
// as a tree.
export function get_channel_folders_in_tree_order(): ChannelFolder[] {
    const folders_by_parent = new Map<number | null, ChannelFolder[]>();
    for (const folder of get_channel_folders()) {
        const siblings = folders_by_parent.get(folder.parent_id) ?? [];
        siblings.push(folder);
        folders_by_parent.set(folder.parent_id, siblings);
    }

    const ordered: ChannelFolder[] = [];
    const visit = (parent_id: number | null): void => {
        for (const folder of folders_by_parent.get(parent_id) ?? []) {
            ordered.push(folder);
            visit(folder.id);
        }
    };
    // A folder whose parent is archived (and thus absent from get_channel_folders)
    // would never be reached from the top-level walk, so collect any such
    // orphaned subtrees as additional roots.
    const reachable_parent_ids = new Set<number | null>([null]);
    visit(null);
    for (const folder of ordered) {
        reachable_parent_ids.add(folder.id);
    }
    for (const [parent_id, siblings] of folders_by_parent) {
        if (!reachable_parent_ids.has(parent_id)) {
            for (const folder of siblings) {
                ordered.push(folder);
                visit(folder.id);
            }
        }
    }
    return ordered;
}

// Ids of every folder nested anywhere beneath `folder_id` (children,
// grandchildren, and so on). Used to collapse/hide an entire subtree when its
// parent folder is collapsed in the sidebar.
export function get_channel_folder_descendant_ids(folder_id: number): number[] {
    const descendant_ids: number[] = [];
    for (const candidate of get_channel_folders()) {
        if (get_channel_folder_ancestor_ids(candidate.id).includes(folder_id)) {
            descendant_ids.push(candidate.id);
        }
    }
    return descendant_ids;
}

export function user_has_folders(): boolean {
    const subscribed_subs = stream_data.subscribed_subs();

    for (const sub of subscribed_subs) {
        if (sub.folder_id) {
            return true;
        }
    }

    return false;
}

export function update_channel_folder(
    folder_id: number,
    property: "name" | "description" | "rendered_description" | "is_archived" | "parent_id",
    value: string | boolean | number | null,
): void {
    const channel_folder = get_channel_folder_by_id(folder_id);

    if (property === "is_archived") {
        assert(typeof value === "boolean");
        channel_folder.is_archived = value;
        if (channel_folder.is_archived) {
            active_channel_folder_ids.delete(channel_folder.id);
        }
        return;
    }

    if (property === "parent_id") {
        assert(value === null || typeof value === "number");
        channel_folder.parent_id = value;
        return;
    }

    assert(typeof value === "string");
    const old_value = channel_folder[property];

    channel_folder[property] = value;

    if (property === "name") {
        channel_folder_name_dict.delete(old_value);
        channel_folder_name_dict.set(channel_folder.name, channel_folder);
    }

    if (property === "rendered_description") {
        clean_up_description(channel_folder);
    }
}

export function update(event: ChannelFolderUpdateEvent): void {
    const folder_id = event.channel_folder_id;
    if (event.data.name !== undefined) {
        update_channel_folder(folder_id, "name", event.data.name);
    }

    if (event.data.description !== undefined) {
        update_channel_folder(folder_id, "description", event.data.description);
        assert(event.data.rendered_description !== undefined);
        update_channel_folder(folder_id, "rendered_description", event.data.rendered_description);
    }

    if (event.data.is_archived !== undefined) {
        update_channel_folder(folder_id, "is_archived", event.data.is_archived);
    }

    if (event.data.parent_id !== undefined) {
        update_channel_folder(folder_id, "parent_id", event.data.parent_id);
    }
}

export function get_streams_in_folder(folder_id: number): StreamSubscription[] {
    const streams = stream_data.get_unsorted_subs().filter((sub) => sub.folder_id === folder_id);
    return streams;
}

export function get_sorted_streams_in_folder(folder_id: number): StreamSubscription[] {
    const streams = get_streams_in_folder(folder_id);
    streams.sort(compare_by_name);
    return streams;
}

export function get_stream_ids_in_folder(folder_id: number): number[] {
    const streams = get_streams_in_folder(folder_id);
    return streams.map((sub) => sub.stream_id);
}

export function get_channels_in_folders_matching_search_term_in_folder_name(
    search_term: string,
    all_subscribed_stream_ids: Set<number>,
): number[] {
    const channel_folders = get_channel_folders();
    const matching_channel_folders = util.filter_by_word_prefix_match(
        channel_folders,
        search_term,
        (channel_folder) => channel_folder.name,
    );

    const channel_ids: number[] = [];
    for (const channel_folder of matching_channel_folders) {
        for (const stream_id of get_stream_ids_in_folder(channel_folder.id)) {
            if (all_subscribed_stream_ids.has(stream_id)) {
                channel_ids.push(stream_id);
            }
        }
    }
    return channel_ids;
}

export function reorder(order: number[]): void {
    for (const [index, folder_id] of order.entries()) {
        const channel_folder = get_channel_folder_by_id(folder_id);
        channel_folder.order = index;
    }
}

export function get_folders_with_accessible_channels(): ChannelFolder[] {
    const all_subs = stream_data.get_unsorted_subs();

    const channel_folder_ids = new Set<number>();
    for (const sub of all_subs) {
        if (sub.folder_id !== null) {
            channel_folder_ids.add(sub.folder_id);
        }
    }

    // A parent folder in a nested tree has no directly-assigned channels but
    // should still count as having accessible channels when a descendant does,
    // so mark every ancestor of a folder that holds a channel.
    const folder_ids_with_direct_channels = [...channel_folder_ids];
    for (const folder_id of folder_ids_with_direct_channels) {
        for (const ancestor_id of get_channel_folder_ancestor_ids(folder_id)) {
            channel_folder_ids.add(ancestor_id);
        }
    }

    return get_channel_folders().filter((folder) => channel_folder_ids.has(folder.id));
}
