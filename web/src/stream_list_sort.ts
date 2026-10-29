import assert from "minimalistic-assert";

import * as channel_folders from "./channel_folders.ts";
import {$t} from "./i18n.ts";
import * as narrow_state from "./narrow_state.ts";
import * as settings_config from "./settings_config.ts";
import * as stream_data from "./stream_data.ts";
import * as sub_store from "./sub_store.ts";
import type {StreamSubscription} from "./sub_store.ts";
import * as topic_list_data from "./topic_list_data.ts";
import * as typeahead from "./typeahead.ts";
import {user_settings} from "./user_settings.ts";
import * as user_topics from "./user_topics.ts";
import * as util from "./util.ts";

let first_render_completed = false;
let current_sections: StreamListSection[] = [];
let all_rows: number[] = [];
// Will normal section be visible if search_term is empty with "other" title?
let other_section_visible_without_search_term = false;

// Because we need to check whether we are filtering inactive streams
// in a loop over all streams to render the left sidebar, and the
// definition of demote_inactive_streams involves how many streams
// there are, we maintain this variable as a cache of the calculation
// to avoid making left sidebar rendering a quadratic operation.
let filter_out_inactives = false;

export function get_stream_ids(): number[] {
    return [...all_rows];
}

export function section_ids(): string[] {
    return current_sections.map((section) => section.id);
}

export function get_current_sections(): StreamListSection[] {
    return current_sections;
}

function current_section_ids_for_streams(): Map<number, StreamListSection> {
    const map = new Map<number, StreamListSection>();
    for (const section of current_sections) {
        for (const stream_id of [
            ...section.default_visible_streams,
            ...section.muted_streams,
            ...section.inactive_streams,
        ]) {
            map.set(stream_id, section);
        }
    }
    return map;
}

// Will return undefined if the given stream isn't in the user's stream
// list (i.e. they're not subscribed to it).
export function current_section_id_for_stream(stream_id: number): string | undefined {
    // Warning: This function is O(n), so it should not be called in a loop.
    return current_section_ids_for_streams().get(stream_id)?.id;
}

function compare_function(a: number, b: number): number {
    const stream_a = sub_store.get(a);
    const stream_b = sub_store.get(b);

    const stream_name_a = stream_a ? stream_a.name : "";
    const stream_name_b = stream_b ? stream_b.name : "";

    return util.strcmp(stream_name_a, stream_name_b);
}

export function set_filter_out_inactives(): void {
    if (
        user_settings.demote_inactive_streams ===
        settings_config.demote_inactive_streams_values.automatic.code
    ) {
        filter_out_inactives = stream_data.num_subscribed_subs() >= 20;
    } else if (
        user_settings.demote_inactive_streams ===
        settings_config.demote_inactive_streams_values.always.code
    ) {
        filter_out_inactives = true;
    } else {
        filter_out_inactives = false;
    }
}

export function is_filtering_inactives(): boolean {
    return filter_out_inactives;
}

export function has_recent_activity(sub: StreamSubscription): boolean {
    if (!filter_out_inactives || sub.pin_to_top) {
        // If users don't want to filter inactive streams
        // to the bottom, we respect that setting and don't
        // treat any streams as dormant.
        //
        // Currently this setting is automatically determined
        // by the number of streams.  See the callers
        // to set_filter_out_inactives.
        return true;
    }
    return sub.is_recently_active || sub.newly_subscribed;
}

export type StreamListSection = {
    id: string;
    folder_id: number | null;
    section_title: string;
    default_visible_streams: number[];
    muted_streams: number[];
    inactive_streams: number[];
    order?: number; // Only used for folder sections
    // Nesting depth for folder sections: 0 for pinned/normal/top-level folders,
    // increasing by one per ancestor folder. Used to indent nested folders.
    depth: number;
    // True for a folder section that itself or any descendant folder contains
    // at least one channel. A parent folder with channels only in its children
    // uses this so it is not hidden/collapsed as "empty".
    subtree_has_streams?: boolean;
};

type StreamListSortResult = {
    same_as_before: boolean;
    sections: StreamListSection[];
};

export function sort_groups(
    all_subscribed_stream_ids: number[],
    search_term: string,
): StreamListSortResult {
    const pinned_section: StreamListSection = {
        id: "pinned-streams",
        folder_id: null,
        section_title: $t({defaultMessage: "PINNED CHANNELS"}),
        default_visible_streams: [],
        muted_streams: [],
        inactive_streams: [],
        depth: 0,
    };
    const normal_section: StreamListSection = {
        id: "normal-streams",
        folder_id: null,
        section_title: $t({defaultMessage: "CHANNELS"}),
        default_visible_streams: [],
        muted_streams: [],
        inactive_streams: [],
        depth: 0,
    };
    const NORMAL_SECTION_TITLE_WITH_OTHER_FOLDERS = $t({defaultMessage: "OTHER"});

    const show_all_channels = util.prefix_match({value: normal_section.section_title, search_term});
    const include_all_pinned_channels =
        show_all_channels || util.prefix_match({value: pinned_section.section_title, search_term});
    const search_term_prefix_matches_other_section_title =
        search_term &&
        other_section_visible_without_search_term &&
        util.prefix_match({value: NORMAL_SECTION_TITLE_WITH_OTHER_FOLDERS, search_term});

    const stream_id_to_name = (stream_id: number): string => sub_store.get(stream_id)!.name;
    const normalize = (s: string): string => s.replaceAll(/[:/_-]+/g, " ");
    const normalized_query = normalize(search_term);
    // Use -, _, : and / as word separators apart from the default space character
    let matching_stream_ids = show_all_channels
        ? all_subscribed_stream_ids
        : all_subscribed_stream_ids.filter((stream_id) => {
              const normalized_name = normalize(stream_id_to_name(stream_id));

              return typeahead.query_matches_string_in_any_order(
                  normalized_query,
                  normalized_name,
                  " ",
              );
          });

    const current_channel_id = narrow_state.stream_id(narrow_state.filter(), true);
    const current_topic_name = narrow_state.topic()?.toLowerCase();
    if (
        current_channel_id !== undefined &&
        stream_data.is_subscribed(current_channel_id) &&
        !matching_stream_ids.includes(current_channel_id)
    ) {
        // If any of the unmuted topics of the channel match the search
        // term, or a muted topic matches the current topic, we include
        // the channel in the list of matches.
        const topics = topic_list_data.get_filtered_topic_names(current_channel_id, (topic_names) =>
            topic_list_data.filter_topics_by_search_term(
                current_channel_id,
                topic_names,
                search_term,
            ),
        );
        if (
            topics.some(
                (topic) =>
                    topic.toLowerCase() === current_topic_name ||
                    !user_topics.is_topic_muted(current_channel_id, topic),
            )
        ) {
            matching_stream_ids.push(current_channel_id);
        }
    }

    // If the channel folder matches the search term, include all channels
    // of that folder.
    if (user_settings.web_left_sidebar_show_channel_folders && search_term) {
        matching_stream_ids = [
            ...new Set([
                ...matching_stream_ids,
                ...channel_folders.get_channels_in_folders_matching_search_term_in_folder_name(
                    search_term,
                    new Set(all_subscribed_stream_ids),
                ),
            ]),
        ];
    }

    const folder_sections = new Map<number, StreamListSection>();

    if (!show_all_channels && include_all_pinned_channels) {
        matching_stream_ids = [
            ...matching_stream_ids,
            ...all_subscribed_stream_ids.filter(
                (stream_id) => sub_store.get(stream_id)!.pin_to_top,
            ),
        ];
    }

    if (!show_all_channels && search_term_prefix_matches_other_section_title) {
        matching_stream_ids = [
            ...matching_stream_ids,
            ...all_subscribed_stream_ids.filter((stream_id) => {
                const is_pinned = sub_store.get(stream_id)!.pin_to_top;
                const is_in_folder =
                    user_settings.web_left_sidebar_show_channel_folders &&
                    sub_store.get(stream_id)!.folder_id !== null;
                return !is_pinned && !is_in_folder;
            }),
        ];
    }

    for (const stream_id of matching_stream_ids) {
        const sub = sub_store.get(stream_id);
        assert(sub);
        if (sub.is_archived) {
            continue;
        }
        if (sub.pin_to_top) {
            if (sub.is_muted) {
                pinned_section.muted_streams.push(stream_id);
            } else {
                // Inactive channels aren't treated differently when pinned,
                // since the user wants chose to put them in the pinned section.
                pinned_section.default_visible_streams.push(stream_id);
            }
        } else if (user_settings.web_left_sidebar_show_channel_folders && sub.folder_id) {
            const folder = channel_folders.get_channel_folder_by_id(sub.folder_id);
            let section = folder_sections.get(sub.folder_id);
            if (!section) {
                section = {
                    id: sub.folder_id.toString(),
                    folder_id: sub.folder_id,
                    section_title: folder.name.toUpperCase(),
                    default_visible_streams: [],
                    muted_streams: [],
                    inactive_streams: [],
                    order: folder.order,
                    depth: channel_folders.get_channel_folder_depth(sub.folder_id),
                };
                folder_sections.set(sub.folder_id, section);
            }
            if (!has_recent_activity(sub)) {
                section.inactive_streams.push(stream_id);
            } else if (sub.is_muted) {
                section.muted_streams.push(stream_id);
            } else {
                section.default_visible_streams.push(stream_id);
            }
        } else {
            if (!has_recent_activity(sub)) {
                normal_section.inactive_streams.push(stream_id);
            } else if (sub.is_muted) {
                normal_section.muted_streams.push(stream_id);
            } else {
                normal_section.default_visible_streams.push(stream_id);
            }
        }
    }

    function sort_by_order(folder_sections: StreamListSection[]): StreamListSection[] {
        return folder_sections.toSorted(
            (section_a, section_b) => section_a.order! - section_b.order!,
        );
    }

    // Build the folder sections in depth-first tree order so that a parent
    // folder is immediately followed by its descendants, producing a nested
    // (indented) tree in the sidebar. A folder that has no subscribed channels
    // of its own but does have descendants with channels still needs a section
    // to act as a collapsible header, so we materialize an empty placeholder
    // for every ancestor of a non-empty folder.
    const make_empty_folder_section = (folder_id: number): StreamListSection => {
        const folder = channel_folders.get_channel_folder_by_id(folder_id);
        return {
            id: folder_id.toString(),
            folder_id,
            section_title: folder.name.toUpperCase(),
            default_visible_streams: [],
            muted_streams: [],
            inactive_streams: [],
            order: folder.order,
            depth: channel_folders.get_channel_folder_depth(folder_id),
        };
    };

    const folder_ids_needing_section = new Set<number>();
    for (const folder_id of folder_sections.keys()) {
        folder_ids_needing_section.add(folder_id);
        for (const ancestor_id of channel_folders.get_channel_folder_ancestor_ids(folder_id)) {
            folder_ids_needing_section.add(ancestor_id);
        }
    }

    const build_section_for_folder = (folder_id: number): StreamListSection => {
        const section = folder_sections.get(folder_id) ?? make_empty_folder_section(folder_id);
        // Every folder in folder_ids_needing_section either has its own channels
        // or is an ancestor of a folder that does, so its subtree is non-empty
        // and the section should stay visible.
        section.subtree_has_streams = true;
        return section;
    };

    const regular_folder_sections: StreamListSection[] = [];
    const demoted_folder_sections: StreamListSection[] = [];
    if (user_settings.web_left_sidebar_show_channel_folders) {
        // Build folder sections in depth-first tree order (parent immediately
        // followed by its descendants) so the sidebar reads as an indented
        // tree. A folder with channels only in its descendants still needs a
        // section to act as a collapsible header, which is why every ancestor
        // of a non-empty folder is in folder_ids_needing_section.
        const children_by_parent = new Map<number | null, number[]>();
        for (const folder of channel_folders.get_channel_folders_in_tree_order()) {
            const siblings = children_by_parent.get(folder.parent_id) ?? [];
            siblings.push(folder.id);
            children_by_parent.set(folder.parent_id, siblings);
        }

        // Walk the tree in pre-order, emitting a section for each folder that
        // is part of a non-empty subtree. Returns the sections for the subtree
        // rooted at `folder_id` (root first), and whether that subtree has any
        // default-visible (active, unmuted) channel, used to decide root
        // demotion.
        const collect_subtree = (
            folder_id: number,
        ): {sections: StreamListSection[]; has_visible: boolean} => {
            const sections: StreamListSection[] = [];
            let has_visible = false;
            if (folder_ids_needing_section.has(folder_id)) {
                const section = build_section_for_folder(folder_id);
                sections.push(section);
                has_visible ||= section.default_visible_streams.length > 0;
            }
            for (const child_id of children_by_parent.get(folder_id) ?? []) {
                const child_result = collect_subtree(child_id);
                sections.push(...child_result.sections);
                has_visible ||= child_result.has_visible;
            }
            return {sections, has_visible};
        };

        // Root folders keep their subtree contiguous. A root whose entire
        // subtree has no active, unmuted channels is demoted below "OTHER",
        // matching the prior flat behavior for single folders.
        for (const root_id of children_by_parent.get(null) ?? []) {
            if (!folder_ids_needing_section.has(root_id)) {
                continue;
            }
            const {sections, has_visible} = collect_subtree(root_id);
            if (has_visible) {
                regular_folder_sections.push(...sections);
            } else {
                demoted_folder_sections.push(...sections);
            }
        }
    } else {
        // When folders are disabled, preserve the prior flat ordering by order.
        regular_folder_sections.push(...sort_by_order([...folder_sections.values()]));
    }

    if (
        pinned_section.default_visible_streams.length > 0 ||
        pinned_section.muted_streams.length > 0 ||
        pinned_section.inactive_streams.length > 0 ||
        folder_sections.size > 0 ||
        // To meet the user's expectation, we show "Other" as
        // section title if it matches the search term.
        search_term_prefix_matches_other_section_title
    ) {
        normal_section.section_title = NORMAL_SECTION_TITLE_WITH_OTHER_FOLDERS;

        if (search_term === "") {
            other_section_visible_without_search_term = true;
        }
    } else if (search_term === "") {
        other_section_visible_without_search_term = false;
    }

    // This needs to have the same ordering as the order they're displayed in the sidebar.
    const new_sections = [
        pinned_section,
        ...regular_folder_sections,
        normal_section,
        ...demoted_folder_sections,
    ];

    for (const section of new_sections) {
        section.default_visible_streams.sort(compare_function);
        section.muted_streams.sort(compare_function);
        section.inactive_streams.sort(compare_function);
    }

    const same_as_before =
        first_render_completed &&
        new_sections.entries().every(([i, new_section]) => {
            const current_section = current_sections.at(i);
            return (
                new_section.id === current_section?.id &&
                new_section.section_title === current_section.section_title &&
                util.array_compare(
                    new_section.default_visible_streams,
                    current_section.default_visible_streams,
                ) &&
                util.array_compare(new_section.muted_streams, current_section.muted_streams) &&
                util.array_compare(new_section.inactive_streams, current_section.inactive_streams)
            );
        });

    if (!same_as_before) {
        first_render_completed = true;
        current_sections = new_sections;
        all_rows = current_sections.flatMap((section) => [
            ...section.default_visible_streams,
            ...section.muted_streams,
            ...section.inactive_streams,
        ]);
    }

    return {
        same_as_before,
        sections: new_sections,
    };
}

export function initialize(): void {
    set_filter_out_inactives();
}
